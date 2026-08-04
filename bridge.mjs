#!/usr/bin/env node
/**
 * Aion Sincro — Terminal Bridge (Node, sin dependencias)
 * =======================================================
 * Ejecuta comandos en la MÁQUINA LOCAL y expone su salida a la app web.
 * MEDIDAS DE SEGURIDAD (por diseño):
 *   - Escucha SOLO en 127.0.0.1 (nunca expone la red local).
 *   - Valida el Host (debe ser 127.0.0.1/localhost) y el Origin de la petición
 *     (solo file://, localhost o 127.0.0.1; ninguna web externa puede usarlo).
 *   - Token opcional: si lo inicias con `--token CLAVE`, todas las peticiones
 *     deben incluirlo. La app lo guarda solo en tu navegador.
 *   - La app NO ejecuta nada automáticamente: cada comando requiere que pulses
 *     "Ejecutar" (o lo escribas tú en la pestaña Terminal).
 *
 * Uso:
 *     node bridge.mjs [--port 8765] [--token CLAVE]
 */
import http from "node:http";
import { spawn, execSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(argVal("--port", process.env.PORT || 8765));
// El token SIEMPRE se exige (seguro por defecto): si no se pasa uno, se genera.
const TOKEN = argVal("--token", process.env.TOKEN || "") || randomBytes(16).toString("hex");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Verificación de integridad (/integrity) ----------
// Patrones de claves reales: idénticos a test_app.js (mismo veredicto).
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}/g,
  /\bgsk_[A-Za-z0-9]{20,}/g,
  /\bhf_[A-Za-z0-9]{20,}/g,
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
];
// Claves conocidas del usuario para la suite anti-fugas. Se leen del archivo
// LOCAL .leaks.local.json (gitignored, nunca se sube al repo). Si no existe,
// el array queda vacío: el repo NO contiene ninguna clave, ni siquiera fragmentada.
const KNOWN_LEAKS = (() => {
  try {
    return JSON.parse(require('fs').readFileSync('.leaks.local.json', 'utf8')).claves || [];
  } catch (_) { return []; }
})();
const CODE_FILES = [
  "index.html", "bridge.py", "bridge.mjs", "piper_server.py", "proxy.py",
  "piper_compare.py", "windows/install.cmd", "windows/uninstall.cmd",
  "windows/aion-sincro.cmd", "windows/crear-acceso-directo.ps1",
  "windows/instalar-piper.cmd", "linux/install.sh", "linux/uninstall.sh",
  "linux/instalar-piper.sh",
];

function runSuite(cmd, timeoutMs = 30000) {
  try {
    const r = spawnSync(cmd[0], cmd.slice(1), {
      cwd: __dirname, encoding: "utf8", timeout: timeoutMs, shell: false,
    });
    const out = (r.stdout || "").trim();
    const lines = out.split("\n");
    const tail = lines[lines.length - 1] || "";
    return { ok: r.status === 0, detail: tail.slice(0, 200) || "sin salida" };
  } catch (e) {
    return { ok: false, detail: String(e).slice(0, 200) };
  }
}

function scanRepoSecrets() {
  const leaks = [];
  for (const f of CODE_FILES) {
    const p = path.join(__dirname, f);
    let content = "";
    try { content = fs.readFileSync(p, "utf8"); } catch { continue; }
    for (const rx of SECRET_PATTERNS) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(content)) !== null) leaks.push(`${f}: ${m[0].slice(0, 12)}…`);
    }
    for (const k of KNOWN_LEAKS) {
      if (content.includes(k)) leaks.push(`${f}: clave conocida ${k.slice(0, 8)}…`);
    }
  }
  return leaks;
}

function integrityQuick() {
  const checks = {};
  const r = runSuite(["node", "--check", "test_app.js"]);
  checks.app_js_syntax = { ok: r.ok, detail: r.detail };
  try {
    const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    const m = html.match(/<script>([\s\S]*)<\/script>/);
    const tmp = path.join(__dirname, ".integrity_tmp.mjs");
    fs.writeFileSync(tmp, m[1]);
    const r2 = runSuite(["node", "--check", tmp]);
    fs.unlinkSync(tmp);
    checks.app_html_syntax = { ok: r2.ok, detail: r2.detail };
  } catch (e) {
    checks.app_html_syntax = { ok: false, detail: String(e).slice(0, 200) };
  }
  const leaks = scanRepoSecrets();
  checks.secrets = { ok: leaks.length === 0, leaks: leaks.slice(0, 8) };
  return checks;
}

function integrityFull() {
  const checks = {};
  const r = runSuite(["node", "test_app.js"], 300000);
  checks.app = { ok: r.ok, detail: r.detail };
  const py = process.platform === "win32" ? "python" : "python3";
  const r2 = runSuite([py, "test_bridge.py"], 300000);
  checks.bridge = { ok: r2.ok, detail: r2.detail };
  const leaks = scanRepoSecrets();
  checks.secrets = { ok: leaks.length === 0, leaks: leaks.slice(0, 8) };
  return checks;
}

const originAllowed = (o) =>
  o == null ||
  o === "" ||
  o === "null" ||
  // Solo origenes EXACTOS localhost/127.0.0.1 (+ puerto). Bloquea
  // falsificaciones tipo http://localhost.evil.com (startswith era demasiado laxo).
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

const hostAllowed = (h) => {
  const s = (h || "").toLowerCase();
  // Mismo criterio exacto que el Origin: solo 127.0.0.1/localhost (+ puerto).
  // Rechaza Host falsificados tipo localhost.evil.com (DNS rebinding).
  return /^((localhost|127\.0\.0\.1)(:\d+)?)$/.test(s);
};

let proc = null;
const killProc = () => {
  if (proc && proc.exitCode === null) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
      } else {
        // Linux/macOS: matar a todo el grupo de procesos (shell + hijos)
        try { process.kill(-proc.pid, "SIGKILL"); } catch { proc.kill("SIGKILL"); }
      }
    } catch {}
    proc = null;
  }
};

http
  .createServer((req, res) => {
    if (!hostAllowed(req.headers.host) || !originAllowed(req.headers.origin)) {
      // Mismo criterio que bridge.py: Host Y Origin exactos (localhost/127.0.0.1).
      // Bloquea DNS rebinding (Host forjado) y CSRF desde webs externas (Origin forjado).
      res.writeHead(403);
      res.end();
      return;
    }
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    let body = "";
    let tooBig = false;
    req.on("data", (d) => {
      body += d;
      if (body.length > 1e6) { tooBig = true; body = ""; }
    });
    req.on("end", () => {
      if (tooBig) { res.writeHead(413); res.end(); return; }
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch {}

      // /ping no exige token para que la app pueda detectar el puente
      if (req.url === "/ping" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, name: "aion-sincro-bridge", version: "1.0" }));
        return;
      }

      if (data.token !== TOKEN) {
        res.writeHead(403);
        res.end();
        return;
      }

      if (req.url === "/kill" && req.method === "POST") {
        killProc();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
        return;
      }

      if (req.url === "/integrity" && req.method === "POST") {
        // Verificación de integridad del repo (exige token, como /run).
        const quick = data.quick !== false;
        const t0 = Date.now();
        const checks = quick ? integrityQuick() : integrityFull();
        const allOk = Object.values(checks).every((c) => c.ok === true);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: allOk, quick, checks, duration_ms: Date.now() - t0 }));
        return;
      }

      if (req.url === "/read" && req.method === "POST") {
        // Leer archivos del proyecto (relativo a __dirname).
        // Acepta:
        //   { "path": "ruta" }             → un archivo (retrocompatible)
        //   { "paths": ["ruta1", "ruta2"] }  → varios archivos
        //   { "lines": N }                  → opcional: solo las últimas N líneas (cola)
        //   { "offset": M }                 → opcional: saltar las primeras M líneas (>=0)
        // Seguridad: solo rutas relativas, sin '..', dentro de __dirname.
        // Defensa en profundidad: /read acepta EXCLUSIVAMENTE su contrato
        // (token/path/paths/lines/offset). Rechaza metadatos de historial
        // inyectados (history, messages, via, ts…) — espejo de cleanMsgs().
        const ALLOWED_READ = new Set(["token", "path", "paths", "lines", "offset"]);
        const extraRead = Object.keys(data).filter((k) => !ALLOWED_READ.has(k));
        if (extraRead.length > 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "campo no permitido en /read: " + extraRead.join(", ") }));
          return;
        }
        // Validar /lines/ (entero positivo, max 50000)
        let lines = data.lines;
        if (lines != null) {
          if (typeof lines === "boolean" || typeof lines !== "number" || !Number.isInteger(lines) || lines <= 0 || lines > 50000) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "lines debe ser entero entre 1 y 50000" }));
            return;
          }
        } else {
          lines = null;
        }
        // Validar /offset/ (entero >= 0, max 1e6)
        let offset = data.offset;
        if (offset != null) {
          if (typeof offset === "boolean" || typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 1000000) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "offset debe ser entero >= 0" }));
            return;
          }
        } else {
          offset = null;
        }
        if (Array.isArray(data.paths)) {
          // Array de paths
          if (data.paths.length === 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "paths vacio" }));
            return;
          }
          if (data.paths.length > 10) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "maximo 10 archivos" }));
            return;
          }
          const files = data.paths.map(rpath => _readSingleFile(String(rpath).trim(), lines, offset));
          const ok = files.every(f => f.ok);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok, files }));
          return;
        } else {
          // String único (retrocompatible)
          const rpath = String(data.path || "").trim();
          if (!rpath) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "path vacio" }));
            return;
          }
          const result = _readSingleFile(rpath, lines, offset);
          if (!result.ok) {
            const status = { "path vacio": 400, "ruta absoluta no permitida": 400, "path traversal no permitido": 400, "fuera del proyecto": 400, "archivo no encontrado": 404 }[result.error] || 500;
            res.writeHead(status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
          return;
        }

        function _readSingleFile(rpath, lines, offset) {
          if (!rpath) return { ok: false, error: "path vacio" };
          if (rpath.startsWith("/") || rpath.startsWith("\\\\") ||
              (rpath.length >= 2 && rpath[1] === ":")) {
            return { ok: false, error: "ruta absoluta no permitida" };
          }
          if (rpath.split(path.sep).includes("..")) {
            return { ok: false, error: "path traversal no permitido" };
          }
          const full = path.resolve(__dirname, rpath);
          if (!full.startsWith(path.resolve(__dirname) + path.sep)) {
            return { ok: false, error: "fuera del proyecto" };
          }
          try {
            const stat = fs.statSync(full);
            if (!stat.isFile()) {
              return { ok: false, error: "no es un archivo", path: rpath };
            }
            if (stat.size > 1_000_000) {
              return { ok: false, error: "archivo demasiado grande (max 1 MB)", path: rpath };
            }
            let content = fs.readFileSync(full, "utf8");
            if (content.includes("\x00")) {
              return { ok: false, error: "archivo binario no soportado", path: rpath };
            }
            // Recortar a las últimas N líneas y/o saltar las primeras M
            if (lines != null || offset != null) {
              let rawLines = content.split("\n");
              // Descartar el elemento vacío final si el archivo termina en salto
              // de línea (típico en logs): así "lines" cuenta líneas reales.
              if (rawLines.length && rawLines[rawLines.length - 1] === "") rawLines = rawLines.slice(0, -1);
              const total = rawLines.length; // total REAL del archivo (antes de offset)
              if (offset != null) rawLines = rawLines.slice(offset);
              if (lines != null) rawLines = rawLines.slice(-lines);
              content = rawLines.join("\n");
              return { ok: true, path: rpath, content, size: stat.size,
                       lines: rawLines.length, total_lines: total, tail: lines != null };
            }
            return { ok: true, path: rpath, content, size: stat.size };
          } catch (e) {
            if (e.code === "ENOENT") return { ok: false, error: "archivo no encontrado", path: rpath };
            if (e.code === "EACCES" || e.code === "EPERM") return { ok: false, error: "sin permiso para leer el archivo", path: rpath };
            return { ok: false, error: String(e.message || e).slice(0, 200), path: rpath };
          }
        }
        return;
      }

      if (req.url === "/run" && req.method === "POST") {
        // Defensa en profundidad: /run acepta EXCLUSIVAMENTE su contrato
        // (token/cmd). Rechaza metadatos de historial inyectados (history,
        // messages, via, ts…) — espejo de cleanMsgs(), igual que /read.
        const ALLOWED_RUN = new Set(["token", "cmd"]);
        const extraRun = Object.keys(data).filter((k) => !ALLOWED_RUN.has(k));
        if (extraRun.length > 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "campo no permitido en /run: " + extraRun.join(", ") }));
          return;
        }
        const cmd = typeof data.cmd === "string" ? data.cmd.trim() : "";
        if (!cmd) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end('{"ok":false,"error":"cmd vacío"}');
          return;
        }
        res.writeHead(200, {
          "Content-Type": "application/x-ndjson",
          "Transfer-Encoding": "chunked",
        });
        res.on("error", () => {});

        const isWin = process.platform === "win32";
        const shell = isWin
          ? { file: "cmd.exe", args: ["/d", "/s", "/c", cmd] }
          : { file: "/bin/sh", args: ["-c", cmd] };

        proc = spawn(shell.file, shell.args, {
          windowsVerbatimArguments: true,
          windowsHide: true,
          detached: process.platform !== "win32", // grupo propio en Linux/macOS
          stdio: ["ignore", "pipe", "pipe"], // stdin ignorado, como en bridge.py
        });

        // Node emite Buffer por defecto en 'data'; lo convertimos a texto
        // para poder partirlo por líneas sin TypeError.
        proc.stdout.setEncoding("utf8");
        proc.stderr.setEncoding("utf8");
        const emit = (s) => {
          const str = Buffer.isBuffer(s) ? s.toString("utf8") : String(s);
          for (const line of str.split("\n")) {
            if (line.trim() !== "") {
              try { res.write(JSON.stringify({ out: line.replace(/\r$/, "") }) + "\n"); } catch {}
            }
          }
        };
        proc.stdout.on("data", emit);
        proc.stderr.on("data", emit);
        // Robustez: si una tubería del proceso hijo falla (proceso cerrado,
        // consola, permisos…), el puente NO debe caerse. Capturamos los
        // eventos de error de las tuberías y del propio spawn.
        proc.stdout.on("error", () => {});
        proc.stderr.on("error", () => {});
        proc.on("error", (e) => {
          try {
            res.end(JSON.stringify({ exit: -1, error: String((e && e.message) || e) }) + "\n");
          } catch {}
          proc = null;
        });
        proc.on("close", (code) => {
          try { res.end(JSON.stringify({ exit: code }) + "\n"); } catch {}
          proc = null;
        });
        // Si el cliente cierra la pestaña, no dejamos procesos huérfanos.
        res.on("close", () => killProc());
        return;
      }

      res.writeHead(404);
      res.end();
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`Aion Sincro Bridge escuchando en http://127.0.0.1:${PORT}`);
    console.log("=" .repeat(60));
    console.log(`  TOKEN DE CONEXIÓN: ${TOKEN}`);
    console.log("  Pégalo en Ajustes → Terminal local → Token del puente");
    console.log("=" .repeat(60));
    console.log("  (solo 127.0.0.1 · el token es obligatorio en cada petición)");
    console.log("  Ctrl+C para detener");
  });

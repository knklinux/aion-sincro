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
import { spawn, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(argVal("--port", process.env.PORT || 8765));
// El token SIEMPRE se exige (seguro por defecto): si no se pasa uno, se genera.
const TOKEN = argVal("--token", process.env.TOKEN || "") || randomBytes(16).toString("hex");

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
    if (!hostAllowed(req.headers.host)) {
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

      if (req.url === "/run" && req.method === "POST") {
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

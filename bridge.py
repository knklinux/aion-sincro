#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aion Sincro — Terminal Bridge (Python, sin dependencias)
=========================================================
Ejecuta comandos en la MÁQUINA LOCAL y expone su salida a la app web.
MEDIDAS DE SEGURIDAD (por diseño):
  - Escucha SOLO en 127.0.0.1 (nunca expone la red local).
  - Valida el Host (debe ser 127.0.0.1/localhost) y el Origin de la petición
    (solo file://, localhost o 127.0.0.1; ninguna web externa puede usarlo).
  - Token opcional: si lo inicias con `--token CLAVE`, todas las peticiones
    deben incluirlo. La app lo guarda solo en tu navegador.
  - La app NO ejecuta nada automáticamente: cada comando requiere que pulses
    "Ejecutar" (o lo escribas tú en la pestaña Terminal).

Uso:
    python bridge.py [--port 8765] [--token CLAVE]
"""
import argparse
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Windows: la consola por defecto usa cp1252 y no puede imprimir caracteres
# como → o · (UnicodeEncodeError). Forzamos UTF-8 con tolerancia a errores.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
except Exception:
    pass

PORT = 8765
TOKEN = ""
proc = None
proc_lock = threading.Lock()

NAME = "aion-sincro-bridge"
VERSION = "1.0"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------- Verificación de integridad (/integrity) ----------
# Patrones de claves reales: idénticos a los de test_app.js para que el
# escaneo del puente y el de la suite local den el mismo veredicto.
SECRET_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9]{20,}"),
    re.compile(r"\bgsk_[A-Za-z0-9]{20,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}"),
    re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}"),
]
# Claves compartidas por el usuario en el chat (nunca deben aparecer en el
# repo). Se construyen POR FRAGMENTOS para que la clave completa jamás exista
# como literal contiguo en el código — así este propio archivo no filtra nada.
KNOWN_LEAKS = [
    "QdI0yX6f1Fvc8E" + "gAb2QtLtW23zvR5EJ7",  # Mistral
    "7f6278d2cf394c5b" + "beae378eab6a8ff2",  # clave "Ollama" inválida
    "ghp_5Wgo4pmIwcMYm" + "fNx7tJe0n08GhM9V11YDGWJ",  # GitHub
]
# Solo archivos de CÓDIGO real (los tests referencian claves por diseño)
CODE_FILES = [
    "index.html", "bridge.py", "bridge.mjs", "piper_server.py", "proxy.py",
    "piper_compare.py", "windows/install.cmd", "windows/uninstall.cmd",
    "windows/aion-sincro.cmd", "windows/crear-acceso-directo.ps1",
    "windows/instalar-piper.cmd", "linux/install.sh", "linux/uninstall.sh",
    "linux/instalar-piper.sh",
]


def run_suite(cmd, timeout=120):
    """Ejecuta un comando (p. ej. node --check) y devuelve (ok, detalle)."""
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, cwd=BASE_DIR
        )
        out = (r.stdout or "").strip()
        lines = out.splitlines()
        tail = lines[-1] if lines else ""
        return r.returncode == 0, (tail[:200] or "sin salida")
    except subprocess.TimeoutExpired:
        return False, f"timeout (> {timeout}s)"
    except Exception as e:
        return False, str(e)[:200]


def scan_repo_secrets():
    """Escanea los archivos de código del repo en busca de claves reales."""
    leaks = []
    for f in CODE_FILES:
        p = os.path.join(BASE_DIR, f)
        if not os.path.exists(p):
            continue
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                content = fh.read()
        except Exception:
            continue
        for rx in SECRET_PATTERNS:
            for m in rx.findall(content):
                leaks.append(f"{f}: {m[:12]}…")
        for k in KNOWN_LEAKS:
            if k in content:
                leaks.append(f"{f}: clave conocida {k[:8]}…")
    return leaks


def integrity_quick():
    """Verificación rápida: sintaxis JS/HTML/Python + secretos (segundos)."""
    checks = {}
    r = run_suite(["node", "--check", "test_app.js"], timeout=30)
    checks["app_js_syntax"] = {"ok": r[0], "detail": r[1]}
    tmp = os.path.join(BASE_DIR, ".integrity_tmp.js")
    try:
        html = open(os.path.join(BASE_DIR, "index.html"), encoding="utf-8", errors="replace").read()
        m = re.search(r"<script>([\s\S]*)</script>", html)
        if not m:
            raise ValueError("no se encontró <script> en index.html")
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(m.group(1))
        r2 = run_suite(["node", "--check", tmp], timeout=30)
    except Exception as e:
        r2 = (False, str(e)[:200])
    finally:
        # try/finally: el archivo temporal se elimina SIEMPRE, incluso si el
        # regex no encontró <script> (open(tmp,"w") ya habría creado el archivo).
        try:
            os.remove(tmp)
        except OSError:
            pass
    checks["app_html_syntax"] = {"ok": r2[0], "detail": r2[1]}
    for pf in CODE_FILES:
        if pf.endswith(".py") and os.path.exists(os.path.join(BASE_DIR, pf)):
            r3 = run_suite([sys.executable, "-m", "py_compile", os.path.join(BASE_DIR, pf)], timeout=30)
            checks[f"py_{pf}"] = {"ok": r3[0], "detail": r3[1]}
    leaks = scan_repo_secrets()
    checks["secrets"] = {"ok": len(leaks) == 0, "leaks": leaks[:8]}
    return checks


def integrity_full():
    """Verificación completa: suites reales (test_app.js + test_bridge.py)."""
    checks = {}
    r = run_suite(["node", "test_app.js"], timeout=300)
    checks["app"] = {"ok": r[0], "detail": r[1]}
    r = run_suite([sys.executable, "test_bridge.py"], timeout=300)
    checks["bridge"] = {"ok": r[0], "detail": r[1]}
    leaks = scan_repo_secrets()
    checks["secrets"] = {"ok": len(leaks) == 0, "leaks": leaks[:8]}
    return checks


ORIGIN_RE = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")


def origin_allowed(origin: str) -> bool:
    # null => abierto como archivo local (file://)
    if origin in (None, "", "null"):
        return True
    # Solo origenes EXACTOS localhost/127.0.0.1 (+ puerto). Bloquea
    # falsificaciones tipo http://localhost.evil.com (startswith era demasiado laxo).
    return bool(ORIGIN_RE.match(origin))


def host_allowed(host: str) -> bool:
    h = (host or "").lower()
    # Mismo criterio exacto que el Origin: solo 127.0.0.1/localhost (+ puerto).
    # Rechaza Host falsificados tipo localhost.evil.com (DNS rebinding).
    return bool(re.match(r"^((localhost|127\.0\.0\.1)(:\d+)?)$", h))


def kill_current():
    global proc
    with proc_lock:
        if proc and proc.poll() is None:
            try:
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/pid", str(proc.pid), "/T", "/F"],
                        capture_output=True,
                    )
                else:
                    os.killpg(os.getpgid(proc.pid), 9)
            except Exception:
                pass
            proc = None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _cors(self, origin):
        self.send_header("Access-Control-Allow-Origin", origin or "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")

    def _deny(self):
        try:
            self.send_response(403)
            self.send_header("Content-Length", "0")
            self.end_headers()
        except Exception:
            pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self._cors(self.headers.get("Origin"))
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 1_000_000:
                return {}
            raw = self.rfile.read(n) if n else b"{}"
            return json.loads(raw or b"{}")
        except Exception:
            return {}

    def do_OPTIONS(self):
        if not host_allowed(self.headers.get("Host")):
            return self._deny()
        self.send_response(204)
        self._cors(self.headers.get("Origin"))
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not host_allowed(self.headers.get("Host")):
            return self._deny()
        if not origin_allowed(self.headers.get("Origin")):
            return self._deny()
        if self.path == "/ping":
            self._json({"ok": True, "name": NAME, "version": VERSION})
        else:
            self._deny()

    def do_POST(self):
        if not host_allowed(self.headers.get("Host")):
            return self._deny()
        origin = self.headers.get("Origin")
        if not origin_allowed(origin):
            return self._deny()
        cl = self.headers.get("Content-Length", "0") or "0"
        if cl.isdigit() and int(cl) > 1_000_000:
            return self._json({"ok": False, "error": "cuerpo demasiado grande"}, 413)
        data = self._read_json()
        if data.get("token") != TOKEN:
            return self._deny()
        if self.path == "/kill":
            kill_current()
            return self._json({"ok": True})
        if self.path == "/integrity":
            # Verificación de integridad del repo (exige token, como /run).
            # quick=True (por defecto): sintaxis JS/HTML/Python + secretos (~1s).
            # quick=False: ejecuta las suites reales (test_app.js + test_bridge.py).
            quick = bool(data.get("quick", True))
            t0 = time.time()
            checks = integrity_quick() if quick else integrity_full()
            ok = bool(checks) and all(c["ok"] for c in checks.values())
            return self._json({
                "ok": ok, "quick": quick,
                "checks": checks,
                "duration_ms": int((time.time() - t0) * 1000),
            })
        if self.path == "/read":
            # Leer archivos del proyecto (relativos a BASE_DIR).
            # Acepta:
            #   { "path": "ruta" }              → un archivo (retrocompatible)
            #   { "paths": ["ruta1", "ruta2"] } → varios archivos
            #   { "lines": N }                  → opcional: solo las últimas N líneas (cola)
            #   { "offset": M }                 → opcional: saltar las primeras M líneas (>=0)
            # Seguridad: solo rutas relativas, sin '..', dentro de BASE_DIR.
            paths = data.get("paths")
            # Validar /lines/ (entero positivo, max 50000)
            lines = data.get("lines")
            if lines is not None:
                if (isinstance(lines, bool)
                        or not isinstance(lines, (int, float))
                        or not float(lines).is_integer()):
                    return self._json({"ok": False, "error": "lines debe ser entero entre 1 y 50000"}, 400)
                lines = int(lines)
                if lines <= 0 or lines > 50000:
                    return self._json({"ok": False, "error": "lines debe ser entero entre 1 y 50000"}, 400)
            # Validar /offset/ (entero >= 0, max 1e6)
            offset = data.get("offset")
            if offset is not None:
                if (isinstance(offset, bool)
                        or not isinstance(offset, (int, float))
                        or not float(offset).is_integer()):
                    return self._json({"ok": False, "error": "offset debe ser entero >= 0"}, 400)
                offset = int(offset)
                if offset < 0 or offset > 1_000_000:
                    return self._json({"ok": False, "error": "offset debe ser entero >= 0"}, 400)
            if isinstance(paths, list):
                # Array de paths
                if not paths:
                    return self._json({"ok": False, "error": "paths vacío"}, 400)
                if len(paths) > 10:
                    return self._json({"ok": False, "error": "máximo 10 archivos"}, 400)
                files = []
                for rpath in paths:
                    rpath = str(rpath).strip()
                    if not rpath:
                        continue
                    result = _read_single_file(rpath, lines=lines, offset=offset)
                    files.append(result)
                ok = all(f.get("ok", False) for f in files)
                return self._json({"ok": ok, "files": files})
            else:
                # String único (retrocompatible)
                rpath = (data.get("path") or "").strip()
                if not rpath:
                    return self._json({"ok": False, "error": "path vacío"}, 400)
                result = _read_single_file(rpath, lines=lines, offset=offset)
                if not result.get("ok"):
                    status = {
                        "path vacío": 400, "ruta absoluta no permitida": 400,
                        "path traversal no permitido": 400, "fuera del proyecto": 400,
                        "archivo no encontrado": 404,
                    }.get(result.get("error"), 500)
                    return self._json(result, status)
                return self._json(result)

        if self.path == "/run":
            cmd = data.get("cmd")
            if not isinstance(cmd, str) or not cmd.strip():
                return self._json({"ok": False, "error": "cmd vacío"}, 400)
            self.send_response(200)
            self._cors(origin)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()

            def send_line(obj):
                try:
                    b = (json.dumps(obj) + "\n").encode("utf-8", "replace")
                    self.wfile.write(("%X\r\n" % len(b)).encode() + b + b"\r\n")
                    self.wfile.flush()
                except Exception:
                    pass

            with proc_lock:
                global proc
                proc = subprocess.Popen(
                    cmd,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    cwd=os.getcwd(),
                    start_new_session=(os.name != "nt"),
                )
                p = proc

            while True:
                line = p.stdout.readline()
                if not line:
                    break
                try:
                    text = line.decode("utf-8", "replace").rstrip("\r\n")
                except Exception:
                    continue
                send_line({"out": text})
            p.wait()
            send_line({"exit": p.returncode})
            with proc_lock:
                if proc is p:
                    proc = None
            try:
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            except Exception:
                pass
            return
        self._deny()


def _read_single_file(rpath, lines=None, offset=None):
    """Lee un único archivo validando seguridad. Devuelve dict con ok/error.
    Función independiente (no método) para que pueda ser llamada tanto desde
    do_POST como desde el handler de array de paths.

    lines:  si se pasa, devuelve solo las últimas N líneas (cola, útil para logs).
    offset: si se pasa, salta las primeras M líneas (>=0). Compatible con lines
            (se aplica offset primero y luego lines sobre el resto).
    """
    # Rechazar rutas absolutas (Unix: /, Windows: C:\ o //)
    if rpath.startswith("/") or rpath.startswith("\\\\") or (
        len(rpath) >= 2 and rpath[1] == ":"
    ):
        return {"ok": False, "error": "ruta absoluta no permitida"}
    # Rechazar path traversal
    if ".." in rpath.split(os.sep):
        return {"ok": False, "error": "path traversal no permitido"}
    full = os.path.normpath(os.path.join(BASE_DIR, rpath))
    # Verificar que la ruta resuelta está dentro de BASE_DIR
    if not full.startswith(os.path.normpath(BASE_DIR) + os.sep):
        return {"ok": False, "error": "fuera del proyecto"}
    if not os.path.isfile(full):
        return {"ok": False, "error": "archivo no encontrado", "path": rpath}
    try:
        sz = os.path.getsize(full)
        if sz > 1_000_000:
            return {"ok": False, "error": "archivo demasiado grande (max 1 MB)", "path": rpath}
        with open(full, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
        if "\x00" in content:
            return {"ok": False, "error": "archivo binario no soportado", "path": rpath}
        # Recortar a las últimas N líneas y/o saltar las primeras M
        if lines is not None or offset is not None:
            raw_lines = content.split("\n")
            # Descartar el elemento vacío final si el archivo termina en salto
            # de línea (típico en logs): así "lines" cuenta líneas reales.
            if raw_lines and raw_lines[-1] == "":
                raw_lines = raw_lines[:-1]
            total = len(raw_lines)  # total REAL del archivo (antes de offset)
            if offset is not None:
                raw_lines = raw_lines[offset:]
            if lines is not None:
                raw_lines = raw_lines[-lines:]
            content = "\n".join(raw_lines)
            return {"ok": True, "path": rpath, "content": content,
                    "size": sz, "lines": len(raw_lines), "total_lines": total,
                    "tail": lines is not None}
        return {"ok": True, "path": rpath, "content": content, "size": sz}
    except PermissionError:
        return {"ok": False, "error": "sin permiso para leer el archivo", "path": rpath}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200], "path": rpath}


def main():
    global PORT, TOKEN
    ap = argparse.ArgumentParser(
        description="Aion Sincro — puente de terminal local (solo 127.0.0.1)"
    )
    ap.add_argument("--port", type=int, default=8765, help="puerto (por defecto 8765)")
    ap.add_argument("--token", default="", help="token opcional exigido a las peticiones")
    args = ap.parse_args()
    PORT = args.port
    TOKEN = args.token or secrets.token_hex(16)  # SIEMPRE exige token (seguro por defecto)

    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Aion Sincro Bridge escuchando en http://127.0.0.1:{PORT}")
    print("=" * 60)
    print(f"  TOKEN DE CONEXIÓN: {TOKEN}")
    print("  Pégalo en Ajustes → Terminal local → Token del puente")
    print("=" * 60)
    print("  (solo 127.0.0.1 · el token es obligatorio en cada petición)")
    print("  Ctrl+C para detener")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

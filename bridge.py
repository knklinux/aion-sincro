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

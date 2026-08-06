#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""serve.py — mini servidor web estático de Aion Sincro.

Uso:  python serve.py [puerto]      (por defecto 8080)
Sirve SOLO en 127.0.0.1 (necesario para el micrófono / Web Speech).
Es el servidor preferido del lanzador windows/aion-sincro.cmd.

DIFERENCIA CLAVE con `python -m http.server`: añade la cabecera
`Cache-Control: no-cache` a TODAS las respuestas para que el navegador
(Edge/Chrome) SIEMPRE revalide con el servidor (If-Modified-Since) antes
de usar su caché. Sin ella, Edge aplica caché heurística y puede seguir
sirviendo una versión vieja de index.html aunque la app se haya actualizado.
"""
import functools
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
# Host opcional (Docker usa 0.0.0.0); por defecto SOLO local (micrófono)
HOST = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        # Forzar revalidación SIEMPRE: el navegador pregunta al servidor
        # en cada carga y recibe 304 (sin cambios) o 200 (versión nueva).
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


# Silenciar el log de cada petición (el launcher lo lanza minimizado)
class QuietServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass


def main():
    handler = functools.partial(NoCacheHandler, directory=".")
    try:
        httpd = QuietServer((HOST, PORT), handler)
    except OSError as e:
        print(f"[serve.py] ERROR: no puedo escuchar en {HOST}:{PORT} — {e}", file=sys.stderr)
        sys.exit(1)
    print(f"Aion Sincro Web en http://{HOST}:{PORT}/ (Cache-Control: no-cache)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

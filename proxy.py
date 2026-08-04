#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aion Sincro — Key Proxy (Python, sin dependencias)
====================================================
Proxy LOCAL OPCIONAL que mantiene tus API keys FUERA del navegador.

La app web habla con este proxy (http://127.0.0.1:8797) y el proxy inyecta
la cabecera Authorization con tu clave ANTES de reenviar la petición al
proveedor real (Mistral / Groq / OpenRouter / HuggingFace). Las claves
NUNCA viajan al navegador ni se guardan en su localStorage.

MEDIDAS DE SEGURIDAD (por diseño):
  - Escucha SOLO en 127.0.0.1 (nunca expone la red local).
  - Valida el Host y el Origin exactamente igual que bridge.py
    (solo localhost/127.0.0.1; ninguna web externa puede usarlo).
  - Token opcional `--token CLAVE`: si lo usas, cada petición a /v1/*
    y /providers debe incluirlo. Sin token, el proxy solo responde /ping.
  - Las claves se cargan del lado del servidor:
      * Variables de entorno: MISTRAL_API_KEY, GROQ_API_KEY,
        OPENROUTER_API_KEY, HF_TOKEN.
      * O un archivo local keys.json ({"mistral": "...", ...}) con
        permisos restringidos (chmod 600 en Linux/macOS).
  - El proxy NUNCA devuelve las claves al navegador: /providers solo
    informa qué proveedores tienen clave configurada (booleanos).
  - Body limitado a 1 MB y tiempo máximo de reenvío de 90 s.

Uso:
    MISTRAL_API_KEY=... GROQ_API_KEY=... python proxy.py
    # o con archivo de claves local:
    python proxy.py --keys keys.json
    # con token opcional:
    python proxy.py --keys keys.json --token MI_TOKEN
"""
import argparse
import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
except Exception:
    pass

PORT = 8797
TOKEN = ""
KEYS = {}  # provider -> clave (solo en memoria del proceso)
NAME = "aion-sincro-proxy"
VERSION = "1.0"
MAX_BODY = 1_000_000  # 1 MB
UPSTREAM_TIMEOUT = 90  # segundos

# Reutilizamos las mismas funciones puras de validación que bridge.py
# (defensa en profundidad idéntica: Host y Origin exactos).
from bridge import origin_allowed, host_allowed  # noqa: E402

# Proveedores remotos con su URL base y la variable de entorno asociada.
PROVIDERS = {
    "groq": {
        "base": "https://api.groq.com/openai/v1",
        "env": ["GROQ_API_KEY", "GROQ_KEY"],
    },
    "openrouter": {
        "base": "https://openrouter.ai/api/v1",
        "env": ["OPENROUTER_API_KEY", "OPENROUTER_KEY"],
    },
    "huggingface": {
        "base": "https://api-inference.huggingface.co",
        "env": ["HF_TOKEN", "HUGGINGFACE_TOKEN"],
    },
    "mistral": {
        "base": "https://api.mistral.ai/v1",
        "env": ["MISTRAL_API_KEY", "MISTRAL_KEY"],
    },
}

MISTRAL_TTS_URL = "https://api.mistral.ai/v1/audio/speech"
MISTRAL_TTS_MODEL = "voxtral-mini-tts-latest"


def load_keys(keys_file=None):
    """Carga las claves SOLO del lado del servidor (env vars o archivo local)."""
    keys = {}
    for prov, cfg in PROVIDERS.items():
        for var in cfg["env"]:
            v = (os.environ.get(var) or "").strip()
            if v:
                keys[prov] = v
                break
    if keys_file and os.path.isfile(keys_file):
        try:
            with open(keys_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            for prov in PROVIDERS:
                v = (data.get(prov) or "").strip()
                if v:
                    keys[prov] = v
        except Exception as e:
            print(f"[proxy] aviso: no se pudo leer {keys_file}: {e}")
    return keys


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # ---- utilidades -------------------------------------------------------
    def log_message(self, fmt, *args):
        pass  # silencioso: el log por defecto solo contiene la línea de request (sin claves)
               # pero preferimos no imprimir nada por estética

    # Cabeceras de seguridad en TODAS las respuestas (incluidas 4xx/5xx):
    # se inyectan en end_headers(), que se llama siempre antes de enviar el body.
    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        # CSP estricta: el proxy solo reenvía JSON/SSE al frontend, no renderiza
        # HTML ni carga recursos. frame-ancestors 'none' + default-src 'none'
        # bloquean incrustación y ejecución de contenido inyectado.
        self.send_header(
            "Content-Security-Policy",
            "default-src 'none'; connect-src 'self'; frame-ancestors 'none'; "
            "base-uri 'none'; form-action 'none'; object-src 'none'",
        )
        super().end_headers()

    def _deny(self):
        try:
            self.send_response(403)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b'{"ok": false}')))
            self.end_headers()
            self.wfile.write(b'{"ok": false}')
        except Exception:
            pass

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            pass

    def _check(self):
        """Valida Host + Origin + token (X-Proxy-Token). True si la petición pasa."""
        if not host_allowed(self.headers.get("Host", "")):
            return False
        if not origin_allowed(self.headers.get("Origin", "")):
            return False
        if TOKEN:
            # comparación en tiempo constante, igual que piper_server.py
            return secrets.compare_digest(self.headers.get("X-Proxy-Token", ""), TOKEN)
        return True

    # ---- rutas ------------------------------------------------------------
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/ping":
            # /ping es libre (como en bridge.py): no revela claves, solo
            # qué proveedores están configurados (booleanos).
            if not host_allowed(self.headers.get("Host", "")) or not origin_allowed(
                self.headers.get("Origin", "")
            ):
                self._deny()
                return
            self._json(
                {
                    "ok": True,
                    "name": NAME,
                    "version": VERSION,
                    "providers": {p: bool(KEYS.get(p)) for p in PROVIDERS},
                }
            )
            return
        if path == "/providers":
            if not self._check():
                self._deny()
                return
            self._json({"ok": True, "providers": {p: bool(KEYS.get(p)) for p in PROVIDERS}})
            return
        if path == "/v1/models":
            # Lista los modelos del proveedor SIN exponer el catálogo completo
            # en el navegador: la llamada al proveedor sale del proxy, con la
            # clave solo en el lado del servidor.
            if not self._check():
                self._deny()
                return
            provider = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get(
                "provider", [""]
            )[0].strip()
            if provider not in PROVIDERS:
                self._json({"ok": False, "error": f"proveedor desconocido: {provider}"}, 400)
                return
            key = KEYS.get(provider)
            if not key:
                self._json(
                    {"ok": False, "error": f"no hay clave configurada para {provider} "
                                           "(usa env vars o keys.json)"},
                    502,
                )
                return
            if provider == "huggingface":
                url = f"{PROVIDERS['huggingface']['base']}/models?limit=50&sort=trendingScore&direction=-1"
            else:
                url = f"{PROVIDERS[provider]['base']}/models"
            try:
                req = urllib.request.Request(
                    url, headers={"Authorization": "Bearer " + key, "Accept": "application/json"}
                )
                upstream = urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT)
                raw = upstream.read().decode("utf-8", errors="replace")
                data = json.loads(raw)
                ids = (
                    data.get("data", [])
                    if isinstance(data, dict)
                    else data
                )
                models = []
                for m in ids:
                    mid = m.get("id") if isinstance(m, dict) else str(m)
                    if mid:
                        models.append(mid)
                self._json({"ok": True, "provider": provider, "models": models})
            except urllib.error.HTTPError as e:
                detail = b""
                try:
                    detail = e.read()
                except Exception:
                    pass
                self._json(
                    {"ok": False, "error": f"el proveedor respondió {e.code}: "
                                           + detail.decode("utf-8", errors="replace")[:300]},
                    e.code if e.code < 600 else 502,
                )
            except Exception as e:
                self._json({"ok": False, "error": str(e)[:300]}, 502)
            return
        self._deny()

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path not in ("/v1/chat/completions", "/v1/audio/speech"):
            self._deny()
            return
        if not self._check():
            self._deny()
            return
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            # Drenar TODO el body antes de responder 400: si el servidor responde
            # sin leerlo, Windows cierra con RST (WinError 10053) y el cliente
            # pierde la respuesta (status 0). El test 4.15 lo valida.
            try:
                rest = max(length, 0)
                while rest > 0:
                    chunk = self.rfile.read(min(rest, 65536))
                    if not chunk:
                        break
                    rest -= len(chunk)
            except Exception:
                pass
            self._json({"ok": False, "error": "cuerpo inválido o demasiado grande"}, 400)
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._json({"ok": False, "error": "JSON inválido"}, 400)
            return
        if path == "/v1/audio/speech":
            self._proxy_tts(payload)
        else:
            self._proxy_chat(payload)

    # ---- reenvíos ---------------------------------------------------------
    def _forward_stream(self, url, body, headers):
        """Reenvía con STREAMING real: escribe los chunks a medida que llegan
        del proveedor (SSE), sin esperar la respuesta completa."""
        try:
            req = urllib.request.Request(
                url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST"
            )
            upstream = urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT)
            ctype = upstream.headers.get("Content-Type", "text/event-stream")
            try:
                self.send_response(upstream.status)
                self.send_header("Content-Type", ctype)
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.end_headers()
            except Exception:
                return
            try:
                while True:
                    chunk = upstream.read(8192)
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                        self.wfile.flush()
                    except Exception:
                        break
            finally:
                upstream.close()
        except urllib.error.HTTPError as e:
            detail = b""
            try:
                detail = e.read()
            except Exception:
                pass
            try:
                self.send_response(e.code)
                self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(detail)))
                self.end_headers()
                self.wfile.write(detail)
            except Exception:
                pass
        except Exception as e:
            self._json({"ok": False, "error": str(e)[:300]}, 502)

    # ---- reenvíos ---------------------------------------------------------
    def _proxy_chat(self, payload):
        provider = (payload.get("provider") or "").strip()
        if provider not in PROVIDERS:
            self._json({"ok": False, "error": f"proveedor desconocido: {provider}"}, 400)
            return
        key = KEYS.get(provider)
        if not key:
            self._json(
                {"ok": False, "error": f"no hay clave configurada para {provider} "
                                       "(usa env vars o keys.json)"},
                502,
            )
            return
        model = (payload.get("model") or "").strip()
        messages = payload.get("messages")
        if not model or not isinstance(messages, list) or not messages:
            self._json({"ok": False, "error": "faltan model/messages"}, 400)
            return
        if provider == "huggingface":
            url = f"{PROVIDERS['huggingface']['base']}/models/{urllib.parse.quote(model)}/v1/chat/completions"
        else:
            url = f"{PROVIDERS[provider]['base']}/chat/completions"
        body = {
            "model": model,
            "messages": messages,
            "stream": bool(payload.get("stream", False)),
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + key,
        }
        if provider == "openrouter":
            headers["HTTP-Referer"] = "https://aionsincro.local"
            headers["X-Title"] = "Aion Sincro"
        if body.get("stream"):
            self._forward_stream(url, body, headers)
        else:
            self._forward(url, body, headers)

    def _proxy_tts(self, payload):
        key = KEYS.get("mistral")
        if not key:
            self._json(
                {"ok": False, "error": "no hay clave Mistral configurada (MISTRAL_API_KEY o keys.json)"},
                502,
            )
            return
        text = (payload.get("input") or "").strip()
        voice = (payload.get("voice") or "").strip()
        if not text:
            self._json({"ok": False, "error": "falta input"}, 400)
            return
        body = {
            "model": payload.get("model") or MISTRAL_TTS_MODEL,
            "input": text,
            "voice": voice or "en_paul_neutral",
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + key,
        }
        self._forward(MISTRAL_TTS_URL, body, headers)

    def _forward(self, url, body, headers):
        """Reenvía al proveedor real y devuelve su respuesta tal cual (streaming si aplica)."""
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(body).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            upstream = urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT)
            ctype = upstream.headers.get("Content-Type", "application/json")
            data = upstream.read()
            try:
                self.send_response(upstream.status)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                pass
        except urllib.error.HTTPError as e:
            detail = b""
            try:
                detail = e.read()
            except Exception:
                pass
            try:
                self.send_response(e.code)
                self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(detail)))
                self.end_headers()
                self.wfile.write(detail)
            except Exception:
                pass
        except Exception as e:
            self._json({"ok": False, "error": str(e)[:300]}, 502)


def main():
    global PORT, TOKEN, KEYS
    ap = argparse.ArgumentParser(description="Aion Sincro Key Proxy (sin dependencias)")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--token", default="", help="token obligatorio para /v1/* y /providers")
    ap.add_argument("--keys", default="", help="archivo JSON local con las claves (opcional)")
    args = ap.parse_args()
    PORT = args.port
    TOKEN = args.token.strip()
    KEYS = load_keys(args.keys or "")

    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Aion Sincro Key Proxy escuchando en http://127.0.0.1:{PORT}")
    print("=" * 60)
    print("  Claves configuradas (SOLO del lado del servidor):")
    for p, cfg in PROVIDERS.items():
        estado = "✔ configurada" if KEYS.get(p) else "— sin clave"
        print(f"    • {p:<11} {estado}")
    if TOKEN:
        print(f"  TOKEN: {TOKEN}")
        print("  Pégalo en Ajustes → Proxy de claves → Token")
    else:
        print("  SIN TOKEN: cualquiera en localhost puede usar el proxy.")
        print("  Usa --token para proteger /v1/* y /providers")
    print("=" * 60)
    print("  Las claves NUNCA viajan al navegador.")
    print("  Ctrl+C para detener")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

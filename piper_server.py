#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aion Sincro — Piper TTS Bridge (voz neuronal LOCAL y gratuita)
=============================================================
Sintetiza voz con Piper (TTS neuronal 100% local, sin internet, sin coste)
y la expone a la app web como audio WAV.

REQUISITOS (una vez):
    python -m venv .venv-piper
    .venv-piper\\Scripts\\python -m pip install piper-tts
    .venv-piper\\Scripts\\python -c "from piper.download_voices import download_voice; from pathlib import Path; download_voice('es_ES-sharvard-medium', Path('piper-voices'))"

Uso:
    .venv-piper\\Scripts\\python piper_server.py [--port 8766] [--token CLAVE] [--voices-dir piper-voices]

Endpoints:
    GET /ping?token=...      -> estado del servidor y voces instaladas
    GET /voices?token=...    -> lista de voces disponibles (.onnx en voices-dir)
    GET /synthesize?text=...&voice=es_ES-sharvard-medium&token=...
                             -> audio WAV (audio/wav)
    GET /download?voice=...&token=...   -> descarga una voz de HuggingFace

MEDIDAS DE SEGURIDAD (por diseño, igual que bridge.py):
  - Escucha SOLO en 127.0.0.1 (nunca expone la red local).
  - Valida el Host (127.0.0.1/localhost) y el Origin de la petición
    (solo file://, localhost o 127.0.0.1; ninguna web externa puede usarlo).
  - Token opcional: si lo inicias con `--token CLAVE`, todas las peticiones
    deben incluirlo (?token=CLAVE o header X-Token).
"""
import argparse
import io
import json
import os
import re
import secrets
import sys
import threading
import wave
from urllib.parse import unquote_plus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
except Exception:
    pass

PORT = 8766
TOKEN = ""
VOICES_DIR = Path(__file__).resolve().parent / "piper-voices"
MAX_TEXT = 5000

# Caché de modelos cargados + candado (onnxruntime no es seguro con hilos)
_model_cache = {}
_model_lock = threading.Lock()
_synth_lock = threading.Lock()  # la síntesis también comparte el runtime
PIPER_AVAILABLE = None  # None = sin comprobar, True/False

VOICE_SLUG_RE = re.compile(r"^[a-z]{2}(_[A-Z]{2})?-[a-zA-Z0-9_-]+$")

ORIGIN_RE = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")


def origin_allowed(origin):
    if origin in (None, "", "null"):
        return True
    return bool(ORIGIN_RE.match(origin))


def host_allowed(host):
    h = (host or "").lower()
    return bool(re.match(r"^((localhost|127\.0\.0\.1)(:\d+)?)$", h))


def piper_ok():
    global PIPER_AVAILABLE
    if PIPER_AVAILABLE is None:
        try:
            from piper import PiperVoice  # noqa: F401

            PIPER_AVAILABLE = True
        except Exception:
            PIPER_AVAILABLE = False
    return PIPER_AVAILABLE


def list_voices():
    if not VOICES_DIR.is_dir():
        return []
    return sorted(p.name[:-5] for p in VOICES_DIR.glob("*.onnx"))


def get_voice(slug):
    """Carga (y cachea) un modelo Piper. Devuelve None si no existe."""
    if not piper_ok():
        return None
    with _model_lock:
        if slug in _model_cache:
            return _model_cache[slug]
        model = VOICES_DIR / f"{slug}.onnx"
        if not model.is_file():
            return None
        try:
            from piper import PiperVoice

            v = PiperVoice.load(str(model))
            _model_cache[slug] = v
            return v
        except Exception:
            return None


def synthesize(text, slug):
    """Devuelve bytes WAV o None si falla."""
    v = get_voice(slug)
    if v is None:
        return None
    buf = io.BytesIO()
    try:
        with _synth_lock:  # onnxruntime comparte estado: serializar la síntesis
            with wave.open(buf, "wb") as w:
                v.synthesize_wav(text, w)
        return buf.getvalue()
    except Exception:
        return None


def download_voice(slug):
    """Descarga una voz de HuggingFace (piper.download_voices)."""
    try:
        from piper.download_voices import download_voice as dv

        VOICES_DIR.mkdir(parents=True, exist_ok=True)
        dv(slug, VOICES_DIR)
        _model_cache.pop(slug, None)
        return True
    except Exception:
        return False


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _cors(self, origin):
        self.send_header("Access-Control-Allow-Origin", origin or "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Token")
        self.send_header("Access-Control-Max-Age", "600")

    def _deny(self, code=403):
        try:
            self.send_response(code)
            self.send_header("Content-Length", "0")
            self.end_headers()
        except Exception:
            pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors(self.headers.get("Origin"))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _wav(self, data):
        self.send_response(200)
        self._cors(self.headers.get("Origin"))
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _check(self):
        if not host_allowed(self.headers.get("Host")):
            return False
        if not origin_allowed(self.headers.get("Origin")):
            return False
        if TOKEN:
            q = self.path.split("?", 1)[1] if "?" in self.path else ""
            params = {}
            for kv in q.split("&"):
                if "=" in kv:
                    k, _, v = kv.partition("=")
                    params[k] = unquote_plus(v)
            hdr = self.headers.get("X-Token", "")
            t = params.get("token", "")
            if not (t and secrets.compare_digest(t, TOKEN)) and not (hdr and secrets.compare_digest(hdr, TOKEN)):
                return False
        return True

    def do_OPTIONS(self):
        if not host_allowed(self.headers.get("Host")):
            return self._deny()
        self.send_response(204)
        self._cors(self.headers.get("Origin"))
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not self._check():
            return self._deny()
        path = self.path.split("?", 1)[0]
        params = {}
        if "?" in self.path:
            for kv in self.path.split("?", 1)[1].split("&"):
                if "=" in kv:
                    k, _, v = kv.partition("=")
                    params[k] = v
        if path == "/ping":
            self._json({
                "ok": True,
                "name": "aion-sincro-piper",
                "version": "1.0",
                "piper": piper_ok(),
                "voices": list_voices(),
                "voicesDir": str(VOICES_DIR),
            })
            return
        if path == "/voices":
            self._json({"ok": True, "voices": list_voices()})
            return
        if path == "/download":
            slug = params.get("voice", "")
            if not slug or not VOICE_SLUG_RE.match(slug):
                return self._json({"ok": False, "error": "voz no válida"}, 400)
            if download_voice(slug):
                self._json({"ok": True, "voice": slug})
            else:
                self._json({"ok": False, "error": "no se pudo descargar la voz"}, 500)
            return
        if path == "/synthesize":
            text = params.get("text", "")
            slug = params.get("voice", "es_ES-sharvard-medium")
            if not VOICE_SLUG_RE.match(slug):
                return self._json({"ok": False, "error": "voz no válida"}, 400)
            if not piper_ok():
                return self._json(
                    {"ok": False, "error": "piper-tts no está instalado. Ejecuta: .venv-piper\\Scripts\\python -m pip install piper-tts (Linux/macOS: .venv-piper/bin/python -m pip install piper-tts)"},
                    500,
                )
            if not text:
                return self._json({"ok": False, "error": "falta ?text="}, 400)
            if len(text) > MAX_TEXT:
                text = text[:MAX_TEXT]
            data = synthesize(text, slug)
            if data is None:
                if VOICES_DIR.joinpath(f"{slug}.onnx").is_file():
                    return self._json({"ok": False, "error": "no se pudo sintetizar"}, 500)
                return self._json(
                    {"ok": False, "error": f"voz no instalada: {slug}. Usa /download?voice={slug} o descárgala con piper.download_voices"},
                    404,
                )
            self._wav(data)
            return
        self._deny()

    def do_POST(self):
        if not self._check():
            return self._deny()
        self._json({"ok": False, "error": "usa GET"}, 405)


def main():
    global PORT, TOKEN
    ap = argparse.ArgumentParser(description="Aion Sincro — Piper TTS local (solo 127.0.0.1)")
    ap.add_argument("--port", type=int, default=8766, help="puerto (por defecto 8766)")
    ap.add_argument("--token", default="", help="token opcional exigido en cada petición")
    ap.add_argument("--voices-dir", default=None, help="carpeta con los modelos .onnx")
    args = ap.parse_args()
    PORT = args.port
    TOKEN = args.token or ""
    if args.voices_dir:
        global VOICES_DIR
        VOICES_DIR = Path(args.voices_dir)

    print("=" * 60)
    print("Aion Sincro — Piper TTS local")
    print(f"  Escuchando en http://127.0.0.1:{PORT}")
    print(f"  Modelos: {VOICES_DIR}")
    if piper_ok():
        vs = list_voices()
        print(f"  Piper OK · {len(vs)} voz/voces instalada(s): {', '.join(vs) if vs else '(ninguna — usa /download?voice=es_ES-sharvard-medium)'}")
    else:
        print("  ¡Piper NO está instalado!")
        print("  Instala:  python -m venv .venv-piper")
        print("            .venv-piper\\Scripts\\python -m pip install piper-tts")
    if TOKEN:
        print(f"  TOKEN: {TOKEN}  (pégalo en Ajustes → Voz → Token Piper)")
    print("  (solo 127.0.0.1 · Origin validado · Ctrl+C para detener)")
    print("=" * 60)

    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

#!/usr/bin/env bash
# ============================================================
# Aion Sincro — Instalador de Piper TTS (Linux / macOS)
# ============================================================
# Crea el venv .venv-piper, instala piper-tts, descarga la voz
# es_ES-sharvard-medium y arranca piper_server.py con doble clic.
#
# Después de instalarlo, el servidor queda escuchando en
# http://127.0.0.1:8766 (solo local). En la app:
#   Ajustes → Voz → elige una voz "Piper local".
#
# Variables opcionales:
#   PIPER_VOICE   voz a descargar (por defecto es_ES-sharvard-medium)
#   PIPER_PORT    puerto (por defecto 8766)
#   PIPER_TOKEN   token opcional del servidor
#
# Uso:  ./instalar-piper.sh   (primera vez: chmod +x instalar-piper.sh)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv-piper"
VOICE="${PIPER_VOICE:-es_ES-sharvard-medium}"
PORT="${PIPER_PORT:-8766}"
TOKEN_ARG=()
[ -n "${PIPER_TOKEN:-}" ] && TOKEN_ARG=(--token "$PIPER_TOKEN")

echo
echo "  ============================================"
echo "    AION SINCRO - Instalador de Piper TTS"
echo "    Voz: $VOICE  |  Puerto: $PORT"
echo "  ============================================"
echo

# --- 1) Localizar python3 ------------------------------------
PY=""
if command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v python >/dev/null 2>&1 && python --version 2>&1 | grep -qE "Python 3"; then
  PY="python"
else
  echo "  [ERROR] No se encontró Python 3. Instálalo (p. ej. apt install python3)"
  exit 1
fi
echo "  [OK] Python: $($PY --version 2>&1)"

# --- 2) Crear el venv (si no existe) --------------------------
if [ -x "$VENV/bin/python" ]; then
  echo "  [OK] Venv encontrado: $VENV"
else
  echo "  ==> Creando entorno virtual en $VENV ..."
  "$PY" -m venv "$VENV"
  echo "  [OK] Venv creado."
fi
VPY="$VENV/bin/python"

# --- 3) Instalar piper-tts ------------------------------------
echo "  ==> Instalando piper-tts (puede tardar un minuto) ..."
"$VPY" -m pip install --upgrade pip >/dev/null
"$VPY" -m pip install piper-tts
echo "  [OK] piper-tts instalado."

# --- 4) Descargar la voz es_ES --------------------------------
mkdir -p "$ROOT/piper-voices"
if [ -f "$ROOT/piper-voices/$VOICE.onnx" ]; then
  echo "  [OK] Voz $VOICE ya descargada."
else
  echo "  ==> Descargando la voz $VOICE (~60 MB, una sola vez) ..."
  "$VPY" -c "from piper.download_voices import download_voice; from pathlib import Path; download_voice('$VOICE', Path('$ROOT/piper-voices'))"
  echo "  [OK] Voz $VOICE descargada."
fi

# --- 5) Arrancar el servidor ----------------------------------
echo
echo "  ==> Arrancando Piper TTS en http://127.0.0.1:$PORT"
echo "      (Ctrl+C para detener el servidor)"
echo
cd "$ROOT"
exec "$VPY" piper_server.py --port "$PORT" "${TOKEN_ARG[@]}"

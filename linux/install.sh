#!/usr/bin/env bash
# ============================================================
# Aion Sincro — instalador para Linux / macOS
# ============================================================
# Instala la app, el puente y un lanzador en el HOME del usuario
# (sin sudo). Crea también una entrada en el menú de aplicaciones.
#
# Uso:
#     cd aion-sincro/linux
#     ./install.sh
set -euo pipefail

APP_NAME="Aion Sincro"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/aion-sincro"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/aion-sincro"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

mkdir -p "$DATA_DIR" "$CONF_DIR" "$BIN_DIR" "$APPS_DIR"

echo "==> Copiando archivos de la app…"
cp "$SRC_DIR/../index.html" "$SRC_DIR/../bridge.py" "$SRC_DIR/../bridge.mjs" \
   "$SRC_DIR/../LICENSE" "$SRC_DIR/../README.md" "$SRC_DIR/../SECURITY.md" \
   "$SRC_DIR/../LINKEDIN.md" "$SRC_DIR/../POSTS_LINKEDIN.md" "$DATA_DIR/"
cp "$SRC_DIR/aion-sincro.svg" "$DATA_DIR/aion-sincro.svg"

echo "==> Generando token del puente (solo lectura para tu usuario)…"
if [ ! -s "$CONF_DIR/token" ]; then
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16 > "$CONF_DIR/token"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import secrets; print(secrets.token_hex(16))" > "$CONF_DIR/token"
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$CONF_DIR/token"
  fi
  chmod 600 "$CONF_DIR/token"
fi

echo "==> Instalando lanzador 'aion-sincro'…"
cp "$SRC_DIR/aion-sincro" "$BIN_DIR/aion-sincro"
chmod +x "$BIN_DIR/aion-sincro"

echo "==> Creando entrada de menú…"
cat > "$APPS_DIR/aion-sincro.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Aion Sincro
GenericName=Compañera de pentesting y red team
Comment=IA local con voz, terminal y herramientas OSINT
Exec="$BIN_DIR/aion-sincro"
Icon=$DATA_DIR/aion-sincro.svg
Terminal=false
Categories=Development;Utility;Security;
StartupNotify=true
EOF

echo ""
echo "==> Dependencias:"
if command -v python3 >/dev/null 2>&1; then
  echo "  ✓ python3 ($(python3 --version 2>&1 | cut -d' ' -f2)) — sirve la app y el puente"
else
  echo "  ✗ python3 NO encontrado — necesario para servir la app y el puente"
fi
if command -v node >/dev/null 2>&1; then
  echo "  ✓ node ($(node --version 2>/dev/null || echo '?')) — puente alternativo"
else
  echo "  … node no encontrado (opcional)"
fi
if command -v ollama >/dev/null 2>&1; then
  echo "  ✓ ollama — recuerda: ollama pull hermes3"
else
  echo "  … ollama no instalado (opcional) — curl -fsSL https://ollama.com/install.sh | sh"
fi

TOKEN="$(cat "$CONF_DIR/token")"

echo ""
case ":$PATH:" in
  *":$BIN_DIR:"*) ;; # ya está en el PATH
  *) echo "ℹ️  Añade $BIN_DIR a tu PATH para usar 'aion-sincro' desde cualquier sitio:"
     echo "    echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc && source ~/.bashrc";;
esac

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  $APP_NAME instalado"
echo "║"
echo "║  Token del puente (pégalo en Ajustes → Terminal local):"
echo "║     $TOKEN"
echo "║"
echo "║  Para abrirla:      aion-sincro    (o el menú de aplicaciones)"
echo "║  Para desinstalar:  $SRC_DIR/uninstall.sh"
echo "╚══════════════════════════════════════════════════════════╝"

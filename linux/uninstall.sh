#!/usr/bin/env bash
# ============================================================
# Aion Sincro — desinstalador (Linux / macOS)
# ============================================================
# Detiene el servidor y el puente, y borra todos los archivos
# instalados (datos, token, lanzador y entrada de menú).
set -euo pipefail

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/aion-sincro"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/aion-sincro"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

echo "Se eliminará Aion Sincro:"
echo "  · $DATA_DIR"
echo "  · $CONF_DIR   (token del puente y registros)"
echo "  · $BIN_DIR/aion-sincro"
echo "  · $APPS_DIR/aion-sincro.desktop"
read -r -p "¿Continuar? [s/N] " ans
case "$ans" in s|S|y|Y|sí|si) ;; *) echo "Cancelado."; exit 0 ;; esac

for pf in web.pid bridge.pid; do
  if [ -f "$CONF_DIR/$pf" ]; then
    kill "$(cat "$CONF_DIR/$pf" 2>/dev/null)" 2>/dev/null || true
  fi
done
sleep 1
rm -rf "$DATA_DIR" "$CONF_DIR"
rm -f "$BIN_DIR/aion-sincro" "$APPS_DIR/aion-sincro.desktop"
echo "✓ Aion Sincro desinstalado."

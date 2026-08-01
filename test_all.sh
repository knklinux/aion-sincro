#!/usr/bin/env bash
# ============================================================
#  Aion Sincro — Suite de pruebas completa (Linux / macOS)
#  Ejecuta las pruebas del puente y de la app con un comando.
#
#  Uso:  ./test_all.sh   (primera vez: chmod +x test_all.sh)
# ============================================================
set -e
cd "$(dirname "$0")"

echo
echo "============================================================"
echo "  AION SINCRÓ — SUITE DE PRUEBAS"
echo "============================================================"
echo

echo "[1/2] test_bridge.py  (seguridad de puentes y servidores)"
echo "------------------------------------------------------------"
# Respetar PYTHON si el proyecto corre en un venv (p.ej. .venv-piper/bin/python)
PY="${PYTHON:-python3}"
$PY test_bridge.py

echo
echo "[2/2] test_app.js  (sintaxis JS, secretos y funciones)"
echo "------------------------------------------------------------"
node test_app.js

echo
echo "============================================================"
echo "  TODO EN VERDE ✔  (la suite completa pasó)"
echo "============================================================"

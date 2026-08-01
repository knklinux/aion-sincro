#!/usr/bin/env bash
# ============================================================
#  Aion Sincro — Instalar pre-commit hook (Linux / macOS)
#  Copia hooks/pre-commit al directorio .git/hooks/ para que
#  cada commit ejecute la suite de pruebas automáticamente.
#
#  Uso:  ./instalar-pre-commit.sh
#  Bypass puntual:  git commit --no-verify
# ============================================================
set -e
cd "$(dirname "$0")/.."

if [ ! -d ".git/hooks" ]; then
    echo "[X] No hay carpeta .git/hooks — ¿estás dentro del repo?"
    exit 1
fi
if [ ! -f "hooks/pre-commit" ]; then
    echo "[X] No encuentro hooks/pre-commit."
    exit 1
fi

install -m 755 hooks/pre-commit .git/hooks/pre-commit
echo
echo "[OK] Pre-commit hook instalado."
echo "     Cada git commit ejecutará la suite de pruebas y"
echo "     se bloqueará si algo falla."
echo

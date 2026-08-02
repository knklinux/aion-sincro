#!/bin/sh
# ============================================================
# Aion Sincro · Docker entrypoint
# ============================================================
# Los servidores Python (bridge, proxy, piper) vinculan a
# 127.0.0.1 por seguridad — pero dentro de un contenedor
# Docker eso los hace invisibles desde fuera.  Este script
# parchea la dirección de enlace a 0.0.0.0 ANTES de arrancar
# el proceso real, sin modificar los archivos originales en
# disco (solo en la copia efímera del contenedor).
# ============================================================

set -e

# Cambiar "127.0.0.1" → "0.0.0.0" en los servidores Python
# (solo dentro de esta copia en el contenedor; los archivos
#  originales del host no se tocan gracias al overlay de Docker).
for f in /app/bridge.py /app/proxy.py /app/piper_server.py; do
  if [ -f "$f" ]; then
    sed -i 's/("127\.0\.0\.1", PORT)/("0.0.0.0", PORT)/g' "$f"
  fi
done

exec "$@"

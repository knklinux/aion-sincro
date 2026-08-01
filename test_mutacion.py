#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aion Sincro — Test de mutación real
===================================
Prueba que la suite de regresión WebCrypto protege de verdad: hace una copia
temporal de index.html a la que se le QUITA la línea de limpieza de saveStore
(la que borra las claves en claro antes de persistir a localStorage) y ejecuta
test_app.js contra esa copia a través de la variable de entorno AION_HTML.

Esperado: el check dinámico 'saveStore con crypto activo NO persiste claves
en claro' DEBE FALLAR (la suite debe devolver código distinto de 0).

  - Si la suite sigue en verde  -> el test es VACUO, no protege nada (salida 1)
  - Si la suite cae en ese check -> la mutación fue detectada (salida 0)

Uso:  python test_mutacion.py
"""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(ROOT, "index.html")

# La consola de Windows usa cp1252 y no soporta ✔/✘: forzamos UTF-8 en la salida
# propia del harness para no crashear en los prints.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# La línea exacta de limpieza de saveStore: si desaparece, las claves viajan
# en claro dentro de 'aion_cfg'. Si el formato cambia, actualizar esta línea
# (el harness avisa si no la encuentra).
CLEANUP_LINE = "  if(store.crypto&&store.encSecrets){ rest.mistralKey=''; rest.groqKey=''; rest.openrouterKey=''; rest.hfToken=''; rest.bridgeToken=''; rest.piperToken=''; rest.proxyToken=''; }"
TARGET_CHECK = "saveStore con crypto activo NO persiste claves en claro"


def main():
    print("=" * 60)
    print("  AION SINCRÓ — TEST DE MUTACIÓN (saveStore)")
    print("=" * 60)

    with open(INDEX, "r", encoding="utf-8") as f:
        original = f.read()

    if CLEANUP_LINE not in original:
        print("  ✘ La línea de limpieza no se encontró en index.html — harness roto")
        print("    (¿cambió el formato de saveStore? actualiza CLEANUP_LINE en test_mutacion.py)")
        return 1

    tmpdir = tempfile.mkdtemp(prefix="aion-mutacion-")
    try:
        mutated_path = os.path.join(tmpdir, "index.html")
        mutated = original.replace(CLEANUP_LINE, "", 1)
        with open(mutated_path, "w", encoding="utf-8") as f:
            f.write(mutated)

        # Control: la mutación se aplicó de verdad (no fue un no-op silencioso).
        # Ojo: "rest.mistralKey=''" SOLO existe en la línea de limpieza, así que
        # tras quitarla debe desaparecer; lo que debe seguir intacta es saveStore.
        with open(mutated_path, "r", encoding="utf-8") as f:
            control = f.read()
        if CLEANUP_LINE in control or "function saveStore" not in control:
            print("  ✘ La mutación no se aplicó correctamente")
            return 1
        print("  ✔ Mutación aplicada: saveStore ya NO limpia las claves")

        env = dict(os.environ)
        env["AION_HTML"] = mutated_path
        # Node emite UTF-8 a los pipes; hay que decodificar explícitamente o en
        # Windows (cp1252) el ✘ de los fallos se vuelve mojibake y la detección
        # fallaría aunque la mutación esté bien detectada.
        proc = subprocess.run(
            ["node", "test_app.js"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            env=env, cwd=ROOT,
        )

        print("  ----- salida de la suite contra el archivo mutado -----")
        tail = (proc.stdout or "").splitlines()[-14:]
        for line in tail:
            print("   " + line)
        print("  ------------------------------------------------------")

        # La prueba de verdad: la suite debe FALLAR y el check dinámico debe caer.
        # Coincidencia por línea y tolerante al marcador ✘ (defensa extra).
        fallo_dinamico = any(TARGET_CHECK in line and "✘" in line
                             for line in proc.stdout.splitlines())
        suite_fallida = proc.returncode != 0

        if fallo_dinamico and suite_fallida:
            print()
            print("  ✔ MUTACIÓN DETECTADA — el check de regresión protege de verdad")
            print("    (quitando la limpieza de saveStore, el test 'NO persiste claves")
            print("     en claro' falla: las claves se filtrarían en localStorage)")
            return 0

        if not suite_fallida:
            print()
            print("  ✘ MUTACIÓN NO DETECTADA — la suite pasó con la limpieza eliminada")
            print("    El check es VACUO: no protege nada. Corrige el test.")
            return 1

        print()
        print("  ✘ La suite falló, pero no por el check de regresión dinámico")
        print("    (mira la salida: el test 'NO persiste claves en claro' no cayó)")
        return 1
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())

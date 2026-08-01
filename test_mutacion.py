#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aion Sincró — Harness de mutación de seguridad
===============================================
Prueba que la suite de regresión protege de verdad: crea copias temporales de
los fuentes con LÍNEAS DE SEGURIDAD MUTADAS (quitadas o debilitadas) y ejecuta
la suite correspondiente contra cada copia.

  - La suite cae en el check esperado      -> la mutación fue DETECTADA (el check protege)
  - La suite sigue en verde                -> el check es VACUO (no protege nada)

Casos:
  1. saveStore_limpieza : se quita la limpieza de claves en claro de saveStore
  2. autolock_min       : se quita la guarda `min<=0` de maybeAutoLock
  3. locksecrets_purga  : se quita el purgado de claves en memoria de lockSecrets
  4. bridge_hostorigin  : se debilitan los filtros Host/Origin del puente

Uso:
  python test_mutacion.py              # todos los casos (exit 0 = todos detectados)
  python test_mutacion.py --coverage   # todos los casos + lote combinado (varias
                                       # líneas a la vez) y escribe el informe de
                                       # cobertura MUTACION_COBERTURA.md (Markdown)
"""
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.join(ROOT, "MUTACION_COBERTURA.md")

# La consola de Windows usa cp1252 y no soporta ✔/✘: forzamos UTF-8 en la salida
# propia del harness para no crashear en los prints.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ---------------------------------------------------------------- constantes
# Línea de limpieza de saveStore: si desaparece, las claves viajan en claro.
CLEANUP_LINE = "  if(store.crypto&&store.encSecrets){ rest.mistralKey=''; rest.groqKey=''; rest.openrouterKey=''; rest.hfToken=''; rest.bridgeToken=''; rest.piperToken=''; rest.proxyToken=''; }"
# Guarda de inactividad de maybeAutoLock: si desaparece, bloquea con autoLockMin=0.
AUTOLOCK_GUARD = "  if(min<=0) return;"
# Purgado de claves en memoria de lockSecrets: si desaparece, las claves siguen
# vivas en store[] tras bloquear.
PURGE_LINE = "  ['groqKey','openrouterKey','hfToken','mistralKey','bridgeToken','piperToken','proxyToken'].forEach(k=>{ store[k]=''; const el=$('#'+k); if(el) el.value=''; });"
# Filtros Host/Origin del puente (versión estricta -> debilitada).
ORIGIN_RE_LINE = 'ORIGIN_RE = re.compile(r"^https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?$")'
ORIGIN_RE_WEAK = 'ORIGIN_RE = re.compile(r"^https?://(localhost|127\\.0\\.0\\.1)")'
HOST_RE_LINE = '    return bool(re.match(r"^((localhost|127\\.0\\.0\\.1)(:\\d+)?)$", h))'
HOST_RE_WEAK = '    return bool(re.match(r"^(localhost|127\\.0\\.0\\.1)", h))'


def _mutar_bridge(src):
    """Debilita los filtros de Origin/Host: quita el anclaje final y el grupo de
    puerto, de modo que 'localhost.evil.com' o 'http://localhost.evil.com'
    pasan el filtro (regresión a startswith, el bug que ya se corrigió)."""
    if ORIGIN_RE_LINE not in src or HOST_RE_LINE not in src:
        raise ValueError("filtros Host/Origin no encontrados en bridge.py")
    return src.replace(ORIGIN_RE_LINE, ORIGIN_RE_WEAK).replace(HOST_RE_LINE, HOST_RE_WEAK)


# ------------------------------------------------------------------- casos
CASES = [
    {
        "id": "saveStore_limpieza",
        "titulo": "saveStore ya NO limpia las claves en claro",
        "linea": "`if(store.crypto&&store.encSecrets){ rest.mistralKey=''; ... }` (saveStore)",
        "archivo": "index.html",
        "env_var": "AION_HTML",
        "suite": ["node", "test_app.js"],
        "checks": ["saveStore con crypto activo NO persiste claves en claro"],
        "mutar": lambda s: s.replace(CLEANUP_LINE, "", 1),
        "control_ok": lambda s: CLEANUP_LINE not in s and "function saveStore" in s,
        "control_err": "la línea de limpieza de saveStore no se encontró (¿cambió el formato?)",
    },
    {
        "id": "autolock_min",
        "titulo": "maybeAutoLock ya NO ignora autoLockMin=0",
        "linea": "`if(min<=0) return;` (maybeAutoLock)",
        "archivo": "index.html",
        "env_var": "AION_HTML",
        "suite": ["node", "test_app.js"],
        "checks": ["maybeAutoLock ignora autoLockMin=0"],
        "mutar": lambda s: s.replace(AUTOLOCK_GUARD, "", 1),
        "control_ok": lambda s: AUTOLOCK_GUARD not in s and "function maybeAutoLock" in s,
        "control_err": "la guarda min<=0 de maybeAutoLock no se encontró",
    },
    {
        "id": "locksecrets_purga",
        "titulo": "lockSecrets ya NO purga las claves de memoria",
        "linea": "`['groqKey',...].forEach(k=>{ store[k]=''; ... })` (lockSecrets)",
        "archivo": "index.html",
        "env_var": "AION_HTML",
        "suite": ["node", "test_app.js"],
        "checks": ["lockSecrets purga las claves de memoria"],
        "mutar": lambda s: s.replace(PURGE_LINE, "", 1),
        "control_ok": lambda s: PURGE_LINE not in s and "function lockSecrets" in s,
        "control_err": "la línea de purgado de lockSecrets no se encontró",
    },
    {
        "id": "bridge_hostorigin",
        "titulo": "el puente acepta Host/Origin forjados",
        "linea": "`ORIGIN_RE` y `host_allowed` (anclas laxas, regresión a startswith)",
        "archivo": "bridge.py",
        "env_var": "AION_BRIDGE",
        "suite": [sys.executable, "test_bridge.py"],
        "checks": [
            "host_allowed('localhost.evil.com') bloqueado",
            "origin_allowed('http://localhost.evil.com') bloqueado",
            "Host forjado → 403",
            "Origin falsificado localhost → 403",
        ],
        "mutar": _mutar_bridge,
        "control_ok": lambda s: ORIGIN_RE_WEAK in s and HOST_RE_WEAK in s,
        "control_err": "los filtros Host/Origin no se encontraron en bridge.py",
    },
]


def _ejecutar(caso, tmpdir):
    """Aplica la mutación, escribe la copia mutada y ejecuta la suite. Devuelve
    (stdout, returncode) o lanza ValueError si la mutación no se aplica."""
    with open(os.path.join(ROOT, caso["archivo"]), "r", encoding="utf-8") as f:
        original = f.read()
    mutado = caso["mutar"](original)
    if not caso["control_ok"](mutado):
        raise ValueError(caso["control_err"])
    path = os.path.join(tmpdir, caso["archivo"])
    with open(path, "w", encoding="utf-8") as f:
        f.write(mutado)
    env = dict(os.environ)
    env[caso["env_var"]] = path
    proc = subprocess.run(
        caso["suite"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        env=env, cwd=ROOT, timeout=180,
    )
    return (proc.stdout or ""), proc.returncode


def _analizar(caso, stdout, rc):
    """Clasifica el resultado de una mutación."""
    lineas = stdout.splitlines()
    cayeron = [c for c in caso["checks"] if any(c in ln and "✘" in ln for ln in lineas)]
    if cayeron and rc != 0:
        return "DETECTADA", cayeron
    if rc == 0:
        return "VACUA", []
    return "OTRO_FALLO", cayeron


def _cola(stdout, n=10):
    return "\n".join("   " + ln for ln in stdout.splitlines()[-n:])


def _ejecutar_caso(caso, tmpdir, mostrar=True):
    """Ejecuta un caso y devuelve {caso, estado, cayeron, tail}."""
    res = {"caso": caso, "estado": "HARNESS_ROTO", "cayeron": [], "tail": ""}
    try:
        stdout, rc = _ejecutar(caso, tmpdir)
    except subprocess.TimeoutExpired:
        res["estado"] = "TIMEOUT"
        if mostrar:
            print(f"  ⏳ {caso['titulo']} — timeout (180s)")
        return res
    except ValueError as e:
        res["estado"] = "HARNESS_ROTO"
        res["tail"] = f"   {e}"
        if mostrar:
            print(f"  ✘ {caso['titulo']}: {e}")
        return res
    res["estado"], res["cayeron"] = _analizar(caso, stdout, rc)
    res["tail"] = _cola(stdout)
    if mostrar:
        marca = {"DETECTADA": "✔", "VACUA": "✘", "OTRO_FALLO": "?", "HARNESS_ROTO": "✘"}[res["estado"]]
        print(f"  {marca} {caso['titulo']}: {res['estado']}"
              + (f" — cayó: {', '.join(res['cayeron'])}" if res["cayeron"] else ""))
    return res


# ----------------------------------------------------------- modo cobertura
def _lote_combinado(tmpdir):
    """Muta VARIAS líneas de seguridad A LA VEZ (defensa en profundidad):
    las 3 líneas de index.html juntas y el filtro del puente, y verifica que
    ambas suites caen. Devuelve dict para el informe."""
    resultado = {"html": None, "bridge": None}
    # 1) index.html con las 3 mutaciones simultáneas.
    html_case = dict(CASES[0])
    html_case.update({
        "id": "lote_index_html",
        "titulo": "LOTE: las 3 líneas de index.html a la vez",
        "checks": [c for caso in CASES[:3] for c in caso["checks"]],
        "mutar": lambda s: s.replace(CLEANUP_LINE, "", 1)
                            .replace(AUTOLOCK_GUARD, "", 1)
                            .replace(PURGE_LINE, "", 1),
        "control_ok": lambda s: CLEANUP_LINE not in s and AUTOLOCK_GUARD not in s
                                and PURGE_LINE not in s and "function saveStore" in s,
    })
    resultado["html"] = _ejecutar_caso(html_case, tmpdir, mostrar=False)
    # 2) bridge.py con el filtro debilitado.
    resultado["bridge"] = _ejecutar_caso(CASES[3], tmpdir, mostrar=False)
    return resultado


def _escribir_informe(resultados, lote):
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    detectadas = sum(1 for r in resultados if r["estado"] == "DETECTADA")
    vacuas = sum(1 for r in resultados if r["estado"] == "VACUA")
    otras = len(resultados) - detectadas - vacuas

    L = []
    L.append("# Cobertura de mutación — Aion Sincró")
    L.append("")
    L.append(f"_Generado: {now}_ · _Suites: `test_app.js` + `test_bridge.py`_ · _Modo `--coverage`_")
    L.append("")
    L.append("## Resumen")
    L.append("")
    L.append("| Métrica | Valor |")
    L.append("|---|---|")
    L.append(f"| Casos de mutación individual | {len(resultados)} |")
    L.append(f"| ✅ Detectadas (el check protege de verdad) | {detectadas} |")
    L.append(f"| ⚠️ Vacuas (el check NO protege nada) | {vacuas} |")
    L.append(f"| ❌ Fallos no esperados / harness roto | {otras} |")
    L.append("")
    L.append("## Tabla por caso")
    L.append("")
    L.append("| # | Caso | Línea mutada | Resultado |")
    L.append("|---|---|---|---|")
    emoji = {"DETECTADA": "✅", "VACUA": "⚠️", "OTRO_FALLO": "❌", "HARNESS_ROTO": "🔴", "TIMEOUT": "⏳"}
    for i, r in enumerate(resultados, 1):
        L.append(f"| {i} | `{r['caso']['id']}` | {r['caso']['linea']} | {emoji[r['estado']]} {r['estado']} |")
    L.append("")
    L.append("## Lote combinado (varias líneas de seguridad a la vez)")
    L.append("")
    L.append("| Lote | Resultado esperado | Resultado real |")
    L.append("|---|---|---|")
    for k, key, label in (("html", "index.html", "3 líneas a la vez"), ("bridge", "bridge.py", "filtro del puente")):
        r = lote[k]
        real = f"{emoji[r['estado']]} {r['estado']}"
        if r["cayeron"]:
            real += " — " + "; ".join(r["cayeron"])
        L.append(f"| `{key}` ({label}) | la suite debe FALLAR | {real} |")
    L.append("")
    L.append("## Detalle por caso")
    L.append("")
    for i, r in enumerate(resultados, 1):
        L.append(f"### {i}. `{r['caso']['id']}` — {r['caso']['titulo']}")
        L.append("")
        L.append(f"- **Línea mutada:** {r['caso']['linea']}")
        L.append(f"- **Checks que deben caer:** " + ", ".join(f"`{c}`" for c in r['caso']['checks']))
        L.append(f"- **Resultado:** {emoji[r['estado']]} {r['estado']}")
        if r["cayeron"]:
            L.append(f"- **Checks caídos:** " + ", ".join(f"`{c}`" for c in r["cayeron"]))
        L.append(f"- **Cola de la suite:**")
        L.append("")
        L.append("```")
        L.append(r["tail"].rstrip())
        L.append("```")
        L.append("")
    L.append("---")
    L.append("")
    L.append("_Informe generado por `python test_mutacion.py --coverage`._")
    L.append("")
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    return "\n".join(L)


def modo_coverage():
    print("=" * 62)
    print("  AION SINCRÓ — COBERTURA DE MUTACIÓN (informe Markdown)")
    print("=" * 62)
    tmpdir = tempfile.mkdtemp(prefix="aion-cobertura-")
    try:
        print("\n[1/2] Casos individuales:")
        resultados = []
        for caso in CASES:
            resultados.append(_ejecutar_caso(caso, tmpdir))
        print("\n[2/2] Lote combinado (varias líneas de seguridad a la vez):")
        lote = _lote_combinado(tmpdir)
        for k in ("html", "bridge"):
            r = lote[k]
            print(f"  {'✔' if r['estado']=='DETECTADA' else '✘'} {r['caso']['titulo']}: {r['estado']}"
                  + (f" — cayó: {', '.join(r['cayeron'])}" if r["cayeron"] else ""))
        md = _escribir_informe(resultados, lote)
        print(f"\n📄 Informe escrito en: MUTACION_COBERTURA.md")
        print()
        # Resumen corto en consola
        detectadas = sum(1 for r in resultados if r["estado"] == "DETECTADA")
        vacuas = sum(1 for r in resultados if r["estado"] == "VACUA")
        print(f"  Resumen: {detectadas}/{len(resultados)} detectadas · {vacuas} vacuas")
        print(f"  Lote: html={lote['html']['estado']} · bridge={lote['bridge']['estado']}")
        todo_ok = (detectadas == len(resultados) and vacuas == 0
                   and lote["html"]["estado"] == "DETECTADA"
                   and lote["bridge"]["estado"] == "DETECTADA")
        print()
        if todo_ok:
            print("  ✔ TODAS LAS MUTACIONES DETECTADAS — los checks protegen de verdad")
            return 0
        print("  ✘ Hay checks VACUOS o fallos: consulta MUTACION_COBERTURA.md")
        return 1
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def modo_normal():
    print("=" * 60)
    print("  AION SINCRÓ — TEST DE MUTACIÓN ({} casos)".format(len(CASES)))
    print("=" * 60)
    tmpdir = tempfile.mkdtemp(prefix="aion-mutacion-")
    try:
        resultados = []
        for caso in CASES:
            print(f"\n--- {caso['id']}: {caso['titulo']} ---")
            r = _ejecutar_caso(caso, tmpdir)
            resultados.append(r)
            if r["estado"] in ("VACUA", "OTRO_FALLO", "HARNESS_ROTO"):
                print(r["tail"])
        print()
        detectadas = sum(1 for r in resultados if r["estado"] == "DETECTADA")
        vacuas = sum(1 for r in resultados if r["estado"] == "VACUA")
        print(f"  Resumen: {detectadas}/{len(resultados)} detectadas · {vacuas} vacuas")
        if detectadas == len(resultados):
            print("  ✔ TODAS LAS MUTACIONES DETECTADAS — la suite protege de verdad")
            return 0
        print("  ✘ Algunos checks no protegen: revisa la salida anterior")
        return 1
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def main():
    if "--coverage" in sys.argv:
        return modo_coverage()
    return modo_normal()


if __name__ == "__main__":
    sys.exit(main())

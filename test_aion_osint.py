#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aion Sincro — Suite de pruebas de aion_osint.py
================================================
Valida que el módulo OSINT no se rompa con cada cambio.
Solo pruebas OFFLINE (funciones puras + CLI con entradas inválidas que
no requieren red), para que la suite funcione sin conexión:

  1) parse_robots        — extrae rutas Disallow de un robots.txt
  2) normalize_path      — asegura '/' inicial
  3) is_valid_username / is_valid_email
  4) normalize_phone / detect_country — E.164
  5) gravatar_url        — hash MD5 del email
  6) wayback_cdx_url     — URL de la API CDX de Wayback
  7) build_profile_urls  — lista de plataformas con {user} sustituido
  8) SITES / HIDDEN_WORDLIST — integridad de los datos
  9) CLI offline: --user/--email/--phone inválidos devuelven error sin red

Uso:
    python test_aion_osint.py
    (o desde test_all.cmd / test_all.sh)
"""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PASS = 0
FAIL = 0
FAILURES = []


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✔ {name}")
    else:
        FAIL += 1
        FAILURES.append(name)
        print(f"  ✘ {name}  {extra}")


def load_module():
    spec = importlib.util.spec_from_file_location("aion_osint_mod", ROOT / "aion_osint.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_robots_wayback():
    """Carga robots_wayback.py (importa aion_osint como hermano)."""
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    spec = importlib.util.spec_from_file_location("robots_wayback_mod",
                                                  ROOT / "robots_wayback.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def cli_json(*args):
    """Ejecuta el CLI y devuelve (exit_code, dict_json) sin tocar la red."""
    p = subprocess.run(
        [sys.executable, str(ROOT / "aion_osint.py"), "--json", *args],
        capture_output=True, text=True, cwd=ROOT, timeout=30)
    try:
        data = json.loads(p.stdout)
    except Exception:
        data = None
    return p.returncode, data, p.stdout + p.stderr


def test_robots(mod):
    print("\n[1] parse_robots / normalize_path")
    txt = """User-agent: *
Disallow: /admin/
Disallow: /private
Allow: /public
Disallow: /
Sitemap: https://x.com/sitemap.xml
"""
    out = mod.parse_robots(txt)
    check("extrae rutas Disallow", out == ["/admin/", "/private"],
          f"got {out}")
    out2 = mod.parse_robots("Disallow: *\nDisallow: /privado/*\nDisallow: /privado2*\n")
    # '/privado/*' -> '/privado/' (conserva la barra final), '/privado2*' -> '/privado2'
    check("limpia comodines de robots", out2 == ["/privado/", "/privado2"],
          f"got {out2}")
    check("ignora Allow, Sitemap y Disallow:/", len(out) == 2)
    check("normalize_path añade /", mod.normalize_path("admin/") == "/admin/")
    check("normalize_path conserva /", mod.normalize_path("/x") == "/x")
    check("normalize_path vacío", mod.normalize_path("") == "")


def test_validators(mod):
    print("\n[2] validadores de usuario y email")
    for good in ["pepe", "Pepe_123", "a-b.c", "x" * 64]:
        check(f"username válido {good!r}", mod.is_valid_username(good))
    for bad in ["", "a", "x" * 65, "con espacios", "áéí", "user!", "user name"]:
        check(f"username inválido {bad!r}", not mod.is_valid_username(bad))
    for good in ["a@b.es", "nombre.apellido@dominio.com", "x+y@sub.dominio.org"]:
        check(f"email válido {good!r}", mod.is_valid_email(good))
    for bad in ["", "no-es-email", "a@b", "@b.com", "a b@c.com"]:
        check(f"email inválido {bad!r}", not mod.is_valid_email(bad))


def test_phone(mod):
    print("\n[3] normalize_phone / detect_country")
    check("ES con +", mod.normalize_phone("+34 612 345 678") == "+34612345678")
    check("ES con país", mod.normalize_phone("612345678", "ES") == "+34612345678")
    check("00 prefijo", mod.normalize_phone("0034 612345678") == "+34612345678")
    check("guiones/paréntesis", mod.normalize_phone("+34 612(345)678") == "+34612345678")
    check("no duplica prefijo ya presente", mod.normalize_phone("34612345678", "ES") == "+34612345678")
    check("teléfono corto → None", mod.normalize_phone("123", "ES") is None)
    check("sin país y sin + → None", mod.normalize_phone("612345678") is None)
    check("no numérico → None", mod.normalize_phone("+34 abc", "ES") is None)
    pais = mod.detect_country("+34612345678")
    check("detecta España", pais and pais[0] == "ES", f"got {pais}")
    pais = mod.detect_country("+52 55 1234 5678".replace(" ", ""))
    check("detecta México (+52)", pais and pais[0] == "MX", f"got {pais}")
    check("detect_country None sin +", mod.detect_country("612345678") is None)


def test_hashes_urls(mod):
    print("\n[4] gravatar_url / wayback_cdx_url")
    import hashlib
    email = "Persona@Ejemplo.com"
    h = hashlib.md5("persona@ejemplo.com".encode()).hexdigest()
    check("gravatar normaliza minúsculas", mod.gravatar_url(email).endswith("/%s.json" % h))
    check("emails distintos → hash distinto",
          mod.gravatar_url("a@b.com") != mod.gravatar_url("c@d.com"))
    cdx = mod.wayback_cdx_url("ejemplo.com")
    check("cdx contiene dominio", "ejemplo.com" in cdx)
    check("cdx output json", "output=json" in cdx)


def test_sites(mod):
    print("\n[5] build_profile_urls / integridad de datos")
    urls = mod.build_profile_urls("pepe")
    check("hay muchas plataformas", len(urls) >= 50, f"got {len(urls)}")
    check("todos los sitios sustituyen {user}", all("{user}" not in u for _, u, _ in urls))
    check("usuario aparece en las URLs",
          any("pepe" in u for _, u, _ in urls if "github.com" in u))
    check("quota limita", len(mod.build_profile_urls("pepe", 5)) == 5)
    check("SITES bien formado", all(len(s) == 3 for s in mod.SITES))
    check("HIDDEN_WORDLIST no vacía", len(mod.HIDDEN_WORDLIST) > 20)
    check("wordlist normaliza a rutas /...",
          all(mod.normalize_path(p).startswith("/") for p in mod.HIDDEN_WORDLIST if p))
    check("sanitize_domain quita esquema",
          mod.sanitize_domain("https://ejemplo.com/sub") == "ejemplo.com")
    check("sanitize_domain quita ruta",
          mod.sanitize_domain("http://x.es/a/b") == "x.es")
    check("sanitize_domain sin esquema", mod.sanitize_domain("ejemplo.com") == "ejemplo.com")
    check("sanitize_domain inválido → None",
          mod.sanitize_domain("dominio-inválido.es") is None)
    check("sanitize_domain vacío → None", mod.sanitize_domain("") is None)


def test_cli_offline(mod):
    print("\n[6] CLI offline (sin red)")
    code, data, out = cli_json("--user", "usuario inválido!!")
    check("--user inválido → exit 0 + error JSON",
          code == 0 and isinstance(data, dict) and "error" in data, out[:160])
    code, data, out = cli_json("--email", "no-es-email")
    check("--email inválido → error JSON", isinstance(data, dict) and "error" in data)
    code, data, out = cli_json("--phone", "123", "--country", "ES")
    check("--phone inválido → error JSON", isinstance(data, dict) and "error" in data)
    code, data, out = cli_json("--phone", "+34 612 345 678")
    check("--phone válido → e164", isinstance(data, dict) and data.get("e164") == "+34612345678",
          out[:160])
    # El dominio VÁLIDO hace peticiones de red reales (robots.txt, Wayback,
    # sondeo de rutas), así que en esta suite offline solo probamos el caso
    # inválido (que falla antes de tocar la red).
    code, data, out = cli_json("--domain", "dominio-inválido.es")
    check("--domain inválido → error JSON (offline)",
          isinstance(data, dict) and "error" in data, out[:160])


def test_robots_wayback(rw):
    print("\n[7] robots_wayback.py (robots.txt + Wayback por ruta)")
    cdx = rw.route_cdx_url("ejemplo.com", "/admin/", 5)
    check("cdx incluye ruta y wildcard", "ejemplo.com/admin/*" in cdx, cdx)
    check("cdx incluye limit", "limit=5" in cdx and "collapse=urlkey" in cdx, cdx)
    check("cdx output json", "output=json" in cdx)
    # dominio inválido -> error sin tocar la red
    res = rw.run("dominio-inválido.es", json_out=True)
    check("run dominio inválido → error", isinstance(res, dict) and "error" in res)
    res = rw.run("http://ejemplo.com/sub", json_out=True)
    check("run saneado → domain limpio",
          isinstance(res, dict) and res.get("domain") == "ejemplo.com")
    # run() con dominio válido y robots.txt inaccesible (sin red) devuelve
    # el esquema completo sin reventar: robots sin disallow + rutas vacías.
    import unittest.mock as mock
    with mock.patch.object(rw.osint, "_get", return_value=(None, "", "")):
        res = rw.run("ejemplo.com", json_out=True)
    check("run sin red devuelve esquema",
          isinstance(res, dict) and set(res) >= {"domain", "robots", "rutas"}
          and res["rutas"] == [], str(res)[:120])
    check("reutiliza parse_robots de aion_osint",
          rw.osint.parse_robots("Disallow: /a\nDisallow: /b*\n") == ["/a", "/b"])
    check("reutiliza sanitize_domain",
          rw.osint.sanitize_domain("https://x.es/z") == "x.es")


def main():
    # Windows por defecto usa cp1252 en stdout y el ✔ no cabe:
    # forzamos UTF-8 igual que el resto del repo.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print("=" * 60)
    print("Aion Sincro — Suite de pruebas de aion_osint.py")
    print("=" * 60)
    mod = load_module()
    test_robots(mod)
    test_validators(mod)
    test_phone(mod)
    test_hashes_urls(mod)
    test_sites(mod)
    test_cli_offline(mod)
    test_robots_wayback(load_robots_wayback())
    print("\n" + "=" * 60)
    print(f"RESULTADO: {PASS} ok · {FAIL} fallos")
    if FAILURES:
        print("Fallos:")
        for f in FAILURES:
            print(f"  - {f}")
        print("=" * 60)
        sys.exit(1)
    print("TODO EN VERDE ✔")
    print("=" * 60)
    sys.exit(0)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
robots_wayback.py — robots.txt + Wayback Machine para un dominio
================================================================
Dado un dominio:
  1. Descarga su /robots.txt.
  2. Lista las rutas Disallow (bloqueadas para rastreadores, y por tanto
     candidatas a existir sin enlazarse desde el front).
  3. Consulta la Wayback Machine (API CDX) por CADA ruta bloqueada:
     versiones históricas, timestamp y código de estado.
  4. (Opcional, --probe) Sonda en vivo cada ruta para detectar archivos
     que siguen existiendo en el back aunque no se enlacen en el front.

Reutiliza las funciones puras de aion_osint.py (parse_robots,
sanitize_domain, wayback_cdx_url, probe) — sin duplicar lógica.

⚖️ Uso legal: herramienta educativa. Úsala sobre dominios propios o con
autorización. Sondear archivos ocultos en un dominio ajeno sin permiso es
ilegal en España (Art. 197 C.P.) y en la mayoría de jurisdicciones.

Ejemplos:
    python robots_wayback.py ejemplo.com
    python robots_wayback.py ejemplo.com --probe
    python robots_wayback.py ejemplo.com --json --limit 50
"""
import argparse
import json
import sys
import time

import aion_osint as osint   # funciones puras compartidas


def route_cdx_url(domain, path, limit=20):
    """URL CDX de Wayback para una ruta concreta (páginas borradas/ocultas).

    Filtra por prefijo de ruta (wildcard '*') y colapsa por URL para
    devolver cada URL única una sola vez.
    """
    base = "https://web.archive.org/cdx/search/cdx"
    q = ("?url=%s%s*&output=json&fl=original,timestamp,statuscode"
         "&collapse=urlkey&limit=%d" % (domain, path, limit))
    return base + q


def fetch_route_wayback(domain, path, limit=20, timeout=20):
    """Devuelve la lista de capturas Wayback [{url, timestamp, status}]."""
    url = route_cdx_url(domain, path, limit)
    st, body, _ = osint._get(url, timeout=timeout)
    out = []
    if st == 200:
        try:
            data = json.loads(body)
            if isinstance(data, list) and len(data) > 1:
                for r in data[1:]:
                    if len(r) >= 3:
                        out.append({"url": r[0], "timestamp": r[1],
                                    "status": r[2]})
        except Exception:
            pass
    return out


def probe_live(domain, path, timeout=6):
    """Comprueba si la ruta sigue existiendo en el dominio (sin redirigir)."""
    st, size, ctype, loc = osint.probe("https://%s%s" % (domain, path),
                                       timeout=timeout)
    return {"status": st, "bytes": size, "type": ctype, "location": loc}


def run(domain, probe=False, limit=20, timeout=20, json_out=False):
    domain = osint.sanitize_domain(domain)
    if not domain:
        return {"error": "dominio inválido"}
    out = {"domain": domain, "robots": None, "rutas": []}

    # 1) robots.txt
    st, body, _ = osint._get("https://%s/robots.txt" % domain)
    disallowed = osint.parse_robots(body) if st == 200 else []
    out["robots"] = {"status": st, "disallow": disallowed,
                     "url": "https://%s/robots.txt" % domain}

    # 2) Wayback por cada ruta (+ opcional sonda en vivo)
    for path in disallowed:
        row = {"path": path,
               "wayback": fetch_route_wayback(domain, path, limit, timeout)}
        if probe:
            row["vivo"] = probe_live(domain, path)
            time.sleep(0.3)
        out["rutas"].append(row)
    return out


def _print_report(res):
    print("\n== %s ==" % res.get("domain", ""))
    rb = res.get("robots", {})
    print("robots.txt (HTTP %s): %s" % (rb.get("status"), rb.get("url", "")))
    for d in rb.get("disallow", []):
        print("   Disallow -> %s" % d)
    print("\nRutas bloqueadas y su historial Wayback:")
    for r in res.get("rutas", []):
        print("  · %s  (%d capturas)" % (r["path"], len(r.get("wayback", []))))
        for w in r.get("wayback", [])[:8]:
            print("      [%s] HTTP %s %s" % (w["timestamp"], w["status"],
                                             w["url"]))
        if r.get("vivo"):
            v = r["vivo"]
            if v.get("status") in (200, 401, 403, 405, 500):
                print("      ⚠ EXISTE EN VIVO: HTTP %s (%s B, %s)"
                      % (v.get("status"), v.get("bytes"), v.get("type")))


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="robots_wayback",
        description="robots.txt + Wayback Machine por ruta (dominios "
                    "propios o con autorización).")
    ap.add_argument("domain", help="dominio a analizar (ej. ejemplo.com)")
    ap.add_argument("--probe", action="store_true",
                    help="sonda en vivo cada ruta (¿sigue existiendo?)")
    ap.add_argument("--limit", type=int, default=20,
                    help="capturas Wayback máximas por ruta (por defecto 20)")
    ap.add_argument("--timeout", type=int, default=20,
                    help="timeout de red en segundos (por defecto 20)")
    ap.add_argument("--json", action="store_true", help="salida JSON")
    args = ap.parse_args(argv)

    res = run(args.domain, args.probe, args.limit, args.timeout, args.json)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    elif isinstance(res, dict) and res.get("error"):
        print("  ✗ %s" % res["error"])
    else:
        _print_report(res)
    return 0


if __name__ == "__main__":
    sys.exit(main())

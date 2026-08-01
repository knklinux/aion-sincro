#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
aion_osint.py — Reconocimiento OSINT local para Aion Sincro
============================================================
Busca cuentas asociadas a un NOMBRE DE USUARIO, EMAIL o TELÉFONO en
plataformas públicas, y para un DOMINIO analiza robots.txt, descubre
contenido oculto (archivos que existen en el back pero no se enlazan
en el front) y recupera páginas borradas vía Wayback Machine.

Solo Python estándar (sin dependencias), igual que bridge.py.

⚖️ USO LEGAL — Herramienta educativa:
   Úsala únicamente sobre datos PROPIOS o con autorización explícita.
   La enumeración de cuentas se basa en páginas públicas; el escaneo de
   contenido oculto en un dominio ajeno sin permiso es ilegal en España
   (Art. 197 C.P.) y en la mayoría de jurisdicciones. Este script es una
   compañera de aprendizaje (laboratorios propios, bug bounty autorizado).

Ejemplos:
   python aion_osint.py --user  nombre_usuario
   python aion_osint.py --email persona@ejemplo.com
   python aion_osint.py --phone "+34 612 345 678" --country ES
   python aion_osint.py --domain ejemplo.com            # robots.txt + oculto + wayback
   python aion_osint.py --domain ejemplo.com --json     # salida máquina (JSON)
"""

import argparse
import hashlib
import http.client
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

__version__ = "1.0.0"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AionSincro/OSINT "
      "compatible; +https://github.com/")
DELAY = 0.35          # pausa entre peticiones (cortesía / evitar bloqueos)
TIMEOUT = 8

# ---------------------------------------------------------------- utilidades
def _get(url, timeout=TIMEOUT):
    """GET con urllib (sigue redirecciones). Devuelve (status, body, content_type)."""
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": UA, "Accept-Language": "es,en;q=0.8"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(80000).decode("utf-8", "ignore")
            return r.status, body, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        try:
            body = e.read(4000).decode("utf-8", "ignore")
        except Exception:
            body = ""
        return e.code, body, e.headers.get("Content-Type", "")
    except Exception:
        return None, "", ""


def probe(url, timeout=6):
    """GET sin seguir redirecciones (para descubrir contenido oculto).

    Devuelve (status, bytes_leidos, content_type, location).
    """
    try:
        u = urllib.parse.urlparse(url)
        host, path = u.netloc, (u.path or "/")
        if u.query:
            path += "?" + u.query
        port = u.port or (443 if u.scheme == "https" else 80)
        if u.scheme == "https":
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            conn = http.client.HTTPSConnection(host, port, timeout=timeout, context=ctx)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=timeout)
        conn.request("GET", path, headers={
            "User-Agent": UA, "Host": host,
            "Range": "bytes=0-4096", "Accept": "*/*"})
        r = conn.getresponse()
        data = r.read(5000)
        out = (r.status, len(data), r.getheader("Content-Type", ""),
               r.getheader("Location", ""))
        conn.close()
        return out
    except Exception:
        return None, 0, "", ""


# ----------------------------------------------------- funciones puras (test)
def parse_robots(text):
    """Extrae las rutas 'Disallow' de un robots.txt (públicas en el archivo).

    Normaliza la ruta y quita comodines de robots ('*' final y '/privado/*')
    para poder sondear el recurso real.
    """
    out = []
    for line in (text or "").splitlines():
        low = line.strip().lower()
        if low.startswith("disallow:"):
            val = line.split(":", 1)[1].strip()
            if val and val != "/":
                val = re.sub(r"\*$", "", val)          # '/privado*' -> '/privado'
                val = re.sub(r"/\*$", "", val)         # '/privado/*' -> '/privado'
                if not val:                              # 'Disallow: *' -> nada
                    continue
                out.append(val if val.startswith("/") else "/" + val)
    return out


def normalize_path(p):
    """Asegura que una ruta empiece por '/' (para candidatos de fuzzing)."""
    p = (p or "").strip()
    if p and not p.startswith("/"):
        p = "/" + p
    return p


def sanitize_domain(domain):
    """Limpia y valida un dominio de entrada: sin esquema, sin ruta.

    Devuelve el dominio saneado o None si es inválido.
    """
    d = re.sub(r"^https?://", "", (domain or "").strip()).rstrip("/")
    d = d.split("/")[0]
    if not re.match(r"^[A-Za-z0-9.\-]+$", d):
        return None
    return d


def is_valid_username(u):
    return bool(re.match(r"^[A-Za-z0-9_.\-]{2,64}$", (u or "").strip()))


def is_valid_email(e):
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", (e or "").strip()))


COUNTRY = {  # prefijos E.164 de países frecuentes
    "US": "1", "CA": "1", "GB": "44", "ES": "34", "FR": "33", "DE": "49",
    "IT": "39", "PT": "351", "NL": "31", "BE": "32", "IE": "353", "CH": "41",
    "AT": "43", "SE": "46", "NO": "47", "DK": "45", "FI": "358", "PL": "48",
    "GR": "30", "HU": "36", "CZ": "420", "RO": "40", "RU": "7", "UA": "380",
    "MX": "52", "AR": "54", "CO": "57", "CL": "56", "PE": "51", "VE": "58",
    "UY": "598", "PY": "595", "BO": "591", "EC": "593", "GT": "502",
    "HN": "504", "NI": "505", "CR": "506",    "PA": "507",
    "CU": "53", "BR": "55", "JP": "81", "CN": "86", "IN": "91", "KR": "82",
    "AU": "61", "NZ": "64", "ZA": "27", "EG": "20", "TR": "90",
}


def normalize_phone(num, country=None):
    """Normaliza un teléfono a E.164 ('+34612345678') o devuelve None."""
    d = re.sub(r"[\s\-().]", "", (num or "").strip())
    if d.startswith("00"):
        d = "+" + d[2:]
    if d.startswith("+"):
        d = d[1:]
    else:
        if country and country.upper() in COUNTRY:
            cc = COUNTRY[country.upper()]
            if not d.startswith(cc):   # ya incluye el prefijo sin '+' -> no duplicar
                d = cc + d
        else:
            return None
    if not d.isdigit() or not (8 <= len(d) <= 15):
        return None
    return "+" + d


def detect_country(e164):
    """Devuelve (nombre_pais, prefijo) para un E.164, o None."""
    if not e164 or not e164.startswith("+"):
        return None
    d = e164[1:]
    # prefijos de 1 a 4 dígitos, probando el más largo primero
    for size in range(4, 0, -1):
        if d[:size] in COUNTRY.values():
            code = d[:size]
            name = next(k for k, v in COUNTRY.items() if v == code)
            return name, code
    return None


def gravatar_url(email):
    """URL del perfil público Gravatar para un email (0 = sin perfil)."""
    h = hashlib.md5((email or "").strip().lower().encode("utf-8")).hexdigest()
    return "https://www.gravatar.com/%s.json" % h


def wayback_cdx_url(domain, limit=200):
    """URL de la API pública CDX de Wayback Machine para un dominio."""
    return ("https://web.archive.org/cdx/search/cdx?url=%s/*&output=json"
            "&fl=original,timestamp,statuscode&collapse=urlkey&limit=%d"
            % (domain, limit))


# --------------------------------------------------- plataformas de usuario
# (nombre, plantilla, ¿exige que el nombre aparezca en el body?)
SITES = [
    ("GitHub",        "https://github.com/{user}", True),
    ("GitLab",        "https://gitlab.com/{user}", True),
    ("GitHub Gists",  "https://gist.github.com/{user}", True),
    ("Bitbucket",     "https://bitbucket.org/{user}/", True),
    ("Codeberg",      "https://codeberg.org/{user}", True),
    ("X / Twitter",   "https://twitter.com/{user}", True),
    ("Instagram",     "https://instagram.com/{user}", True),
    ("Threads",       "https://www.threads.net/@{user}", True),
    ("Bluesky",       "https://bsky.app/profile/{user}", True),
    ("Mastodon",      "https://mastodon.social/@{user}", True),
    ("Reddit",        "https://www.reddit.com/user/{user}", True),
    ("Telegram",      "https://t.me/{user}", True),
    ("TikTok",        "https://www.tiktok.com/@{user}", True),
    ("YouTube",       "https://www.youtube.com/@{user}", True),
    ("Twitch",        "https://www.twitch.tv/{user}", True),
    ("Steam",         "https://steamcommunity.com/id/{user}", True),
    ("Pinterest",     "https://www.pinterest.com/{user}/", True),
    ("Tumblr",        "https://{user}.tumblr.com", False),
    ("SoundCloud",    "https://soundcloud.com/{user}", True),
    ("Spotify",       "https://open.spotify.com/user/{user}", True),
    ("Medium",        "https://medium.com/@{user}", True),
    ("Dev.to",        "https://dev.to/{user}", True),
    ("Hacker News",   "https://news.ycombinator.com/user?id={user}", True),
    ("Keybase",       "https://keybase.io/{user}", True),
    ("Docker Hub",    "https://hub.docker.com/u/{user}", True),
    ("npm",           "https://www.npmjs.com/~{user}", True),
    ("PyPI",          "https://pypi.org/user/{user}", True),
    ("crates.io",     "https://crates.io/users/{user}", True),
    ("Behance",       "https://www.behance.net/{user}", True),
    ("Dribbble",      "https://dribbble.com/{user}", True),
    ("Flickr",        "https://www.flickr.com/people/{user}/", True),
    ("Last.fm",       "https://www.last.fm/user/{user}", True),
    ("Kick",          "https://kick.com/{user}", True),
    ("itch.io",       "https://{user}.itch.io", False),
    ("Patreon",       "https://www.patreon.com/{user}", True),
    ("Ko-fi",         "https://ko-fi.com/{user}", True),
    ("CodePen",       "https://codepen.io/{user}", True),
    ("Replit",        "https://replit.com/@{user}", True),
    ("LeetCode",      "https://leetcode.com/{user}/", True),
    ("Codeforces",    "https://codeforces.com/profile/{user}", True),
    ("Kaggle",        "https://www.kaggle.com/{user}", True),
    ("Hugging Face",  "https://huggingface.co/{user}", True),
    ("Roblox",        "https://www.roblox.com/user.aspx?username={user}", True),
    ("Chess.com",     "https://www.chess.com/member/{user}", True),
    ("Lichess",       "https://lichess.org/@/{user}", True),
    ("Duolingo",      "https://www.duolingo.com/profile/{user}", True),
    ("Vimeo",         "https://vimeo.com/{user}", True),
    ("Dailymotion",   "https://www.dailymotion.com/{user}", True),
    ("VK",            "https://vk.com/{user}", True),
    ("Snapchat",      "https://www.snapchat.com/add/{user}", True),
    ("Goodreads",     "https://www.goodreads.com/{user}", True),
    ("Wattpad",       "https://www.wattpad.com/user/{user}", True),
    ("Fiverr",        "https://www.fiverr.com/{user}", True),
    ("Product Hunt",  "https://www.producthunt.com/@{user}", True),
    ("AskFM",         "https://ask.fm/{user}", True),
    ("About.me",      "https://about.me/{user}", True),
    ("Linktree",      "https://linktr.ee/{user}", True),
    ("Carrd",         "https://{user}.carrd.co", False),
    ("Gravatar",      "https://gravatar.com/{user}", True),
    ("WordPress",     "https://{user}.wordpress.com", False),
    ("Disqus",        "https://disqus.com/by/{user}/", True),
    ("SlideShare",    "https://www.slideshare.net/{user}", True),
    ("Scribd",        "https://www.scribd.com/{user}", True),
    ("Speaker Deck",  "https://speakerdeck.com/{user}", True),
    ("TryHackMe",     "https://tryhackme.com/p/{user}", True),
    ("Root-Me",       "https://www.root-me.org/{user}", True),
    ("GitBook",       "https://{user}.gitbook.io", False),
    ("Notion",        "https://{user}.notion.site", False),
]

# Wordlist de rutas típicamente ocultas (archivos que existen en el back
# sin enlazarse en el front). Es la parte de "descubrimiento" del script.
HIDDEN_WORDLIST = [
    "admin/", "login/", "config/", "configuration/", "backup/", "backups/",
    "uploads/", "files/", "downloads/", "private/", "temp/", "tmp/",
    "old/", "test/", "dev/", "api/", "v1/", "v2/", "internal/", "staff/",
    "logs/", "log/", "sql/", "db/", "database/", "phpmyadmin/", "cgi-bin/",
    "server-status", "hidden/", "secret/", "keys/", ".ssh/", ".well-known/",
    "debug/", "error_log", "info.php", "phpinfo.php", "robots.txt",
    "sitemap.xml", "backup.zip", "backup.tar.gz", "site.zip", "www.zip",
    ".git/HEAD", ".env", ".htaccess", "wp-admin/", "wp-content/",
]


def build_profile_urls(username, limit=None):
    """Devuelve [(plataforma, url, exige_body)] para cada sitio."""
    enc = urllib.parse.quote_plus((username or "").strip())
    urls = [(site, tmpl.format(user=enc), body)
            for site, tmpl, body in SITES]
    if limit:
        urls = urls[:max(1, int(limit))]
    return urls


# ----------------------------------------------------------------- acciones
def run_user(username, limit=None, json_out=False):
    if not is_valid_username(username):
        return {"error": "nombre de usuario inválido (2-64 de [A-Za-z0-9_.-])"}
    results = {"query": username, "hits": [], "posibles": [], "sin_resultado": 0,
               "errores": []}
    for site, url, need_body in build_profile_urls(username, limit):
        status, body, ct = _get(url)
        time.sleep(DELAY)
        if status == 200:
            if need_body and username.strip().lower() not in body.lower():
                results["posibles"].append({"site": site, "url": url})
            else:
                results["hits"].append({"site": site, "url": url})
        elif status in (404, 410):
            results["sin_resultado"] += 1
        else:
            results["errores"].append(
                {"site": site, "url": url, "status": status})
    return results


def run_email(email, json_out=False):
    if not is_valid_email(email):
        return {"error": "email inválido"}
    results = {"query": email, "checks": []}
    # Gravatar: perfil público asociado al hash del email
    status, body, ct = _get(gravatar_url(email))
    grav = {"source": "Gravatar", "url": gravatar_url(email).replace(".json", "")}
    if status == 200:
        try:
            data = json.loads(body)
            prof = (data.get("entry") or [{}])[0]
            grav["encontrado"] = True
            grav["nombre"] = prof.get("displayName")
            grav["perfil"] = prof.get("profileUrl")
            grav["ubicacion"] = prof.get("currentLocation")
        except Exception:
            grav["encontrado"] = True
    else:
        grav["encontrado"] = False
    results["checks"].append(grav)
    # Enlaces de búsqueda manual (DuckDuckGo) para correlacionar el email
    results["buscadores"] = [
        "https://duckduckgo.com/?q=%s" % urllib.parse.quote_plus(email),
        "https://www.google.com/search?q=%s" % urllib.parse.quote_plus(email),
    ]
    return results


def run_phone(phone, country=None, json_out=False):
    e164 = normalize_phone(phone, country)
    if not e164:
        return {"error": "teléfono no válido. Usa formato internacional "
                         "(+34612345678) o pasa --country ES"}
    res = {"query": phone, "e164": e164,
           "pais": detect_country(e164)}
    res["nota"] = ("La correlación de teléfonos con cuentas requiere "
                   "servicios de pago o autorización. Revisa en buscadores "
                   "y directorios públicos: %s"
                   % ("https://duckduckgo.com/?q="
                      + urllib.parse.quote_plus('"%s"' % e164)))
    return res


def run_domain(domain, json_out=False):
    domain = sanitize_domain(domain)
    if not domain:
        return {"error": "dominio inválido"}
    out = {"domain": domain}

    # 1) robots.txt -> rutas que el front no enlaza (pero existen)
    robots_url = "https://%s/robots.txt" % domain
    status, body, ct = _get(robots_url)
    disallowed = parse_robots(body) if status == 200 else []
    out["robots"] = {"status": status, "disallow": disallowed,
                     "url": robots_url}

    # 2) Wayback Machine -> páginas borradas (recuperación de contenido)
    cdx = wayback_cdx_url(domain)
    arch = []
    st2, body2, _ = _get(cdx, timeout=20)
    if st2 == 200:
        try:
            data = json.loads(body2)
            if isinstance(data, list) and len(data) > 1:
                seen = set()
                for r in data[1:]:
                    if len(r) >= 3 and r[0] not in seen:
                        seen.add(r[0])
                        arch.append({"url": r[0], "timestamp": r[1],
                                     "status": r[2]})
        except Exception:
            pass
    out["wayback"] = arch[:50]

    # 3) Contenido oculto: robots.txt + wordlist, sin seguir redirecciones
    cands = set()
    for p in disallowed:
        cands.add(normalize_path(p))
    for p in HIDDEN_WORDLIST:
        cands.add(normalize_path(p))
    found = []
    for path in sorted(cands):
        url = "https://%s%s" % (domain, path)
        st, ln, ct3, loc = probe(url)
        time.sleep(DELAY)
        if st in (200, 401, 403, 405, 500, 501):
            found.append({"path": path, "status": st, "bytes": ln,
                          "type": ct3.split(";")[0],
                          "origen": "robots" if path in disallowed else "wordlist"})
    out["oculto"] = found
    return out


# ------------------------------------------------------------------- CLI
def _print_hits(res):
    print("  ✔ CUENTAS ENCONTRADAS:")
    for h in res.get("hits", []):
        print("     [%s] %s" % (h["site"], h["url"]))
    if res.get("posibles"):
        print("  ? POSIBLES (página 200 pero no confirma el nombre):")
        for h in res["posibles"]:
            print("     [%s] %s" % (h["site"], h["url"]))
    print("  · sin coincidencia: %d · errores/bloqueos: %d"
          % (res.get("sin_resultado", 0), len(res.get("errores", []))))
    for e in res.get("errores", []):
        print("     - [%s] %s (HTTP %s)" % (e["site"], e["url"], e["status"]))


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="aion_osint",
        description="Reconocimiento OSINT legal de Aion Sincro. Uso solo "
                    "sobre datos propios o con autorización.")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--user", metavar="USERNAME",
                   help="busca cuentas asociadas a un nombre de usuario")
    g.add_argument("--email", metavar="EMAIL",
                   help="busca perfiles asociados a un email (Gravatar + buscadores)")
    g.add_argument("--phone", metavar="PHONE",
                   help="normaliza y geolocaliza un teléfono (E.164)")
    g.add_argument("--domain", metavar="DOMAIN",
                   help="analiza robots.txt, contenido oculto y páginas "
                        "borradas (Wayback) de un dominio")
    ap.add_argument("--country", default=None,
                    help="código ISO del país para --phone (p. ej. ES)")
    ap.add_argument("--limit", type=int, default=None,
                    help="limita el número de plataformas a consultar (--user)")
    ap.add_argument("--json", action="store_true",
                    help="salida en JSON (para automatización)")
    args = ap.parse_args(argv)

    if args.user:
        res = run_user(args.user, args.limit, args.json)
        if args.json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        elif isinstance(res, dict) and res.get("error"):
            print("  ✗ %s" % res["error"])
        else:
            print("\n== Cuentas asociadas a '%s' ==" % res.get("query", args.user))
            _print_hits(res)
    elif args.email:
        res = run_email(args.email, args.json)
        if args.json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        elif isinstance(res, dict) and res.get("error"):
            print("  ✗ %s" % res["error"])
        else:
            print("\n== Perfiles asociados a %s ==" % args.email)
            for c in res.get("checks", []):
                estado = "ENCONTRADO" if c.get("encontrado") else "no encontrado"
                print("  [%s] %s -> %s %s" % (c["source"], estado,
                                              c.get("nombre") or "",
                                              c.get("perfil") or ""))
            print("  Buscadores manuales:")
            for b in res.get("buscadores", []):
                print("     %s" % b)
    elif args.phone:
        res = run_phone(args.phone, args.country, args.json)
        if args.json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        elif isinstance(res, dict) and res.get("error"):
            print("  ✗ %s" % res["error"])
        else:
            print("\n== Teléfono %s ==" % args.phone)
            print("  E.164: %s" % res.get("e164"))
            pais = res.get("pais")
            print("  País:  %s (prefijo +%s)" % (pais[0], pais[1]) if pais
                  else "  País:  desconocido")
            print("  %s" % res.get("nota", ""))
    elif args.domain:
        res = run_domain(args.domain, args.json)
        if args.json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        elif isinstance(res, dict) and res.get("error"):
            print("  ✗ %s" % res["error"])
        else:
            print("\n== Dominio %s ==" % res.get("domain", args.domain))
            rb = res.get("robots", {})
            print("  robots.txt (HTTP %s): %s" % (rb.get("status"),
                                                  rb.get("url", "")))
            for d in rb.get("disallow", []):
                print("     Disallow -> %s" % d)
            print("  Páginas archivadas (Wayback, %d):" % len(res.get("wayback", [])))
            for w in res.get("wayback", [])[:15]:
                print("     [%s] HTTP %s %s" % (w["timestamp"], w["status"],
                                                w["url"]))
            print("  Contenido oculto (existe en el back, %d):"
                  % len(res.get("oculto", [])))
            for o in res.get("oculto", []):
                print("     HTTP %s (%d B, %s) %s   <- %s"
                      % (o["status"], o["bytes"], o["type"], o["path"],
                         o["origen"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())

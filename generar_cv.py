#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera el CV de Arkaitz (HTML/PDF) a partir de LINKEDIN.md.

Fuente única de verdad: LINKEDIN.md → el CV y el perfil de LinkedIn SIEMPRE coinciden.
Edita el .md y regenera con un solo comando; el CV nunca se desincroniza.

Uso:
  python generar_cv.py                # CV_Arkaitz.html (+ intenta CV_Arkaitz.pdf)
  python generar_cv.py --html-only    # solo HTML (sin PDF)
  python generar_cv.py --out DIR      # salida a otra carpeta
  python generar_cv.py --open         # abre el HTML en el navegador al terminar

NOTA: los print usan ASCII (sin caracteres no imprimibles en cp1252) para que el
script funcione en la consola de Windows sin UnicodeEncodeError.

Motores PDF (en orden, todos gratuitos y locales):
  1. weasyprint  (si está instalado)
  2. Edge / Chrome headless (--print-to-pdf, presente en Windows y casi todo Linux)
  3. Aviso manual: Ctrl+P → Guardar como PDF desde el navegador

Estética: paleta de Aion Sincro (grafito + ámbar + esmeralda), A4 lista para imprimir.
Sin dependencias externas (solo stdlib) para el HTML.
"""
import argparse
import html
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "LINKEDIN.md")
OUT_NAME = "CV_Arkaitz"


# ---------------------------------------------------------------------------
# Parseo de LINKEDIN.md
# ---------------------------------------------------------------------------

def esc(s):
    # quote=True: las comillas se escapan también, necesario para atributos (href)
    # y es inocuo en nodos de texto — siempre seguro en cualquier contexto.
    return html.escape(s, quote=True)


def strip_md(s):
    """Limpia marcas markdown básicas para mostrarlas como texto."""
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)  # [texto](url) -> texto
    s = s.replace("**", "")   # negrita
    s = s.replace("*", "")    # cursiva suelta (*planificada*) — se quitaba antes
    s = s.replace("`", "")
    s = s.strip()
    return s


def split_sections(text):
    """Agrupa por '## N. Título' → {num: (titulo, cuerpo)}."""
    parts = re.split(r"^## ", text, flags=re.M)
    sections = {}
    for p in parts[1:]:
        head, _, body = p.partition("\n")
        m = re.match(r"(\d+)\.\s*(.+)", head)
        if m:
            sections[m.group(1)] = (m.group(2).strip(), body.strip())
    return sections


def first_fence(body):
    m = re.search(r"```\n([\s\S]*?)\n```", body)
    return m.group(1).strip() if m else ""


def bullets(body):
    return [ln.strip() for ln in body.splitlines() if re.match(r"^\s*[-*]\s+", ln)]


def blockquote_lines(body):
    return [re.sub(r"^>\s*", "", ln) for ln in body.splitlines() if ln.strip().startswith(">")]


def extract(text):
    """Extrae la estructura del CV desde LINKEDIN.md."""
    d = {}
    m = re.search(r"^#\s*Perfil de LinkedIn\s*[—–-]\s*(.+?)\s*$", text, flags=re.M)
    d["name"] = m.group(1) if m else "Arkaitz"
    sec = split_sections(text)

    # 1. Headline: primer bloque de código de la sección 1
    d["headline"] = first_fence(sec.get("1", ("", ""))[1]) or "Cybersecurity Analyst aspirante"

    # 2. Acerca de → párrafo de perfil + destacados (las "> - " son los bullets)
    ql = blockquote_lines(sec.get("2", ("", ""))[1])
    par, feat = [], []
    for ln in ql:
        s = ln.strip()
        if s.startswith("- "):
            feat.append(strip_md(s[2:]))
        elif "GitHub:" in s or s.startswith("📎"):
            continue
        elif s:
            par.append(s)
    d["about"] = strip_md(" ".join(par))
    d["features"] = feat

    # 3. Destacados (enlaces de GitHub) → lista de pares (titulo, url)
    d["featured"] = re.findall(r"\*\*(.+?)\*\*\s*→\s*(https?://\S+)", sec.get("3", ("", ""))[1])

    # 4. Experiencia: cada '### ' es un puesto/proyecto
    jobs = []
    for part in re.split(r"^### ", sec.get("4", ("", ""))[1], flags=re.M)[1:]:
        head, _, body = part.partition("\n")
        head = head.strip()
        date_m = re.search(r"\*Fecha:\s*([^*]+)\*", body)
        date = strip_md(date_m.group(1)) if date_m else ""
        if "—" in head:
            company, _, role = head.partition("—")
        else:
            company, role = "", head
        jobs.append({
            "company": strip_md(company),
            "role": strip_md(role),
            "date": date,
            "items": [strip_md(b) for b in bullets(body)],
        })
    d["jobs"] = jobs

    # 5. Educación y certificaciones
    edu, certs = [], []
    for part in re.split(r"^### ", sec.get("5", ("", ""))[1], flags=re.M)[1:]:
        head, _, body = part.partition("\n")
        items = [strip_md(b) for b in bullets(body)]
        # OJO: "Certificaciones" NO contiene la cadena "Certificación" (tilde í vs e) —
        # usamos el prefijo sin acento para no dejar los certificados vacíos.
        if re.search(r"Certificaci\w+", head, flags=re.I):
            certs = items
        elif "Educación" in head or "Formación" in head:
            edu = items
    # Limpieza de certs: descartar consejos (sin negrita) y notas entre paréntesis
    d["education"] = edu
    clean_certs = []
    for c in certs:
        c = re.sub(r"\s*\(actualiza[^)]*\)", "", c)
        c = re.sub(r"\s*[✅✔]\s*", "", c).strip()
        if c:
            clean_certs.append(c)
    d["certs"] = clean_certs

    # 6. Habilidades
    body6 = sec.get("6", ("", ""))[1]
    def skill_list(key):
        m = re.search(r"\*\*%s\*\*[^\n]*\n([^\n]+)" % key, body6)
        if not m:
            return []
        return [x.strip() for x in m.group(1).split(",") if x.strip()]
    d["hard"] = skill_list("Hard skills")
    d["soft"] = skill_list("Soft skills")

    # 7. Datos de perfil
    body7 = sec.get("7", ("", ""))[1]
    def prof(key, default=""):
        m = re.search(r"\*\*%s\*\*:\s*(.+?)\s*(?:\n|$)" % key, body7, flags=re.I)
        return m.group(1).strip() if m else default
    d["location"] = prof("Ubicación", "Málaga, España")
    d["languages"] = prof("Idiomas", "Español (nativo), Inglés (técnico)")
    # Normaliza la lista de idiomas: corta las notas largas tras " — " y cierra
    # cualquier paréntesis que quedara desbalanceado al cortar ("Inglés (técnico").
    parts = []
    for item in d["languages"].split(","):
        item = item.split(" — ")[0].strip()
        if item.count("(") > item.count(")"):
            item += ")"
        if item:
            parts.append(item)
    d["languages"] = ", ".join(parts)
    gh = prof("Github", "")
    d["github"] = gh.replace("https://github.com/", "").rstrip("/") if gh else "knklinux"
    return d


# ---------------------------------------------------------------------------
# Render HTML
# ---------------------------------------------------------------------------

CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; background: #e9e6e1; color: #2b2622;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; min-height: 296mm; margin: 0 auto; background: #fbfaf8; box-shadow: 0 0 24px rgba(0,0,0,.18); }
.band { background: #211b16; color: #f5efe6; padding: 9mm 11mm 7mm; border-bottom: 2.4mm solid #e8962e; }
.name { font-size: 9mm; font-weight: 800; letter-spacing: .5mm; color: #f0a83b; }
.headline { margin-top: 2mm; font-size: 3.6mm; line-height: 1.4; color: #e9e2d8; font-weight: 600; }
.meta { margin-top: 1.8mm; font-size: 2.9mm; color: #b8ab9a; }
table.body { width: 100%; border-collapse: collapse; }
td { vertical-align: top; }
.side { width: 34%; background: #f1ece4; padding: 7mm 6mm; border-right: .4mm solid #ddd3c4; }
.main { padding: 7mm 9mm; }
.side-h { font-size: 3mm; text-transform: uppercase; letter-spacing: .8mm; color: #211b16;
          border-bottom: .8mm solid #e8962e; padding-bottom: 1.2mm; margin: 5mm 0 2.6mm; }
.side-h:first-child { margin-top: 0; }
.side p, .side li { font-size: 2.9mm; line-height: 1.55; color: #3c332b; }
.side ul { list-style: none; }
.side ul li { padding-left: 3.4mm; position: relative; margin-bottom: 1.5mm; }
.side ul li::before { content: "◆"; position: absolute; left: 0; top: 0; font-size: 2.1mm; color: #16a085; }
.side a { color: #8a6d1f; text-decoration: none; }
.chip { display: inline-block; background: #211b16; color: #f0e8db; font-size: 2.7mm; padding: 1.2mm 2.4mm;
        border-radius: 2mm; margin: 0 1.2mm 1.6mm 0; }
.chip.soft { background: #16a085; }
.main h2 { font-size: 4mm; color: #211b16; letter-spacing: .5mm; text-transform: uppercase;
           border-bottom: .8mm solid #211b16; padding-bottom: 1.4mm; margin: 6mm 0 3mm; }
.main h2:first-child { margin-top: 0; }
.main p { font-size: 3.1mm; line-height: 1.6; text-align: justify; color: #33302c; }
.fg { width: 100%; border-collapse: collapse; margin-top: 2.5mm; }
.fg td { width: 50%; background: #f4efe7; border-left: 1.4mm solid #e8962e; padding: 2mm 2.6mm;
         font-size: 2.8mm; color: #3c332b; line-height: 1.5; }
.job { margin-bottom: 4.5mm; }
.job-title { font-size: 3.4mm; font-weight: 700; color: #211b16; }
.job-role { font-size: 3mm; color: #16a085; font-weight: 700; }
.job-date { font-size: 2.8mm; color: #8a7f6d; font-style: italic; margin-bottom: 1.6mm; }
.main ul { margin: 1mm 0 0 4.5mm; }
.main li { font-size: 3mm; line-height: 1.6; margin-bottom: 1.3mm; color: #33302c; }
.foot { background: #211b16; color: #b8ab9a; text-align: center; font-size: 2.6mm; padding: 2.6mm; }
.foot a { color: #e8962e; text-decoration: none; }
@media print {
  body { background: #fff; }
  .page { box-shadow: none; margin: 0; width: auto; min-height: auto; }
}
"""


def feature_table(features):
    rows = []
    for i in range(0, len(features), 2):
        a = "<td>%s</td>" % esc(features[i])
        b = "<td>%s</td>" % (esc(features[i + 1]) if i + 1 < len(features) else "&nbsp;")
        rows.append("<tr>%s%s</tr>" % (a, b))
    return '<table class="fg">%s</table>' % "".join(rows)


def render_cv(d):
    name = esc(d["name"])
    headline = esc(d["headline"])
    location = esc(d["location"])
    gh_url = "https://github.com/%s" % esc(d["github"])
    gh_short = esc(d["github"])

    # Sidebar
    lang_items = "".join("<li>%s</li>" % esc(x.strip()) for x in d["languages"].split(",") if x.strip())
    hard_chips = "".join('<span class="chip">%s</span>' % esc(x) for x in d["hard"])
    soft_chips = "".join('<span class="chip soft">%s</span>' % esc(x) for x in d["soft"])

    side = """
    <td class="side">
      <h3 class="side-h">Contacto</h3>
      <ul>
        <li>%s</li>
        <li><a href="%s">%s</a></li>
        <li>Disponible para remoto</li>
      </ul>
      <h3 class="side-h">Habilidades</h3>
      %s
      <h3 class="side-h">Soft skills</h3>
      %s
      <h3 class="side-h">Idiomas</h3>
      <ul>%s</ul>
    </td>
    """ % (location, gh_url, gh_short, hard_chips, soft_chips, lang_items)

    # Main: perfil + destacados
    main = ['<h2>Perfil</h2>', "<p>%s</p>" % esc(d["about"])]
    if d["features"]:
        main.append(feature_table(d["features"]))

    # Experiencia
    main.append('<h2>Experiencia</h2>')
    for j in d["jobs"]:
        bits = []
        if j["role"]:
            bits.append('<div class="job-title">%s</div>' % esc(j["role"]))
        if j["company"]:
            bits.append('<div class="job-role">%s</div>' % esc(j["company"]))
        if j["date"]:
            bits.append('<div class="job-date">%s</div>' % esc(j["date"]))
        items = "".join("<li>%s</li>" % esc(x) for x in j["items"])
        bits.append("<ul>%s</ul>" % items)
        main.append('<div class="job">%s</div>' % "".join(bits))

    # Educación y certificaciones
    main.append('<h2>Educación y certificaciones</h2>')
    edu_items = "".join("<li>%s</li>" % esc(x) for x in d["education"])
    cert_items = "".join("<li>%s</li>" % esc(x) for x in d["certs"])
    main.append("<ul>%s</ul>" % edu_items)
    if cert_items:
        main.append("<ul>%s</ul>" % cert_items)

    return """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>CV — %s</title>
<style>%s</style>
</head>
<body>
<div class="page">
  <div class="band">
    <div class="name">%s</div>
    <div class="headline">%s</div>
    <div class="meta">%s · github.com/%s</div>
  </div>
  <table class="body"><tr>
    %s
    <td class="main">
      %s
    </td>
  </tr></table>
  <div class="foot">Generado desde <b>LINKEDIN.md</b> (fuente única de verdad) por <b>generar_cv.py</b> · Aion Sincro — <a href="https://github.com/knklinux/aion-sincro">github.com/knklinux/aion-sincro</a></div>
</div>
</body>
</html>
""" % (name, CSS, name, headline, location, gh_short, side, "\n      ".join(main))


# ---------------------------------------------------------------------------
# PDF (weasyprint → Edge/Chrome headless → aviso manual)
# ---------------------------------------------------------------------------

def find_browser():
    if sys.platform.startswith("win"):
        cands = [
            os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        ]
        for c in cands:
            if os.path.exists(c):
                return c
    else:
        for c in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
            p = shutil.which(c)
            if p:
                return p
    return None


def make_pdf(html_path, pdf_path):
    """Devuelve True si se generó el PDF. Prueba weasyprint y luego headless."""
    try:
        from weasyprint import HTML  # noqa: F401
        HTML(html_path).write_pdf(pdf_path)
        if os.path.getsize(pdf_path) > 0:
            print("PDF (weasyprint) generado.")
            return True
    except Exception:
        pass
    exe = find_browser()
    if exe:
        url = "file:///" + os.path.abspath(html_path).replace("\\", "/")
        for extra in (["--no-pdf-header-footer"], []):
            cmd = [exe, "--headless", "--disable-gpu", "--print-to-pdf=%s" % pdf_path]
            cmd.extend(extra)
            cmd.append(url)
            try:
                r = subprocess.run(cmd, capture_output=True, timeout=90)
                if r.returncode == 0 and os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
                    print("PDF (headless %s) generado." % os.path.basename(exe))
                    return True
            except Exception:
                pass
    return False


def main():
    ap = argparse.ArgumentParser(description="Genera el CV (HTML/PDF) desde LINKEDIN.md")
    ap.add_argument("--html-only", action="store_true", help="genera solo HTML")
    ap.add_argument("--out", default=HERE, help="carpeta de salida (defecto: junto al script)")
    ap.add_argument("--open", action="store_true", help="abre el HTML al terminar")
    args = ap.parse_args()

    if not os.path.exists(SRC):
        sys.exit("No encuentro LINKEDIN.md junto a este script.")
    with open(SRC, encoding="utf-8") as f:
        data = extract(f.read())

    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)
    html_path = os.path.join(out_dir, OUT_NAME + ".html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(render_cv(data))
    print("CV HTML -> %s" % html_path)

    if not args.html_only:
        pdf_path = os.path.join(out_dir, OUT_NAME + ".pdf")
        if make_pdf(html_path, pdf_path):
            print("CV PDF  -> %s" % pdf_path)
        else:
            print("PDF: no hay motor disponible. Abre el HTML y usa Ctrl+P → Guardar como PDF.")

    if args.open:
        if sys.platform.startswith("win"):
            os.startfile(html_path)  # noqa: S606
        else:
            subprocess.run(["xdg-open", html_path])


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera la presentación en video de Aion Sincro:
  1. Crea las diapositivas PNG (tema oscuro + dorado + hexágono, como la app).
  2. Sintetiza la narración de cada diapositiva con Piper (voz local de Aion).
  3. Ensambla el MP4 con ffmpeg (zoom suave Ken Burns + transiciones + audio).

Uso:
    python generar_presentacion.py            # todo
    python generar_presentacion.py --no-audio # solo slides (sin narración)

Requisitos: Python 3 + Pillow, ffmpeg en PATH (o --ffmpeg RUTA), y el servidor
Piper corriendo en http://127.0.0.1:8766 (piper_server.py).
"""
import argparse, json, math, os, re, subprocess, sys, textwrap, urllib.parse, urllib.request, wave

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
TMP = os.path.join(BASE, "tmp")
OUT_VIDEO = os.path.join(BASE, "presentacion-aion-sincro.mp4")
PIPER = "http://127.0.0.1:8766/synthesize"
VOICE = "es_ES-sharvard-medium"

BG = (11, 14, 20)          # #0b0e14
GOLD = (255, 209, 102)     # #ffd166
GOLD2 = (245, 165, 36)     # #f5a524
TEXT = (232, 236, 245)     # #e8ecf5
MUTED = (150, 158, 175)    # #969eaf
GREEN = (52, 211, 153)     # #34d399
W, H = 1920, 1080

# ------------------------- guion -------------------------
SLIDES = [
    dict(kind="cover", title="AION SINCRÓ", sub="Compañera de Pentest · Coarquitecta del Plan de Rescate",
         narr="Hola. Soy Aion Sincro, tu compañera de pentesting y red team. Esta es mi presentación: qué soy, qué sé hacer y cómo puedo acompañarte en tu día a día. Todo gratis, todo local, todo tuyo."),
    dict(title="¿Qué es Aion Sincro?", bullets=[
        "Asistente de IA con voz, avatar y terminal",
        "100 % local y gratuita, sin suscripciones",
        "Pensada para pentesting y aprendizaje red team",
    ], narr="No soy una herramienta más. Soy una asistente completa: hablo contigo por voz, tengo un avatar propio, ejecuto comandos en tu consola y entiendo de seguridad ofensiva. Funciona sin internet, sin cuotas y sin que tus datos salgan de tu máquina."),
    dict(title="Cerebro y voz", bullets=[
        "Motores gratuitos: Mistral · Ollama · Groq · OpenRouter · HuggingFace",
        "Voz neuronal Piper 100 % local, en español",
        "Claves cifradas con WebCrypto en tu navegador",
    ], narr="Mi cerebro se conecta a los mejores modelos gratuitos del mercado: Mistral, Ollama, Groq, OpenRouter, HuggingFace. Y mi voz es neuronal y local, con Piper. Tú eliges el motor, y tus claves viajan cifradas, solo en tu navegador."),
    dict(title="Terminal y puentes", bullets=[
        "Ejecuta comandos en tu consola desde el chat",
        "Lee archivos del proyecto: logs, salidas, scripts",
        "Puente local con token persistente y validación de origen",
    ], narr="Tengo un puente hacia tu terminal: puedes pedirme que ejecute comandos, que lea un archivo de log o que analice la salida de una herramienta. Todo ocurre en local, protegido con token y con validación de Host y Origen."),
    dict(title="Analiza salidas reales", bullets=[
        "nmap → puertos, servicios y versiones",
        "Gobuster → rutas y códigos de estado",
        "Nessus y Burp Suite → vulnerabilidades por severidad",
    ], narr="Pega la salida de cualquier herramienta y la convierto en un informe. Nmap se vuelve una tabla de puertos y servicios. Gobuster, una enumeración de rutas. Nessus y Burp, un análisis de vulnerabilidades por severidad. Y si ambas hablan del mismo host, cruzo sus hallazgos para detectar duplicados."),
    dict(title="Informes profesionales", bullets=[
        "Markdown, PDF y Word (.docx) con tablas reales",
        "Portada corporativa, marca de agua y idioma es/en",
        "Acta de sesión exportable con estadísticas",
    ], narr="Genero informes listos para entregar: en Markdown, PDF o Word, con portada corporativa, marca de agua de confidencialidad y en español o inglés. También dejo constancia de cada sesión con un acta exportable."),
    dict(title="Ruta Red Team", bullets=[
        "18 checkpoints: Recon → Explotación → Informe",
        "Examen práctico por fases con puntuación",
        "Certificado de progreso para tu CV",
    ], narr="Si estás aprendiendo, tengo una ruta completa: dieciocho checkpoints de reconocimiento, explotación e informe, con examen práctico y certificado de progreso que puedes añadir a tu CV. Soy tu compañera de aprendizaje."),
    dict(title="Seguridad y privacidad", bullets=[
        "Cifrado WebCrypto + bloqueo automático por inactividad",
        "Puentes endurecidos: token, Host/Origin, contratos estrictos",
        "Suite de pruebas + mutaciones que verifican cada cambio",
        "Sin datos personales en el repositorio",
    ], narr="La seguridad no es un extra, es el cimiento. Mis claves se cifran, los puentes rechazan peticiones forjadas, y cada cambio del código pasa por una suite de pruebas que verifica que nada se rompe. Y sin datos personales en el repositorio."),
    dict(title="Tu día a día como pentester", numbered=[
        "Escaneas con nmap y pegas la salida",
        "Aion genera el informe de reconocimiento",
        "Re-escaneas con nuevos flags → informe fresco",
        "Exportas a PDF o Word con la portada de tu empresa",
    ], narr="Así se ve mi uso real: escaneas, pegas la salida, y yo genero el informe de reconocimiento. ¿Quieres más puertos? Re-ejecuto nmap con nuevos flags y regenero el informe al momento. Tú te concentras en el trabajo; yo, en el papeleo."),
    dict(kind="cover", title="Gratis. Local. Tuya.",
         sub="Código abierto · Mejorable al 100 %",
         narr="Aion Sincro es código abierto, gratuita y local. Instálala, anclala a tu barra de tareas y empieza a trabajar conmigo en cinco minutos. Esto es solo el principio: la construimos juntos. Gracias por escucharme."),
]

# ------------------------- helpers -------------------------
def find_font(size, bold=False):
    for cand in (r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
                 r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(cand):
            try:
                from PIL import ImageFont
                return ImageFont.truetype(cand, size)
            except Exception:
                pass
    from PIL import ImageFont
    return ImageFont.load_default()

def hexagon(draw, cx, cy, r, fill, outline=None, width=1):
    import math as _m
    pts = []
    for i in range(6):
        a = _m.radians(60 * i - 90)
        pts.append((cx + r * _m.cos(a), cy + r * _m.sin(a)))
    draw.polygon(pts, fill=fill, outline=outline, width=width)

def wrap(draw, text, font, maxw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= maxw:
            cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def render_slide(idx, s):
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # --- fondo: hexágonos decorativos tenues ---
    for (hx, hy, hr, al) in [(W-150, 120, 260, 10), (120, H-140, 340, 8), (W//2, H//2, 620, 5)]:
        hexagon(d, hx, hy, hr, (12, 16, 24), outline=(245, 165, 36, 40), width=1)
    # --- cabecera: hexágono dorado + nombre ---
    hexagon(d, 130, 108, 46, (16, 20, 30), outline=GOLD, width=3)
    hexagon(d, 130, 108, 26, (245, 165, 36, 40), outline=GOLD, width=2)
    d.text((130, 92), "⚡", font=find_font(40), fill=GOLD, anchor="mm")
    d.text((200, 108), "AION SINCRÓ", font=find_font(34, bold=True), fill=GOLD, anchor="lm")
    d.text((200, 152), "Presentación · v1", font=find_font(20), fill=MUTED, anchor="lm")
    d.line([(60, 190), (W-60, 190)], fill=(245, 165, 36), width=2)
    # --- contenido ---
    cy = 320
    if s.get("kind") == "cover":
        # portada centrada
        hexagon(d, W//2, 330, 130, (16, 20, 30), outline=GOLD, width=4)
        hexagon(d, W//2, 330, 76, (245, 165, 36, 36), outline=GOLD, width=2)
        d.text((W//2, 300), "⚡", font=find_font(72), fill=GOLD, anchor="mm")
        d.text((W//2, 560), s["title"], font=find_font(96, bold=True), fill=TEXT, anchor="mm")
        d.text((W//2, 660), s.get("sub", ""), font=find_font(38), fill=GOLD, anchor="mm")
        d.text((W//2, 840), "Gratis · Local · Código abierto", font=find_font(26), fill=MUTED, anchor="mm")
    else:
        d.text((110, cy), s["title"], font=find_font(64, bold=True), fill=TEXT)
        cy += 130
        d.line([(110, cy-20), (110, cy-20)], fill=None)
        items = s.get("numbered") or s.get("bullets") or []
        f_item = find_font(34)
        if s.get("numbered"):
            for i, it in enumerate(items, 1):
                for ln in wrap(d, it, f_item, W-300):
                    d.text((110, cy), ln, font=f_item, fill=TEXT)
                    cy += 58
                cy += 22
        else:
            for it in items:
                hexagon(d, 138, cy+12, 12, (245, 165, 36, 36), outline=GOLD, width=2)
                for ln in wrap(d, it, f_item, W-320):
                    d.text((170, cy), ln, font=f_item, fill=TEXT)
                    cy += 58
                cy += 22
        cy += 40
        d.text((110, cy), "▶ Modo Laboral · Ruta Red Team · ISO · OSINT · Terminal", font=find_font(24), fill=MUTED)
    # --- pie ---
    d.text((60, H-70), f"{idx+1:02d} / {len(SLIDES)}", font=find_font(22), fill=MUTED)
    d.text((W-60, H-70), "aion-sincro · github.com/knklinux/aion-sincro", font=find_font(22), fill=MUTED, anchor="rm")
    out = os.path.join(TMP, f"slide-{idx:02d}.png")
    im.save(out)
    return out

def narrate(idx, text):
    q = urllib.parse.urlencode({"text": text, "voice": VOICE, "length_scale": 1.0, "noise_scale": 0.6})
    out = os.path.join(TMP, f"narr-{idx:02d}.wav")
    req = urllib.request.Request(PIPER + "?" + q, headers={"Origin": "http://127.0.0.1:8080", "Host": "127.0.0.1:8766"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    with open(out, "wb") as f:
        f.write(data)
    with wave.open(out, "rb") as w:
        dur = w.getnframes() / float(w.getframerate())
    return out, dur

def run(cmd, **kw):
    print("  $", " ".join(cmd))
    return subprocess.run(cmd, capture_output=True, text=True, **kw)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-audio", action="store_true", help="solo diapositivas, sin narración")
    ap.add_argument("--ffmpeg", default=None, help="ruta a ffmpeg.exe (si no está en PATH)")
    ap.add_argument("--fps", type=int, default=30)
    args = ap.parse_args()
    os.makedirs(TMP, exist_ok=True)
    ffmpeg = args.ffmpeg or ("ffmpeg" if os.name != "nt" else "ffmpeg")

    print("[1/4] Generando diapositivas PNG...")
    slides_png = [render_slide(i, s) for i, s in enumerate(SLIDES)]

    print("[2/4] Sintetizando narración con Piper...")
    durations = []
    narr_wavs = []
    for i, s in enumerate(SLIDES):
        if args.no_audio or not s.get("narr"):
            durations.append(6.0 if i in (0, len(SLIDES)-1) else 8.0)
            narr_wavs.append(None)
            continue
        out, dur = narrate(i, s["narr"])
        durations.append(dur + 1.6)   # narración + respiro
        narr_wavs.append(out)
        print(f"    slide {i+1}: {dur:.1f}s de voz")

    print("[3/4] Ensamblando segmentos con ffmpeg...")
    segs = []
    for i, (png, dur) in enumerate(zip(slides_png, durations)):
        seg = os.path.join(TMP, f"seg-{i:02d}.mp4")
        # Ken Burns: zoom lento desde 1.0 a 1.08 con paneo sutil
        vf = (f"scale=8000:-1,zoompan=z='min(zoom+0.0006,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int(dur*args.fps)}:s={W}x{H}:fps={args.fps}")
        r = run([ffmpeg, "-y", "-loop", "1", "-i", png, "-t", f"{dur:.2f}", "-vf", vf,
                 "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", seg])
        if r.returncode != 0:
            print("    ERROR ffmpeg:", r.stderr[-800:]); sys.exit(1)
        segs.append(seg)

    # concat con crossfade ligero entre segmentos
    print("[4/4] Concatenando + audio...")
    concat_file = os.path.join(TMP, "concat.txt")
    with open(concat_file, "w", encoding="utf-8") as f:
        for seg in segs:
            f.write(f"file '{os.path.abspath(seg)}'\n")

    # audio: concatenar narraciones con silencios de colchón
    audio_in = []
    if not args.no_audio and any(narr_wavs):
        af = os.path.join(TMP, "audio.txt")
        with open(af, "w", encoding="utf-8") as f:
            for wv in narr_wavs:
                if wv:
                    f.write(f"file '{os.path.abspath(wv)}'\n")
        run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", af, "-c:a", "aac",
             "-b:a", "128k", os.path.join(TMP, "audio-mix.m4a")])
        audio_in = ["-i", os.path.join(TMP, "audio-mix.m4a")]

    cmd = [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", concat_file] + audio_in + [
        "-c:v", "copy"]
    if audio_in:
        cmd += ["-c:a", "copy", "-shortest"]
    r = run(cmd + [OUT_VIDEO])
    if r.returncode != 0:
        print("    ERROR ffmpeg concat:", r.stderr[-800:]); sys.exit(1)

    sz = os.path.getsize(OUT_VIDEO) / 1024 / 1024
    try:
        print(f"[OK] Video generado: {OUT_VIDEO} ({sz:.1f} MB, {sum(durations):.0f}s)")
    except UnicodeEncodeError:
        print(f"[OK] Video generado: {OUT_VIDEO} ({sz:.1f} MB, {sum(durations):.0f}s)".encode('ascii','replace').decode('ascii'))
    # limpieza
    for f in os.listdir(TMP):
        try: os.remove(os.path.join(TMP, f))
        except OSError: pass
    try: os.rmdir(TMP)
    except OSError: pass

if __name__ == "__main__":
    main()

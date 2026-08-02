#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen-launcher-icons.py — genera los PNGs de ic_launcher de Aion Sincro
   en todas las densidades (mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi) a partir del
   diseño vectorial.

   Renderiza el logo de Aion (hexágono + delta Δ + líneas de circuito)
   en la paleta Aion Sincro (#080604 fondo, #f5a524 oro, #34d399 esmeralda).

   Requiere: Pillow (python -m pip install Pillow)
   Uso:    python gen-launcher-icons.py
"""

import math
import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("ERROR: Pillow no encontrado. Instalalo con: python -m pip install Pillow")
    sys.exit(1)

# ── Densidades Android ───────────────────────────────────────────────
DENSITIES = {
    "mdpi":    48,
    "hdpi":    72,
    "xhdpi":   96,
    "xxhdpi":  144,
    "xxxhdpi": 192,
}

# ── Paleta Aion Sincro ───────────────────────────────────────────────
BG      = (0x08, 0x06, 0x04)  # #080604
BG_GLOW = (0x1c, 0x13, 0x08)  # #1c1308
GOLD    = (0xf5, 0xa5, 0x24)  # #f5a524
GOLD_DIM = (0xf5, 0xa5, 0x24, 80)
GOLD_FAINT = (0xf5, 0xa5, 0x24, 21)
GOLD_LIGHT = (0xff, 0xd1, 0x66)  # #ffd166
EMERALD = (0x34, 0xd3, 0x99)  # #34d399
GRID    = (0xf5, 0xa5, 0x24, 8)   # muy tenue


def hex_corner(cx, cy, size, i):
    """Devuelve la esquina i de un hexágono centrado en (cx, cy)."""
    angle = math.radians(60 * i - 30)
    return (cx + size * math.cos(angle), cy + size * math.sin(angle))


def hex_points(cx, cy, size):
    """Devuelve la lista de 6 puntos de un hexágono."""
    return [hex_corner(cx, cy, size, i) for i in range(6)]


def pt_to_px(pt, scale, base=108):
    """Convierte una coordenada del viewport 108 a píxeles."""
    return pt * scale / base


def draw_aion_icon(size):
    """Dibuja el icono de Aion Sincro en el tamaño dado y devuelve la imagen."""
    scale = size
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    cx, cy = size / 2, size / 2

    # ── Fondo radial ──────────────────────────────────────────────
    r_glow = pt_to_px(44, scale)
    for r in range(int(r_glow), 0, -1):
        t = r / r_glow
        c = (
            int(BG[0] + (BG_GLOW[0] - BG[0]) * t),
            int(BG[1] + (BG_GLOW[1] - BG[1]) * t),
            int(BG[2] + (BG_GLOW[2] - BG[2]) * t),
        )
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)

    # ── Rejilla ───────────────────────────────────────────────────
    grid_step = pt_to_px(18, scale)
    for i in range(int(size / grid_step) + 1):
        pos = i * grid_step
        draw.line([(pos, 0), (pos, size)], fill=GRID, width=1)
        draw.line([(0, pos), (size, pos)], fill=GRID, width=1)

    # ── Hexágono exterior (sutil) ─────────────────────────────────
    hex_sz = pt_to_px(34.7, scale)
    pts = hex_points(cx, cy, hex_sz)
    draw.polygon(pts, fill=None, outline=GOLD_FAINT, width=max(1, int(pt_to_px(1.5, scale))))

    # ── Hexágono principal ────────────────────────────────────────
    hex_main = pt_to_px(27.3, scale)
    pts_main = hex_points(cx, cy, hex_main)
    draw.polygon(pts_main, fill=None, outline=GOLD, width=max(2, int(pt_to_px(2.2, scale))))

    # ── Hexágono interior (dashed) ────────────────────────────────
    hex_inner = pt_to_px(17.7, scale)
    pts_inner = hex_points(cx, cy, hex_inner)
    draw.polygon(pts_inner, fill=None, outline=GOLD_DIM, width=max(1, int(pt_to_px(1, scale))))

    # ── Delta central ─────────────────────────────────────────────
    delta_top = cy - pt_to_px(13, scale)
    delta_bot = cy + pt_to_px(2, scale)
    delta_half = pt_to_px(10, scale)
    delta_pts = [
        (cx, delta_top),
        (cx + delta_half, delta_bot),
        (cx - delta_half, delta_bot),
    ]
    draw.polygon(delta_pts, fill=GOLD)

    # Delta highlight (triángulo interior más claro)
    hl_top = cy - pt_to_px(11, scale)
    hl_bot = cy - pt_to_px(4, scale)
    hl_half = pt_to_px(6, scale)
    hl_pts = [
        (cx, hl_top),
        (cx + hl_half, hl_bot),
        (cx - hl_half, hl_bot),
    ]
    draw.polygon(hl_pts, fill=GOLD_LIGHT)

    # ── Visor esmeralda ───────────────────────────────────────────
    visor_y = cy + pt_to_px(4, scale)
    visor_w = pt_to_px(14, scale)
    visor_h = max(2, int(pt_to_px(2, scale)))
    draw.rectangle(
        [cx - visor_w / 2, visor_y, cx + visor_w / 2, visor_y + visor_h],
        fill=EMERALD,
    )

    # ── Líneas de circuito ────────────────────────────────────────
    line_w = max(1, int(pt_to_px(1.5, scale)))
    # Superior
    top_y = cy - hex_main
    draw.line([(cx, top_y), (cx, top_y - pt_to_px(6, scale))], fill=GOLD_DIM[:3], width=line_w)
    # Inferior
    bot_y = cy + hex_main
    draw.line([(cx, bot_y), (cx, bot_y + pt_to_px(6.8, scale))], fill=GOLD_DIM[:3], width=line_w)
    # Izquierda
    left_x = cx - hex_main * math.cos(math.radians(30))
    left_y = cy - hex_main * math.sin(math.radians(30))
    draw.line([(left_x, left_y), (left_x - pt_to_px(8, scale), left_y - pt_to_px(5, scale))], fill=GOLD_DIM[:3], width=line_w)
    # Derecha
    right_x = cx + hex_main * math.cos(math.radians(30))
    right_y = cy - hex_main * math.sin(math.radians(30))
    draw.line([(right_x, right_y), (right_x + pt_to_px(8, scale), right_y - pt_to_px(5, scale))], fill=GOLD_DIM[:3], width=line_w)

    # ── Nodos ─────────────────────────────────────────────────────
    node_r = max(2, int(pt_to_px(2, scale)))
    # Superior
    draw.ellipse([cx - node_r, top_y - pt_to_px(8, scale) - node_r,
                  cx + node_r, top_y - pt_to_px(8, scale) + node_r], fill=EMERALD)
    # Izquierda
    draw.ellipse([left_x - pt_to_px(10, scale) - node_r, left_y - pt_to_px(6, scale) - node_r,
                  left_x - pt_to_px(10, scale) + node_r, left_y - pt_to_px(6, scale) + node_r], fill=EMERALD)
    # Derecha
    draw.ellipse([right_x + pt_to_px(10, scale) - node_r, right_y - pt_to_px(6, scale) - node_r,
                  right_x + pt_to_px(10, scale) + node_r, right_y - pt_to_px(6, scale) + node_r], fill=EMERALD)

    return img


def main():
    res_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "android", "app", "src", "main", "res"
    )

    if not os.path.isdir(res_dir):
        print("ERROR: No se encontro", res_dir)
        print("  Ejecuta este script desde mobile/ después de npx cap add android")
        sys.exit(1)

    for density, size in DENSITIES.items():
        mipmap_dir = os.path.join(res_dir, f"mipmap-{density}")
        os.makedirs(mipmap_dir, exist_ok=True)

        # Generar icono principal (cuadrado)
        icon = draw_aion_icon(size)
        path_main = os.path.join(mipmap_dir, "ic_launcher.png")
        icon.save(path_main, "PNG")
        print(f"  OK ic_launcher.png  ({density:6s}  {size}x{size})")

        # Redondo: recortar con círculo de 84% del tamaño (safe zone Android)
        round_icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mask = Image.new("L", (size, size), 0)
        mask_draw = ImageDraw.Draw(mask)
        r = int(size * 0.46)  # radio para ~92% del icono dentro del círculo
        mask_draw.ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r], fill=255)
        round_icon.paste(icon, (0, 0), mask)
        path_round = os.path.join(mipmap_dir, "ic_launcher_round.png")
        round_icon.save(path_round, "PNG")
        print(f"  OK ic_launcher_round.png  ({density:6s})")

        # Foreground (mismo diseño, fondo transparente)
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        fg_draw = ImageDraw.Draw(fg)

        # Redibujar solo el foreground sobre fondo transparente
        cx, cy = size / 2, size / 2
        hex_main = size * 27.3 / 108
        pts_main = hex_points(cx, cy, hex_main)
        fg_draw.polygon(pts_main, fill=None, outline=GOLD, width=max(2, int(size * 2.2 / 108)))

        # Delta
        delta_top_fg = cy - size * 13 / 108
        delta_bot_fg = cy + size * 2 / 108
        delta_half_fg = size * 10 / 108
        fg_draw.polygon(
            [(cx, delta_top_fg), (cx + delta_half_fg, delta_bot_fg), (cx - delta_half_fg, delta_bot_fg)],
            fill=GOLD,
        )
        hl_top_fg = cy - size * 11 / 108
        hl_bot_fg = cy - size * 4 / 108
        hl_half_fg = size * 6 / 108
        fg_draw.polygon(
            [(cx, hl_top_fg), (cx + hl_half_fg, hl_bot_fg), (cx - hl_half_fg, hl_bot_fg)],
            fill=GOLD_LIGHT,
        )

        # Visor
        visor_y_fg = cy + size * 4 / 108
        visor_w_fg = size * 14 / 108
        visor_h_fg = max(2, int(size * 2 / 108))
        fg_draw.rectangle(
            [cx - visor_w_fg / 2, visor_y_fg, cx + visor_w_fg / 2, visor_y_fg + visor_h_fg],
            fill=EMERALD,
        )

        path_fg = os.path.join(mipmap_dir, "ic_launcher_foreground.png")
        fg.save(path_fg, "PNG")
        print(f"  OK ic_launcher_foreground.png  ({density:6s})")

    print(f"\nOK {len(DENSITIES)} densidades generadas en {res_dir}/")


if __name__ == "__main__":
    main()

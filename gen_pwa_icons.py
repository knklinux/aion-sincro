#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera los iconos PNG de la PWA de Aion Sincro (sin dependencias: stdlib).

Uso:  python gen_pwa_icons.py
Salida: icons/aion-192.png, icons/aion-512.png, icons/aion-maskable-512.png
"""
import os
import struct
import zlib
import math


def point_in_poly(px, py, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    if L2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def poly_stroke_alpha(px, py, poly, width):
    d = min(seg_dist(px, py, poly[i][0], poly[i][1], poly[(i + 1) % len(poly)][0], poly[(i + 1) % len(poly)][1])
            for i in range(len(poly)))
    return max(0.0, 1.0 - d / (width / 2.0))


def rounded_rect_sdf(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    dx = max(qx, 0.0)
    dy = max(qy, 0.0)
    return math.hypot(dx, dy) + min(max(qx, qy), 0.0) - r


def hexagon(cx, cy, r):
    return [(cx + r * math.cos(math.radians(-90 + 60 * i)), cy + r * math.sin(math.radians(-90 + 60 * i)))
            for i in range(6)]


def delta_tri(cx, cy, r):
    return [(cx, cy - r * 0.72), (cx - r * 0.62, cy + r * 0.5), (cx + r * 0.62, cy + r * 0.5)]


def render(size, out, maskable=False, content=1.0):
    cx = cy = size / 2.0
    u = size / 512.0
    R = 200 * content * u
    outer = hexagon(cx, cy, R)
    inner = hexagon(cx, cy, R * 0.68)
    tri = delta_tri(cx, cy, R * 0.62)
    corner_r = 0.0 if maskable else 100 * u
    hw = hh = (size / 2.0) - (6 * u if not maskable else 0)

    def pixel(x, y):
        r = g = b = 0.0
        samples = 0
        for dx in (-0.3333, 0.0, 0.3333):
            for dy in (-0.3333, 0.0, 0.3333):
                px, py = x + dx, y + dy
                if not maskable and rounded_rect_sdf(px, py, cx, cy, hw, hh, corner_r) > 0:
                    continue
                dd = min(math.hypot(px - cx, py - cy) / (size * 0.72), 1.0)
                cr = 23 + (8 - 23) * dd
                cg = 17 + (6 - 17) * dd
                cb = 10 + (4 - 10) * dd
                glow = poly_stroke_alpha(px, py, outer, 46 * u)
                cr += (245 - cr) * glow * 0.10
                cg += (165 - cg) * glow * 0.10
                cb += (36 - cb) * glow * 0.10
                s1 = poly_stroke_alpha(px, py, outer, 13 * u)
                cr += (245 - cr) * s1
                cg += (165 - cg) * s1
                cb += (36 - cb) * s1
                if point_in_poly(px, py, inner):
                    cr += (16 - cr) * 0.12
                    cg += (185 - cg) * 0.12
                    cb += (129 - cb) * 0.12
                s2 = poly_stroke_alpha(px, py, inner, 7 * u)
                cr += (16 - cr) * s2
                cg += (185 - cg) * s2
                cb += (129 - cb) * s2
                if point_in_poly(px, py, tri):
                    cr, cg, cb = 245, 165, 36
                r += cr
                g += cg
                b += cb
                samples += 1
        if samples == 0:
            return (0, 0, 0, 0)
        n = float(samples)
        return (r / n, g / n, b / n, 255)

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            pr, pg, pb, pa = pixel(x, y)
            row += bytes((int(pr), int(pg), int(pb), int(pa)))
        rows.append(bytes(row))
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(t, data):
        return struct.pack(">I", len(data)) + t + data + struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(out, "wb") as f:
        f.write(png)
    print("generado", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    os.makedirs("icons", exist_ok=True)
    render(512, "icons/aion-512.png")
    render(192, "icons/aion-192.png")
    render(512, "icons/aion-maskable-512.png", maskable=True, content=0.86)

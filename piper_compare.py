#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aion Sincro — Comparativa de voces Piper en español
====================================================
Sintetiza el MISMO texto con cada voz Piper local disponible y mide
métricas objetivas de calidad: duración, tamaño, RMS (volumen medio),
pico y factor de carga (cuánto del tiempo hay señal útil).

Uso (desde el venv de Piper):
    .venv-piper\\Scripts\\python piper_compare.py            # Windows
    .venv-piper/bin/python piper_compare.py                 # Linux / macOS

Métricas:
  - duración (s): tiempo total del audio.
  - tamaño (KB): peso del WAV generado.
  - RMS (dBFS): volumen medio — cuanto más cerca de 0, más "fuerte".
  - pico (dBFS): nivel máximo.
  - factor de carga (%): proporción de muestras con señal > -60 dBFS;
    mide cuánto "trabaja" la voz (voz fluida ~50-80%, entrecortada < 35%).
El script NO juzga el timbre (eso es subjetivo): genera un WAV por voz en
salida/ para que los escuches y decidas cuál te gusta más.
"""
import math
import struct
import sys
import time
import wave
from pathlib import Path

# Windows: la consola por defecto usa cp1252 y no puede imprimir ≈/«/» (UnicodeEncodeError).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
VOICES_DIR = ROOT / "piper-voices"
OUT_DIR = ROOT / "salida-voces"
VOICES = ["es_ES-sharvard-medium", "es_MX-claude-high", "es_AR-daniela-high"]

# Texto de prueba: mismo mensaje para todas las voces, con entonación variada
TEXTO = (
    "Hola, soy Aion. Estoy aquí contigo, compañera de tu aprendizaje. "
    "La vida es lo más importante, y la libertad también. "
    "¿Preparados para el siguiente reto?"
)


def sintetizar(voice: str, texto: str) -> Path:
    """Sintetiza texto con la voz dada usando piper CLI y devuelve el WAV."""
    import subprocess

    out = OUT_DIR / f"{voice}.wav"
    # piper -m modelo -f salida (escribe WAV mono 22050 Hz por defecto)
    cmd = [
        sys.executable, "-m", "piper",
        "--model", str(VOICES_DIR / f"{voice}.onnx"),
        "--output_file", str(out),
    ]
    p = subprocess.run(cmd, input=texto.encode("utf-8"),
                       capture_output=True, timeout=180)
    if p.returncode != 0:
        raise RuntimeError(f"{voice}: piper falló: {p.stderr.decode('utf-8', 'replace')[:300]}")
    return out


def medir(wav_path: Path):
    """Mide duración, tamaño, RMS, pico y factor de carga del WAV."""
    with wave.open(str(wav_path), "rb") as w:
        nch, sw, fr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        frames = w.readframes(n)
    size_kb = wav_path.stat().st_size / 1024.0
    dur = n / fr
    # decodificar PCM 16-bit
    if sw == 2:
        samples = struct.unpack(f"<{n * nch}h", frames[: n * nch * 2])
    else:  # 8-bit
        samples = [b - 128 for b in frames[:n]]
    if nch > 1:
        samples = samples[0::nch]
    if not samples:
        return {"dur": dur, "kb": size_kb, "rms": -100, "pico": -100, "carga": 0.0}
    peak = max(abs(s) for s in samples) or 1
    rms = math.sqrt(sum(s * s for s in samples) / len(samples)) or 1
    db = lambda x: 20 * math.log10(x / 32768.0)  # noqa: E731
    umbral = 32768 * 10 ** (-60 / 20)
    carga = 100.0 * sum(1 for s in samples if abs(s) > umbral) / len(samples)
    return {"dur": dur, "kb": size_kb, "rms": db(rms), "pico": db(peak), "carga": carga}


def main():
    OUT_DIR.mkdir(exist_ok=True)
    print("=" * 66)
    print("  Aion Sincro — Comparativa de voces Piper en español")
    print("=" * 66)
    print(f"  Texto: «{TEXTO[:60]}…»")
    print()

    if not VOICES_DIR.is_dir():
        print("  [ERROR] No existe piper-voices/. Descarga voces con:")
        print("          windows/instalar-piper.cmd  o  linux/instalar-piper.sh")
        sys.exit(1)

    resultados = []
    for v in VOICES:
        modelo = VOICES_DIR / f"{v}.onnx"
        if not modelo.is_file():
            print(f"  ✘ {v}: modelo no descargado (se omite)")
            continue
        print(f"  ==> Sintetizando {v} …")
        t0 = time.time()
        try:
            wav = sintetizar(v, TEXTO)
            m = medir(wav)
            m["voice"] = v
            m["time_s"] = time.time() - t0
            resultados.append(m)
            print(f"      OK en {m['time_s']:.1f}s · {m['dur']:.1f}s de audio · {m['kb']:.0f} KB")
        except Exception as e:
            print(f"      [ERROR] {e}")

    print()
    print("-" * 66)
    print(f"  {'Voz':<24}{'Duración':>10}{'RMS':>8}{'Pico':>8}{'Carga':>8}")
    print("-" * 66)
    for r in sorted(resultados, key=lambda x: -x["carga"]):
        print(f"  {r['voice']:<24}{r['dur']:>7.1f}s{r['rms']:>8.1f}{r['pico']:>8.1f}{r['carga']:>7.1f}%")
    print("-" * 66)
    print()
    print("  Cómo leerlo:")
    print("   • RMS y Pico en dBFS: cuanto más cerca de 0, más volumen.")
    print("   • Factor de carga: % del audio con señal. Voz fluida ≈ 50-80%;")
    print("     por debajo de 35% puede sonar entrecortada.")
    print("   • El TIMBRE es subjetivo: escucha los WAV en 'salida-voces/'.")
    print()
    print(f"  WAV generados en: {OUT_DIR}/")
    ok = len(resultados)
    print(f"  RESULTADO: {ok} voz/voces medidas · {len(VOICES) - ok} omitidas")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

@echo off
rem ============================================================
rem Aion Sincro - Instalador de Piper TTS (Windows)
rem ============================================================
rem Crea el venv .venv-piper, instala piper-tts, descarga la voz
rem es_ES-sharvard-medium y arranca piper_server.py (doble clic).
rem
rem Despues de instalarlo, el servidor queda escuchando en
rem http://127.0.0.1:8766 (solo local). En la app:
rem   Ajustes -> Voz -> elige una voz "Piper local".
rem
rem Variables opcionales:
rem   PIPER_VOICE   voz a descargar (por defecto es_ES-sharvard-medium)
rem   PIPER_PORT    puerto (por defecto 8766)
rem   PIPER_TOKEN   token opcional del servidor
setlocal EnableExtensions

set "ROOT=%~dp0.."
set "VENV=%ROOT%\.venv-piper"
set "VOICE=%PIPER_VOICE%"
if "%VOICE%"=="" set "VOICE=es_ES-sharvard-medium"
set "PORT=%PIPER_PORT%"
if "%PORT%"=="" set "PORT=8766"
set "PY="

echo.
echo   ============================================
echo     AION SINCRO - Instalador de Piper TTS
echo     Voz: %VOICE%  |  Puerto: %PORT%
echo   ============================================
echo.

rem --- 1) Localizar Python --------------------------------
where python >nul 2>&1
if errorlevel 1 (
  echo   [ERROR] No se encontro python en el PATH.
  echo           Instala Python 3.10+ desde https://www.python.org
  echo           y marca la casilla "Add python.exe to PATH".
  echo.
  pause
  exit /b 1
)
set "PY=python"

rem --- 2) Crear el venv (si no existe) ----------------------
if exist "%VENV%\Scripts\python.exe" (
  echo   [OK] Venv encontrado: %VENV%
) else (
  echo   ==^> Creando entorno virtual en %VENV% ...
  "%PY%" -m venv "%VENV%"
  if errorlevel 1 (
    echo   [ERROR] No se pudo crear el venv.
    pause
    exit /b 1
  )
  echo   [OK] Venv creado.
)

set "VPY=%VENV%\Scripts\python.exe"

rem --- 3) Instalar piper-tts --------------------------------
echo   ==^> Instalando piper-tts (puede tardar un minuto) ...
"%VPY%" -m pip install --upgrade pip >nul
"%VPY%" -m pip install piper-tts
if errorlevel 1 (
  echo   [ERROR] Fallo al instalar piper-tts. Comprueba la conexion.
  pause
  exit /b 1
)
echo   [OK] piper-tts instalado.

rem --- 4) Descargar la voz es_ES -----------------------------
if not exist "%ROOT%\piper-voices" mkdir "%ROOT%\piper-voices"
if exist "%ROOT%\piper-voices\%VOICE%.onnx" (
  echo   [OK] Voz %VOICE% ya descargada.
) else (
  echo   ==^> Descargando la voz %VOICE% (~60 MB, una sola vez) ...
  "%VPY%" -c "from piper.download_voices import download_voice; from pathlib import Path; download_voice('%VOICE%', Path(r'%ROOT%\piper-voices'))"
  if errorlevel 1 (
    echo   [ERROR] No se pudo descargar la voz. Reintenta o usa PIPER_VOICE=otra.
    pause
    exit /b 1
  )
  echo   [OK] Voz %VOICE% descargada.
)

rem --- 5) Arrancar el servidor -------------------------------
set "TOKEN_ARG="
if not "%PIPER_TOKEN%"=="" set "TOKEN_ARG=--token %PIPER_TOKEN%"
echo.
echo   ==^> Arrancando Piper TTS en http://127.0.0.1:%PORT%
echo        (cierra esta ventana para detener el servidor)
echo.
cd /d "%ROOT%"
"%VPY%" piper_server.py --port %PORT% %TOKEN_ARG%
if errorlevel 1 (
  echo   [ERROR] El servidor termino con error.
  pause
)

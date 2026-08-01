@echo off
rem ============================================================
rem Aion Sincro — Lanzador para Windows
rem ============================================================
rem 1. Sirve la app en http://127.0.0.1:%PORT_APP% (necesario para
rem    el micrófono: Web Speech solo funciona en localhost/HTTPS).
rem 2. Arranca el puente de terminal en 127.0.0.1:%PORT_BRIDGE%.
rem 3. Abre el navegador.
rem
rem Funciona en dos modos:
rem   · Instalado (install.cmd): los archivos están en su MISMA carpeta
rem     (%LOCALAPPDATA%\AionSincro) y hay un token persistente en 'token'.
rem   · Repo: los archivos están en la carpeta PADRE (windows\..).
rem
rem Variables de entorno opcionales:
rem     AION_APP_PORT     puerto web (por defecto 8080)
rem     AION_BRIDGE_PORT  puerto del puente (por defecto 8765)
setlocal EnableExtensions

rem --- Localiza la carpeta de la app (instalada o repo) ---
if exist "%~dp0index.html" (
  set "APP_DIR=%~dp0"
) else (
  set "APP_DIR=%~dp0.."
)
set "PORT_APP=%AION_APP_PORT%"
set "PORT_BRIDGE=%AION_BRIDGE_PORT%"
if "%PORT_APP%"=="" set "PORT_APP=8080"
if "%PORT_BRIDGE%"=="" set "PORT_BRIDGE=8765"

rem --- Token persistente (modo instalado) ---
set "BRIDGE_TOKEN="
if exist "%APP_DIR%\token" set /p BRIDGE_TOKEN=<"%APP_DIR%\token"

cd /d "%APP_DIR%" || (echo [ERROR] No encuentro la carpeta del proyecto: %APP_DIR% & pause & exit /b 1)

echo.
echo   ============================================
echo     AION SINCRÓ - Compañera de Pentest y Red Team
echo   ============================================
echo.
echo   Sirviendo la app en  http://127.0.0.1:%PORT_APP%/
echo.

rem --- 1) Servidor web (python preferido, node como respaldo) ---
where python >nul 2>&1
if %errorlevel%==0 (
  start "Aion Sincro Web" /min cmd /c "cd /d ""%APP_DIR%"" && python -m http.server %PORT_APP% --bind 127.0.0.1"
) else (
  where node >nul 2>&1
  if %errorlevel%==0 (
    start "Aion Sincro Web" /min cmd /c "cd /d ""%APP_DIR%"" && node -e "const http=require('http'),fs=require('fs'),path=require('path');http.createServer((q,r)=>{let f=q.url==='/'?'index.html':q.url.split('?')[0].replace(/^\\//,'');f=path.normalize(path.join(process.cwd(),f));if(!f.startsWith(process.cwd())){r.writeHead(403);return r.end()}fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200);r.end(d)})}).listen(%PORT_APP%,'127.0.0.1')"
  ) else (
    echo   [ERROR] Se necesita python o node para servir la app.
    pause & exit /b 1
  )
)

rem --- 2) Puente de terminal -------------------------------------
where python >nul 2>&1
if %errorlevel%==0 (
  if defined BRIDGE_TOKEN (
    start "Aion Sincro Bridge" /min cmd /c "cd /d ""%APP_DIR%"" && python bridge.py --port %PORT_BRIDGE% --token ""%BRIDGE_TOKEN%"""
  ) else (
    start "Aion Sincro Bridge" /min cmd /c "cd /d ""%APP_DIR%"" && python bridge.py --port %PORT_BRIDGE%"
  )
) else (
  where node >nul 2>&1
  if %errorlevel%==0 (
    if defined BRIDGE_TOKEN (
      start "Aion Sincro Bridge" /min cmd /c "cd /d ""%APP_DIR%"" && node bridge.mjs --port %PORT_BRIDGE% --token ""%BRIDGE_TOKEN%"""
    ) else (
      start "Aion Sincro Bridge" /min cmd /c "cd /d ""%APP_DIR%"" && node bridge.mjs --port %PORT_BRIDGE%"
    )
  )
)

rem --- 3) Abre el navegador ---------------------------------------
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%PORT_APP%/"

echo   Listo. Token del puente: revisa la ventana 'Aion Sincro Bridge'
if defined BRIDGE_TOKEN (
  echo   (token persistente de instalación; pégalo en Ajustes -^> Terminal local)
) else (
  echo   (pégalo en Ajustes -^> Terminal local).
)
echo.
timeout /t 2 /nobreak >nul
exit /b 0

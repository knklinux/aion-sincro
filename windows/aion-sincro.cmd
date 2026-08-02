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

rem --- Token persistente del puente (se genera UNA vez y se reutiliza) ---
rem En modo repo tambien se crea 'token': si no existiera, bridge.py generaria
rem un token aleatorio en CADA arranque y la app nunca coincidiria (403 en /run).
rem Con el fichero, el token es estable entre lanzamientos y la app lo adopta
rem solo (fetch 'token' del mismo origen).
set "BRIDGE_TOKEN="
if exist "%APP_DIR%\token" (
  set /p BRIDGE_TOKEN=<"%APP_DIR%\token"
) else (
  where python >nul 2>&1
  if %errorlevel%==0 (
    python -c "import secrets,io,sys;io.open(r'%APP_DIR%\token','w',encoding='utf-8').write(secrets.token_hex(16))"
  ) else (
    where node >nul 2>&1
    if %errorlevel%==0 (
      node -e "require('fs').writeFileSync(process.argv[1],require('crypto').randomBytes(16).toString('hex'))" "%APP_DIR%\token"
    )
  )
  if exist "%APP_DIR%\token" set /p BRIDGE_TOKEN=<"%APP_DIR%\token"
)

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
    start "Aion Sincro Web" /min cmd /c "cd /d ""%APP_DIR%"" && node ""%~dp0serve.js"" %PORT_APP%"
  ) else (
    echo   [ERROR] Se necesita python o node para servir la app.
    pause & exit /b 1
  )
)

rem --- 2) Puente de terminal -------------------------------------
rem (BRIDGE_TOKEN siempre definido: persistente o generado arriba)
where python >nul 2>&1
if %errorlevel%==0 (
  start "Aion Sincro Bridge" /min cmd /c "cd /d ""%APP_DIR%"" && python bridge.py --port %PORT_BRIDGE% --token ""%BRIDGE_TOKEN%"""
) else (
  where node >nul 2>&1
  if %errorlevel%==0 (
    start "Aion Sincro Bridge" /min cmd /c "cd /d ""%APP_DIR%"" && node bridge.mjs --port %PORT_BRIDGE% --token ""%BRIDGE_TOKEN%"""
  )
)

rem --- 3) Piper local (voz neuronal, si esta instalado) -----------
if exist "%APP_DIR%\.venv-piper\Scripts\python.exe" (
  start "Aion Sincro Piper" /min cmd /c "cd /d ""%APP_DIR%"" && .venv-piper\Scripts\python.exe piper_server.py"
  echo   [Piper] arrancado en  http://127.0.0.1:8766  (voz local activa)
) else (
  echo   [Piper] no detectado — ejecuta windows\instalar-piper.cmd para la voz local
)

rem --- 4) Abre el navegador ---------------------------------------
rem Usamos la ruta completa del timeout de Windows: el GNU timeout de Git
rem Bash (si su PATH precede a System32) no entiende /t y escupe ruido, y el
rem retardo es NECESARIO para que el servidor web acabe de arrancar antes de
rem abrir el navegador.
%SystemRoot%\System32\timeout.exe /t 1 /nobreak >nul
start "" "http://127.0.0.1:%PORT_APP%/"

echo   Listo. Resumen de la sesión:
echo     · App web      http://127.0.0.1:%PORT_APP%/
echo     · Puente       http://127.0.0.1:%PORT_BRIDGE%  (token persistente en 'token' —
echo                   la app lo adopta sola al cargar; no hace falta pegarlo)
echo     · Piper        http://127.0.0.1:8766  (si está instalado)
echo.
%SystemRoot%\System32\timeout.exe /t 2 /nobreak >nul
exit /b 0

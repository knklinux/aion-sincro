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
rem Modo startup (AION_STARTUP=1): solo arranca servicios (web+puente+
rem Piper) en segundo plano, sin navegador, banner, ni timeout.
rem Lo activa aion-sincro-startup.vbs desde la carpeta de Inicio.
rem
rem Variables de entorno opcionales:
rem     AION_APP_PORT     puerto web (por defecto 8080)
rem     AION_BRIDGE_PORT  puerto del puente (por defecto 8765)
rem     AION_STARTUP=1    modo silencioso (sin navegador ni pausas)
setlocal EnableExtensions EnableDelayedExpansion
set "STARTUP_MODE=0"
if /i "%AION_STARTUP%"=="1" set "STARTUP_MODE=1"

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

cd /d "%APP_DIR%" || (if "%STARTUP_MODE%"=="0" echo [ERROR] No encuentro la carpeta del proyecto: %APP_DIR% & if "%STARTUP_MODE%"=="0" pause & exit /b 1)

if "%STARTUP_MODE%"=="0" (
  echo.
  echo   ============================================
  echo     AION SINCRÓ - Compañera de Pentest y Red Team
  echo   ============================================
  echo.
)

rem --- 0) Limpiar servicios de sesiones anteriores (evita conflictos de puerto) ---
if "%STARTUP_MODE%"=="0" echo   Cerrando servicios de sesiones anteriores...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /c:"127.0.0.1:%PORT_APP% "') do taskkill /pid %%a /f 2>nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /c:"127.0.0.1:%PORT_BRIDGE% "') do taskkill /pid %%a /f 2>nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /c:"127.0.0.1:8766 "') do taskkill /pid %%a /f 2>nul
%SystemRoot%\System32\timeout.exe /t 1 /nobreak >nul

if "%STARTUP_MODE%"=="0" (
  echo   Sirviendo la app en  http://127.0.0.1:%PORT_APP%/
  echo.
)

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
  if "%STARTUP_MODE%"=="0" echo   [Piper] arrancado en  http://127.0.0.1:8766  (voz local activa)
) else (
  if "%STARTUP_MODE%"=="0" echo   [Piper] no detectado — ejecuta windows\instalar-piper.cmd para la voz local
)

rem --- 4) Espera activa a que el puente esté listo (máx 8 intentos) ---
if "%STARTUP_MODE%"=="0" echo   Verificando servicios...
set "BRIDGE_OK=0"
where curl >nul 2>&1
if %errorlevel%==0 (
  for /L %%i in (1,1,8) do (
    if "!BRIDGE_OK!"=="0" (
      curl -s http://127.0.0.1:%PORT_BRIDGE%/ping >nul 2>&1
      if !errorlevel!==0 set "BRIDGE_OK=1"
      if "!BRIDGE_OK!"=="0" %SystemRoot%\System32\timeout.exe /t 1 /nobreak >nul
    )
  )
) else (
  powershell -Command "for($i=0;$i -lt 8;$i++){try{$r=Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT_BRIDGE%/ping' -UseBasicParsing -TimeoutSec 2;if($r.StatusCode -eq 200){exit 0}}catch{}Start-Sleep 1}exit 1" >nul 2>&1
  if !errorlevel!==0 set "BRIDGE_OK=1"
)

rem --- 5) Abre el navegador (solo en modo normal) --------------------
if "%STARTUP_MODE%"=="0" (
  start "" "http://127.0.0.1:%PORT_APP%/index.html"

  echo   Listo. Resumen de la sesión:
  echo     · App web      http://127.0.0.1:%PORT_APP%/
  echo     · Puente       http://127.0.0.1:%PORT_BRIDGE%  (token persistente en 'token' —
  echo                   la app lo adopta sola al cargar; no hace falta pegarlo)
  echo     · Piper        http://127.0.0.1:8766  (si está instalado)
  if "!BRIDGE_OK!"=="1" (
    echo     · Estado       puente conectado ^✔
  ) else (
    echo     · Estado       puente NO detectado — si falla, revisa que python esté en el PATH
  )
  echo.
  %SystemRoot%\System32\timeout.exe /t 2 /nobreak >nul
)
exit /b 0

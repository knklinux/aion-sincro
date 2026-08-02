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
rem
rem Log de arranque: en cualquier modo se escribe startup.log junto a la app
rem con marcas de tiempo y el estado de cada servicio. En modo STARTUP es la
rem única forma de diagnosticar un fallo (no hay ventana de consola).
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

rem --- Log de arranque (startup.log) -------------------------------
set "STARTUP_LOG=%APP_DIR%\startup.log"
if exist "%STARTUP_LOG%" for %%F in ("%STARTUP_LOG%") do if %%~zF GTR 262144 del "%STARTUP_LOG%" >nul 2>&1
if "%STARTUP_MODE%"=="1" (
  call :log "=== Aion Sincro arranque silencioso  %date% %time%  ==="
) else (
  call :log "=== Aion Sincro arranque  %date% %time%  ==="
)
rem (usamos %CD% y no %APP_DIR%: este ultimo termina en barra invertida y
rem  un argumento ...\" final rompe la busqueda de la etiqueta :log en cmd;
rem  ademas %CD% ya esta resuelto porque el cd /d de arriba ya se ejecuto)
call :log "Carpeta: %CD%"
call :log "Puertos: web=%PORT_APP%  puente=%PORT_BRIDGE%  piper=8766"
if exist "%APP_DIR%\token" (call :log "Token puente: persistente (token)") else (call :log "Token puente: se genera al arrancar")

if "%STARTUP_MODE%"=="0" (
  echo.
  echo   ============================================
  echo     AION SINCRÓ - Compañera de Pentest y Red Team
  echo   ============================================
  echo.
)
call :log "Modo: %STARTUP_MODE% (1=startup silencioso, 0=normal)"

rem --- 0) Limpiar servicios de sesiones anteriores (evita conflictos de puerto) ---
if "%STARTUP_MODE%"=="0" echo   Cerrando servicios de sesiones anteriores...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /c:"127.0.0.1:%PORT_APP% "') do taskkill /pid %%a /f 2>nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /c:"127.0.0.1:%PORT_BRIDGE% "') do taskkill /pid %%a /f 2>nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /c:"127.0.0.1:8766 "') do taskkill /pid %%a /f 2>nul
rem (usamos ping en vez de timeout: funciona aunque stdin este redirigido,
rem  como ocurre al lanzar el VBS oculto desde la carpeta de Inicio)
%SystemRoot%\System32\ping.exe -n 2 127.0.0.1 >nul

if "%STARTUP_MODE%"=="0" (
  echo   Sirviendo la app en  http://127.0.0.1:%PORT_APP%/
  echo.
)

rem --- 1) Servidor web (python preferido, node como respaldo) ---
where python >nul 2>&1
if %errorlevel%==0 (
  start "Aion Sincro Web" /min cmd /c "cd /d ""%APP_DIR%"" && python -m http.server %PORT_APP% --bind 127.0.0.1"
  call :log "Web: python -m http.server %PORT_APP% (127.0.0.1)"
) else (
  where node >nul 2>&1
  if %errorlevel%==0 (
    start "Aion Sincro Web" /min cmd /c "cd /d ""%APP_DIR%"" && node ""%~dp0serve.js"" %PORT_APP%"
    call :log "Web: node serve.js %PORT_APP% (127.0.0.1)"
  ) else (
    call :log "Web: ERROR - no hay python ni node en el PATH"
    echo   [ERROR] Se necesita python o node para servir la app.
    pause & exit /b 1
  )
)

rem --- 2) Puente de terminal -------------------------------------
rem (BRIDGE_TOKEN siempre definido: persistente o generado arriba)
where python >nul 2>&1
if %errorlevel%==0 (
  start "Aion Sincro Bridge" /min cmd /c "cd /d ""%APP_DIR%"" && python bridge.py --port %PORT_BRIDGE% --token ""%BRIDGE_TOKEN%"""
  call :log "Puente: python bridge.py --port %PORT_BRIDGE%"
) else (
  where node >nul 2>&1
  if %errorlevel%==0 (
    start "Aion Sincro Bridge" /min cmd /c "cd /d ""%APP_DIR%"" && node bridge.mjs --port %PORT_BRIDGE% --token ""%BRIDGE_TOKEN%"""
    call :log "Puente: node bridge.mjs --port %PORT_BRIDGE%"
  ) else (
    call :log "Puente: ERROR - no hay python ni node en el PATH"
  )
)

rem --- 3) Piper local (voz neuronal, si esta instalado) -----------
rem (usa goto y no un bloque con () para evitar el fallo del parser de cmd
rem  con `if ... echo ... (parens)` dentro de un bloque parentizado)
if not exist "%APP_DIR%\.venv-piper\Scripts\python.exe" goto piper_no
  start "Aion Sincro Piper" /min cmd /c "cd /d ""%APP_DIR%"" && .venv-piper\Scripts\python.exe piper_server.py"
  if "%STARTUP_MODE%"=="0" echo   [Piper] arrancado en  http://127.0.0.1:8766  - voz local activa
  call :log "Piper: arrancado en http://127.0.0.1:8766"
  goto piper_fin
:piper_no
  if "%STARTUP_MODE%"=="0" echo   [Piper] no detectado — ejecuta windows\instalar-piper.cmd para la voz local
  call :log "Piper: no detectado (.venv-piper\Scripts\python.exe ausente)"
:piper_fin

rem --- 4) Espera activa a que el puente esté listo (máx 8 intentos) ---
if "%STARTUP_MODE%"=="0" echo   Verificando servicios...
set "BRIDGE_OK=0"
where curl >nul 2>&1
if %errorlevel%==0 (
  for /L %%i in (1,1,8) do (
    if "!BRIDGE_OK!"=="0" (
      curl -s http://127.0.0.1:%PORT_BRIDGE%/ping >nul 2>&1
      if !errorlevel!==0 set "BRIDGE_OK=1"
      if "!BRIDGE_OK!"=="0" %SystemRoot%\System32\ping.exe -n 2 127.0.0.1 >nul
    )
  )
) else (
  powershell -Command "for($i=0;$i -lt 8;$i++){try{$r=Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT_BRIDGE%/ping' -UseBasicParsing -TimeoutSec 2;if($r.StatusCode -eq 200){exit 0}}catch{}Start-Sleep 1}exit 1" >nul 2>&1
  if !errorlevel!==0 set "BRIDGE_OK=1"
)

rem --- 4b) Registro del estado del puente en el log ------------------
if "!BRIDGE_OK!"=="1" (
  call :log "Puente: conectado en http://127.0.0.1:%PORT_BRIDGE%/ping"
) else (
  call :log "Puente: NO conectado tras 8 intentos - revisa python/node en el PATH"
)
call :log "Fin de arranque  %time%"

rem --- 4c) Detectar Edge (apertura preferida de la app) --------------
rem (se hace FUERA del bloque con () porque %ProgramFiles(x86)% contiene
rem  parentesis que romperian el parser de cmd dentro de un bloque)
set "EDGE_BIN="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_BIN=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_BIN if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_BIN=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

rem --- 5) Abre la app en Edge (o el navegador por defecto) ------------
rem (dos detalles de cmd.exe:
rem  - !EDGE_BIN! con delayed expansion DENTRO del bloque: el valor contiene
rem    "(x86)" y %EDGE_BIN% se expande al parsear el bloque, rompiendo el
rem    conteo de parentesis y dejando sin ejecutar lineas siguientes
rem  - los mensajes de :log NO pueden llevar el caracter ">" (ni flechas
rem    "->"): call :log interpreta ">" como redireccion y rompe el parseo)
if "%STARTUP_MODE%"=="0" (
  if defined EDGE_BIN (
    start "" "!EDGE_BIN!" --app=http://127.0.0.1:%PORT_APP%/index.html
    call :log "Navegador: Edge (modo app) en http://127.0.0.1:%PORT_APP%/index.html"
  ) else (
    start "" "http://127.0.0.1:%PORT_APP%/index.html"
    call :log "Navegador: por defecto (Edge no detectado)"
  )

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
  %SystemRoot%\System32\ping.exe -n 3 127.0.0.1 >nul
)

rem --- Subrutina de log (usa STARTUP_LOG; segura en bloques con () ) ---
:log
if "%~1"=="" exit /b 0
>> "%STARTUP_LOG%" echo [%date% %time%] %~1
exit /b 0

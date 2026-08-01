@echo off
rem ============================================================
rem Aion Sincro - Instalador para Windows
rem ============================================================
rem Instala la app en una carpeta estable (%LOCALAPPDATA%\AionSincro),
rem genera el token del puente (solo la primera vez), crea el acceso
rem directo del Escritorio y deja todo listo para arrancar con doble clic.
rem Desinstala con: windows\uninstall.cmd
rem
rem Variables de entorno opcionales (para pruebas / personalización):
rem     AION_DEST           carpeta de instalación (por defecto
rem                         %LOCALAPPDATA%\AionSincro)
rem     AION_NO_SHORTCUT=1  no crear el acceso directo (CI/pruebas)
setlocal EnableExtensions EnableDelayedExpansion

set "DEST=%AION_DEST%"
if "%DEST%"=="" set "DEST=%LOCALAPPDATA%\AionSincro"
set "SRC=%~dp0.."

echo.
echo   ============================================
echo     AION SINCRÓ - Instalador de Windows
echo   ============================================
echo.

rem --- Dependencias: se necesita python o node --------------------
where python >nul 2>&1
set "HAS_PY=%errorlevel%"
where node >nul 2>&1
set "HAS_NODE=%errorlevel%"
if not "%HAS_PY%"=="0" if not "%HAS_NODE%"=="0" goto no_runtime

echo   Instalando en: %DEST%
if not exist "%DEST%" mkdir "%DEST%"

echo   ==^> Copiando archivos de la app...
copy /y "%SRC%\index.html"        "%DEST%\" >nul
copy /y "%SRC%\bridge.py"         "%DEST%\" >nul
copy /y "%SRC%\bridge.mjs"        "%DEST%\" >nul
copy /y "%SRC%\LICENSE"           "%DEST%\" >nul
copy /y "%SRC%\README.md"         "%DEST%\" >nul
copy /y "%SRC%\SECURITY.md"       "%DEST%\" >nul
copy /y "%SRC%\NUCLEO_MEMORIA.md" "%DEST%\" >nul
copy /y "%SRC%\MANIFIESTO.md"     "%DEST%\" >nul
copy /y "%SRC%\COMPARATIVA.md"    "%DEST%\" >nul
copy /y "%~dp0aion-sincro.cmd"          "%DEST%\" >nul
copy /y "%~dp0crear-acceso-directo.ps1" "%DEST%\" >nul

rem --- Token del puente (solo la primera vez) ----------------------
rem NOTA: el for /f con parentesis dentro de un bloque if ( ... )
rem rompe el parseo de cmd; por eso usamos goto en vez de bloques.
if exist "%DEST%\token" goto token_listo
set "TOKEN="
if not "%HAS_PY%"=="0" goto token_no_py
for /f "delims=" %%t in ('python -c "import secrets;print(secrets.token_hex(16))"') do set "TOKEN=%%t"
:token_no_py
if defined TOKEN goto token_ok
for /f "delims=" %%t in ('powershell -NoProfile -Command "[guid]::NewGuid()"') do set "TOKEN=%%t"
:token_ok
if defined TOKEN (
  > "%DEST%\token" echo !TOKEN!
) else (
  echo   [aviso] No se pudo generar token automaticamente; usa python o powershell.
)
:token_listo

rem --- Acceso directo (opcional en pruebas) ------------------------
if "%AION_NO_SHORTCUT%"=="1" goto no_shortcut
echo   ==^> Creando acceso directo en el Escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\crear-acceso-directo.ps1" -InstallDir "%DEST%"
goto shortcut_ok
:no_shortcut
echo   ==^> Acceso directo omitido (AION_NO_SHORTCUT=1).
:shortcut_ok

set "TOKEN="
if exist "%DEST%\token" set /p TOKEN=<"%DEST%\token"

echo.
echo   ============================================
echo     AION SINCRÓ instalado
echo   ============================================
echo   Carpeta:     %DEST%
if defined TOKEN echo   Token del puente (Ajustes -^> Terminal local):
if defined TOKEN echo      %TOKEN%
echo.
echo   Para abrirla:      doble clic en "Aion Sincro" del Escritorio
echo   Para desinstalar:  windows\uninstall.cmd
echo   ============================================
echo.
pause
exit /b 0

:no_runtime
echo   [ERROR] Se necesita Python 3 o Node.js para servir la app.
echo   Instala Python desde https://www.python.org/downloads/
echo   (marca "Add python.exe to PATH") o Node desde https://nodejs.org/
echo.
pause
exit /b 1

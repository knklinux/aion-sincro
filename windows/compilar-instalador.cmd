@echo off
rem ============================================================
rem Aion Sincro - Compilador del instalador unificado (.exe)
rem ============================================================
rem Instala Inno Setup si no esta presente (via winget) y compila
rem aion-sincro-setup.iss -> dist\AionSincro-Setup.exe
rem
rem Uso:   windows\compilar-instalador.cmd
rem ============================================================
setlocal EnableExtensions EnableDelayedExpansion

echo.
echo   ============================================
echo     AION SINCRÓ - Compilador del instalador
echo   ============================================
echo.
rem (el banner usa SINCRÓ con acento solo visualmente; el resto del script
rem  y el .iss son ASCII puro para evitar problemas de codificacion)

rem --- 1) Buscar ISCC.exe (Inno Setup Compiler) ------------------
rem (extraemos %ProgramFiles(x86)% a variables: usarlo dentro de un bloque
rem  for ( ... ) con parentesis en el nombre rompe el parser de cmd)
set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"
set "ISCC="
for %%P in (
  "%PF86%\Inno Setup 6\ISCC.exe"
  "%PF%\Inno Setup 6\ISCC.exe"
  "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
) do (
  if not defined ISCC if exist "%%~P" set "ISCC=%%~P"
)
where ISCC >nul 2>&1 && set "ISCC=ISCC"

if not defined ISCC (
  echo   Inno Setup no detectado. Intentando instalarlo con winget...
  where winget >nul 2>&1
  if errorlevel 1 (
    echo   [ERROR] No hay winget ni Inno Setup.
    echo   Descargalo e instalalo desde:  https://jrsoftware.org/isdl.php
    echo   (marca "Inno Setup 6" y deja las opciones por defecto).
    pause
    exit /b 1
  )
  winget install --id JRSoftware.InnoSetup -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo   [ERROR] winget no pudo instalar Inno Setup.
    echo   Instalalo a mano desde:  https://jrsoftware.org/isdl.php
    pause
    exit /b 1
  )
  rem Rebuscar tras instalar
  for %%P in (
    "%PF86%\Inno Setup 6\ISCC.exe"
    "%PF%\Inno Setup 6\ISCC.exe"
    "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
  ) do (
    if not defined ISCC if exist "%%~P" set "ISCC=%%~P"
  )
  if not defined ISCC (
    echo   [ERROR] Inno Setup instalado pero no encuentro ISCC.exe.
    echo   Abre Inno Setup una vez y vuelve a ejecutar este script.
    pause
    exit /b 1
  )
)

echo   ISCC encontrado: %ISCC%
echo.

rem --- 2) Compilar el .iss ---------------------------------------
set "ISS_FILE=%~dp0aion-sincro-setup.iss"
if not exist "%ISS_FILE%" (
  echo   [ERROR] No encuentro aion-sincro-setup.iss junto a este script.
  pause
  exit /b 1
)

"%ISCC%" "%ISS_FILE%"
if errorlevel 1 (
  echo.
  echo   [ERROR] La compilacion fallo (revisa el mensaje de ISCC arriba).
  pause
  exit /b 1
)

echo.
echo   ============================================
echo     INSTALADOR GENERADO
echo   ============================================
echo   dist\AionSincro-Setup.exe  (junto a este script)
echo.
echo   Compartelo o ejecutalo: instala la app, crea el acceso
echo   directo, ancla a la barra de tareas y activa el arranque
echo   automatico, todo en un solo paso, sin permisos de admin.
echo   ============================================
echo.
pause
exit /b 0

@echo off
rem ============================================================
rem Aion Sincro - Desinstalador para Windows
rem ============================================================
rem Detiene el servidor web y el puente (ventanas "Aion Sincro Web"
rem y "Aion Sincro Bridge"), elimina la carpeta instalada
rem (%LOCALAPPDATA%\AionSincro), el token y el acceso directo.
rem
rem Variables de entorno opcionales (para pruebas):
rem     AION_DEST           carpeta instalada (por defecto
rem                         %LOCALAPPDATA%\AionSincro)
rem     AION_NO_SHORTCUT=1  no tocar el acceso directo del Escritorio
setlocal EnableExtensions

set "DEST=%AION_DEST%"
if "%DEST%"=="" set "DEST=%LOCALAPPDATA%\AionSincro"

echo.
echo   ============================================
echo     AION SINCRÓ - Desinstalador de Windows
echo   ============================================
echo.
echo Se eliminará Aion Sincro:
echo   · %DEST%
if not "%AION_NO_SHORTCUT%"=="1" echo   · Acceso directo del Escritorio
echo.
set /p ANS="¿Continuar? [s/N] "
if /i not "%ANS%"=="s" if /i not "%ANS%"=="y" (
  echo Cancelado.
  exit /b 0
)

echo   ==^> Deteniendo servidor web y puente...
taskkill /F /FI "WINDOWTITLE eq Aion Sincro Web*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Aion Sincro Bridge*" >nul 2>&1
timeout /t 1 /nobreak >nul

echo   ==^> Eliminando archivos...
rmdir /s /q "%DEST%" 2>nul
if not "%AION_NO_SHORTCUT%"=="1" (
  powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop');Remove-Item -LiteralPath (Join-Path $d 'Aion Sincro.lnk') -Force -ErrorAction SilentlyContinue"
)

echo.
echo   OK. Aion Sincro desinstalado.
pause

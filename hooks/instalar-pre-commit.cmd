@echo off
rem ============================================================
rem  Aion Sincro — Instalar pre-commit hook (Windows)
rem  Copia hooks/pre-commit al directorio .git/hooks/ para que
rem  cada commit ejecute la suite de pruebas automáticamente.
rem
rem  Uso:  instalar-pre-commit.cmd   (doble clic o desde cmd)
rem  Bypass puntual:  git commit --no-verify
rem ============================================================
setlocal EnableExtensions
cd /d "%~dp0\.."

if not exist ".git\hooks" (
    echo  [X] No hay carpeta .git\hooks — ¿estás dentro del repo?
    pause
    exit /b 1
)

if not exist "hooks\pre-commit" (
    echo  [X] No encuentro hooks\pre-commit.
    pause
    exit /b 1
)

copy /y "hooks\pre-commit" ".git\hooks\pre-commit" >nul
if errorlevel 1 (
    echo  [X] No se pudo copiar el hook.
    pause
    exit /b 1
)

echo.
echo  [OK] Pre-commit hook instalado.
echo       Cada git commit ejecutará la suite de pruebas y
echo       se bloqueará si algo falla.
echo.
pause

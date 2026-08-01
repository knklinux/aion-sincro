@echo off
rem ============================================================
rem Aion Sincro — Lanzador del módulo OSINT (Windows)
rem ============================================================
rem Uso:
rem   aion-osint.cmd --user  nombre_usuario
rem   aion-osint.cmd --email persona@ejemplo.com
rem   aion-osint.cmd --phone "+34 612 345 678" --country ES
rem   aion-osint.cmd --domain ejemplo.com
rem
rem ⚖️ Úsalo solo sobre datos propios o con autorización.
setlocal EnableExtensions
cd /d "%~dp0.." || exit /b 1
where python >nul 2>&1
if %errorlevel%==0 (
  python aion_osint.py %*
) else (
  echo [ERROR] Se necesita Python 3 para ejecutar aion_osint.py
  exit /b 1
)
exit /b %errorlevel%

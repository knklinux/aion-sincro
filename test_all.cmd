@echo off
rem ============================================================
rem  Aion Sincro — Suite de pruebas completa (Windows)
rem  Ejecuta las pruebas del puente y de la app con un comando.
rem
rem  Uso:  test_all.cmd
rem ============================================================
cd /d "%~dp0"

echo.
echo ============================================================
echo   AION SINCRÓ — SUITE DE PRUEBAS
echo ============================================================
echo.

echo [1/4] test_bridge.py  (seguridad de puentes y servidores)
echo ------------------------------------------------------------
python test_bridge.py
if errorlevel 1 (
    echo.
    echo  *** FALLARON las pruebas del puente ***
    exit /b 1
)

echo.
echo [2/4] test_app.js  (sintaxis JS, secretos y funciones)
echo ------------------------------------------------------------
node test_app.js
if errorlevel 1 (
    echo.
    echo  *** FALLARON las pruebas de la app ***
    exit /b 1
)

echo.
echo [3/4] test_mutacion.py  (test de mutación: la regresión WebCrypto protege)
echo ------------------------------------------------------------
python test_mutacion.py
if errorlevel 1 (
    echo.
    echo  *** FALLÓ el test de mutación ***
    exit /b 1
)

echo.
echo [4/4] test_aion_osint.py  (módulo OSINT local: funciones puras + CLI)
echo ------------------------------------------------------------
python test_aion_osint.py
if errorlevel 1 (
    echo.
    echo  *** FALLARON las pruebas de OSINT ***
    exit /b 1
)

echo.
echo ============================================================
echo   TODO EN VERDE ✔  (la suite completa pasó)
echo ============================================================
exit /b 0

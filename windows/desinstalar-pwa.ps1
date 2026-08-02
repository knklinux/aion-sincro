# ============================================================
# Aion Sincro — Desinstalador de PWA (Edge / Chrome)
# ============================================================
# Elimina la instalación PWA anterior de Aion Sincro del
# navegador: desregistra el service worker, vacía la caché
# offline y borra los datos del sitio para 127.0.0.1:8080.
#
# Útil si:
#  · Instalaste la PWA vieja (cuando se llamaba "Hermes") y
#    ahora quieres instalar la nueva desde cero.
#  · La app offline muestra una versión antigua en caché.
#  · Quieres limpiar TODOS los rastros antes de reinstalar.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File desinstalar-pwa.ps1
#   powershell -ExecutionPolicy Bypass -File desinstalar-pwa.ps1 -Browser Chrome
#   powershell -ExecutionPolicy Bypass -File desinstalar-pwa.ps1 -Browser Edge -Port 8080
# ============================================================

param(
    [ValidateSet("Edge","Chrome","Ambos")]
    [string]$Browser = "Edge",

    [ValidateRange(1024,65535)]
    [int]$Port = 8080,

    [switch]$Help
)

if ($Help) {
    Write-Host @"
Aion Sincro — Desinstalador de PWA

Limpia la instalación PWA anterior de Aion Sincro del navegador.

Pasos que realiza:
  1. Abre edge://serviceworker-internals (o chrome://) para que
     puedas hacer clic en "Unregister" del SW de localhost.
  2. Abre la página de configuración de datos del sitio para
     127.0.0.1:$Port y borrar cookies/caché/datos.
  3. Muestra instrucciones claras en pantalla para completar
     la limpieza manual (Edge/Chrome no permiten automatizarlo
     por seguridad — es intencionado).

Parámetros:
  -Browser    Edge (por defecto), Chrome o Ambos
  -Port       Puerto de la app (por defecto 8080)
  -Help       Muestra esta ayuda

Ejemplos:
  .\desinstalar-pwa.ps1                     # Edge, puerto 8080
  .\desinstalar-pwa.ps1 -Browser Chrome     # Chrome, puerto 8080
  .\desinstalar-pwa.ps1 -Browser Ambos -Port 9090
"@
    exit 0
}

$ErrorActionPreference = "Continue"
$Origin = "http://127.0.0.1:$Port"

# ============================================================
# Función: abrir URL en el navegador ESPECIFICADO (no el por defecto)
# ============================================================
function Open-Url($url, $browserName) {
    Write-Host "  Abriendo $url en $browserName ..."
    try {
        if ($browserName -eq "Edge") {
            Start-Process "msedge" -ArgumentList $url -ErrorAction Stop
        } elseif ($browserName -eq "Chrome") {
            Start-Process "chrome" -ArgumentList $url -ErrorAction Stop
        }
    } catch {
        Write-Host "  ⚠️  No se pudo abrir $browserName (¿está instalado?)." -ForegroundColor Yellow
        Write-Host "     Abre manualmente esta URL: $url" -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 2
}

# ============================================================
# Función: limpiar un navegador concreto
# ============================================================
function Clear-Browser($browserName, $swInternalsUrl, $siteDataUrl) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  LIMPIANDO $browserName" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # --- Paso 1: Desregistrar el Service Worker ---
    Write-Host "  [1/3] Desregistrar Service Worker" -ForegroundColor Yellow
    Write-Host "  ─────────────────────────────────────"
    Write-Host ""
    Write-Host "  Se va a abrir $swInternalsUrl en $browserName."
    Write-Host "  Cuando se abra:"
    Write-Host "    1. Busca la entrada con Scope: $Origin/"
    Write-Host "       (o '127.0.0.1:$Port' o 'localhost:$Port')"
    Write-Host "    2. Haz clic en el botón [Unregister]"
    Write-Host "    3. Si no aparece, es que ya está desinstalado — sigue al paso 2."
    Write-Host ""
    Read-Host "  Pulsa ENTER para abrir el gestor de Service Workers"
    Open-Url $swInternalsUrl $browserName
    Write-Host ""
    Read-Host "  ¿Has hecho clic en [Unregister] (o no aparecía)? Pulsa ENTER para continuar"

    # --- Paso 2: Borrar datos del sitio ---
    Write-Host ""
    Write-Host "  [2/3] Borrar datos del sitio (caché offline, cookies, localStorage)" -ForegroundColor Yellow
    Write-Host "  ─────────────────────────────────────────────────────────────────"
    Write-Host ""
    Write-Host "  Se va a abrir la página de datos del sitio para $Origin"
    Write-Host "  Cuando se abra:"
    Write-Host "    1. Busca '127.0.0.1:$Port' en la lista (o 'localhost:$Port')"
    Write-Host "    2. Haz clic en el icono de la papelera 🗑️ junto a la entrada"
    Write-Host "    3. Confirma 'Borrar datos'"
    Write-Host "    4. Si no aparece, es que ya está limpio."
    Write-Host ""
    Read-Host "  Pulsa ENTER para abrir los datos del sitio"
    Open-Url $siteDataUrl $browserName
    Write-Host ""
    Read-Host "  ¿Has borrado los datos del sitio? Pulsa ENTER para continuar"

    # --- Paso 3: Verificación final (consola JS opcional) ---
    Write-Host ""
    Write-Host "  [3/3] Verificación con consola JavaScript (opcional)" -ForegroundColor Yellow
    Write-Host "  ──────────────────────────────────────────────────"
    Write-Host ""
    Write-Host "  Si quieres verificar que TODO está limpio, abre la consola (F12)"
    Write-Host "  en $Origin/index.html y pega este código:"
    Write-Host ""
    Write-Host "  ┌─────────────────────────────────────────────────────────┐"
    Write-Host "  │ navigator.serviceWorker.getRegistrations()              │"
    Write-Host "  │   .then(regs => {                                       │"
    Write-Host "  │     if (regs.length === 0) {                            │"
    Write-Host "  │       console.log('%c✔ NINGÚN SW REGISTRADO — limpio',  │"
    Write-Host "  │         'color:#10b981;font-size:16px');                │"
    Write-Host "  │     } else {                                            │"
    Write-Host "  │       regs.forEach(r => r.unregister());                │"
    Write-Host "  │       console.log('%c⚠ SWs eliminados — recarga',       │"
    Write-Host "  │         'color:#f5a524;font-size:16px');                │"
    Write-Host "  │     }                                                   │"
    Write-Host "  │   });                                                   │"
    Write-Host "  │                                                         │"
    Write-Host "  │ // También puedes limpiar TODO el storage:              │"
    Write-Host "  │ caches.keys().then(keys =>                              │"
    Write-Host "  │   Promise.all(keys.map(k => caches.delete(k)))          │"
    Write-Host "  │ ).then(() => console.log('✔ Cachés vaciadas'));         │"
    Write-Host "  └─────────────────────────────────────────────────────────┘"
    Write-Host ""

    Write-Host "  ✅ $browserName limpiado." -ForegroundColor Green
}

# ============================================================
# MAIN
# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  AION SINCRÓ — Desinstalador de PWA" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Origen:   $Origin"
Write-Host "  Puerto:   $Port"
Write-Host "  Navegador: $Browser"
Write-Host ""
Write-Host "  Este script te guiará para eliminar TODOS los rastros"
Write-Host "  de la instalación PWA anterior de Aion Sincro."
Write-Host ""
Write-Host "  ⚠️  NO se pierden claves ni configuraciones: las API keys"
Write-Host "     están en localStorage, no en la caché del SW."
Write-Host "     Tus claves sobreviven a esta limpieza."
Write-Host ""
Read-Host "  Pulsa ENTER para empezar (o Ctrl+C para cancelar)"

# --- URLs de gestión de SW y datos según navegador ---
$swUrls = @{
    Edge   = "edge://serviceworker-internals/"
    Chrome = "chrome://serviceworker-internals/"
}
$dataUrls = @{
    Edge   = "edge://settings/content/all?search=$Origin"
    Chrome = "chrome://settings/content/all?search=$Origin"
}

if ($Browser -eq "Ambos") {
    Clear-Browser "Edge"   $swUrls.Edge   $dataUrls.Edge
    Clear-Browser "Chrome" $swUrls.Chrome $dataUrls.Chrome
} else {
    Clear-Browser $Browser $swUrls[$Browser] $dataUrls[$Browser]
}

# --- Paso final: recordatorio de reinstalación ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ PWA DESINSTALADA — LIMPIEZA COMPLETA" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Para reinstalar Aion Sincro como PWA desde cero:"
Write-Host "    1. Asegúrate de que la app está corriendo:"
Write-Host "       doble clic en Aion Sincro.lnk del escritorio"
Write-Host "    2. Abre $Origin/index.html en Edge o Chrome"
Write-Host "    3. Verás el botón '⬇️ Instalar' en la cabecera de Aion"
Write-Host "       (junto a los modos Pentest/Sincronía/Laboral)"
Write-Host "    4. Haz clic y confirma la instalación"
Write-Host ""
Write-Host "  La nueva PWA usará el manifest.webmanifest y el service"
Write-Host "  worker (sw.js) actualizados — sin rastros de versiones"
Write-Host "  anteriores."
Write-Host ""

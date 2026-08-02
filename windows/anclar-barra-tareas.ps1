<#
.SYNOPSIS
  Ancla el lanzador de Aion Sincro a la barra de tareas de Windows.

.DESCRIPTION
  El problema: si anclas la PWA de Edge (el icono de la app instalada), al
  pulsarlo SOLO abre Edge apuntando a la URL - pero NO arranca el servidor
  HTTP ni el puente, asi que la app no carga (pagina muerta).

  La solucion: anclar el LANZADOR (windows\aion-sincro.cmd), que es el que
  arranca los servicios (web 8080 + puente 8765 + Piper) y luego abre la app.

  Este script crea el acceso directo "Aion Sincro.lnk" en la carpeta de
  tareas ancladas de Windows apuntando al lanzador, con el icono de Aion.

  Uso:  powershell -ExecutionPolicy Bypass -File anclar-barra-tareas.ps1

  Requisitos: ejecutar con permisos normales (sin admin). Windows 10/11.

  NOTA: texto ASCII puro a proposito (PowerShell 5.1 lee .ps1 como ANSI;
  los acentos romperian el parseo).

.NOTES
  Autor: Ark & Jimmy - Aion Sincro - Licencia MIT
#>

$ErrorActionPreference = "Stop"

# ------- Localizar el lanzador (modo repo: windows\.. ; modo instalado: misma carpeta) -------
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path (Join-Path $scriptDir "aion-sincro.cmd")) {
    $launcher = Join-Path $scriptDir "aion-sincro.cmd"
} else {
    $launcher = Join-Path $scriptDir "..\aion-sincro.cmd"
}
if (-not (Test-Path $launcher)) {
    Write-Host "ERROR: no encuentro aion-sincro.cmd en $scriptDir" -ForegroundColor Red
    exit 1
}
$appDir = Split-Path -Parent (Split-Path -Parent $launcher)

# Icono: si no existe .ico, usamos el propio .cmd (icono generico)
$icon = Join-Path $scriptDir "aion-sincro.ico"
if (-not (Test-Path $icon)) { $icon = "$launcher,0" } else { $icon = "$icon,0" }

# ------- Carpeta de tareas ancladas de la barra de tareas -------
$taskbarDir = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
if (-not (Test-Path $taskbarDir)) {
    New-Item -ItemType Directory -Path $taskbarDir -Force | Out-Null
}

$lnkPath = Join-Path $taskbarDir "Aion Sincro.lnk"

# ------- Crear el acceso directo -------
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = $launcher
$lnk.WorkingDirectory = $appDir
$lnk.IconLocation = $icon
$lnk.Description = "Aion Sincro - Companion de Pentest y Red Team (arranca servicios + app)"
$lnk.Save()

# ------- El .lnk ya esta en la carpeta de anclados: eso ES el pin -------
# El InvokeVerb('taskbarpin') de abajo es best-effort: Microsoft bloqueo el
# anclado programatico en Win10/11, asi que puede no hacer nada (no pasa nada,
# el .lnk ya esta en la carpeta correcta). Solo informamos si el icono no sale.
try {
    $shellApp = New-Object -ComObject Shell.Application
    $item = $shellApp.Namespace($taskbarDir).ParseName("Aion Sincro.lnk")
    if ($item) { $item.InvokeVerb("taskbarpin") | Out-Null }
} catch {}

Write-Host ""
Write-Host "OK - acceso directo creado en:" -ForegroundColor Green
Write-Host "  $lnkPath"
Write-Host "  Lanzador: $launcher"
Write-Host ""
Write-Host "Si el icono no aparece aun en la barra de tareas:" -ForegroundColor Cyan
Write-Host "  1. Espera unos segundos (Explorer tarda en refrescar) o reinicia el explorador" -ForegroundColor Gray
Write-Host "  2. Ve a Inicio y busca 'Aion Sincro' -> clic derecho -> Anclar a la barra de tareas" -ForegroundColor Gray
Write-Host ""
Write-Host "IMPORTANTE: desancla la PWA vieja de Edge de la barra de tareas" -ForegroundColor Yellow
Write-Host "  (clic derecho -> Desanclar). Esta PWA solo abre la URL sin arrancar los servicios;" -ForegroundColor Yellow
Write-Host "  este icono nuevo SI arranca la web + puente + Piper." -ForegroundColor Yellow
Write-Host ""

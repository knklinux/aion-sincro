<#
.SYNOPSIS
  Ancla el lanzador de Aion Sincro a la barra de tareas de Windows
  usando el METODO DEL MENU INICIO (metodo fiable en Win10/11).

.DESCRIPTION
  El problema: si anclas la PWA de Edge (el icono de la app instalada), al
  pulsarlo SOLO abre Edge apuntando a la URL - pero NO arranca el servidor
  HTTP ni el puente, asi que la app no carga (pagina muerta).

  La solucion: anclar el LANZADOR (windows\aion-sincro.cmd), que es el que
  arranca los servicios (web 8080 + puente 8765 + Piper) y luego abre la app.

  METODO (por que este es fiable):
    1. Se crea "Aion Sincro.lnk" en la carpeta de Programas del MENU INICIO
       ( %APPDATA%\Microsoft\Windows\Start Menu\Programs ). Eso hace que el
       lanzador aparezca en la busqueda de Inicio con su icono.
    2. Se invoca el verbo "taskbarpin" SOBRE ESE acceso de Inicio. Anclar
       desde el menu Inicio es el flujo que Windows soporta nativamente en
       Win10/11 (escribir directamente en User Pinned\TaskBar ya NO pinta el
       icono de forma fiable, por eso este script cambio de metodo).
    3. Se elimina cualquier acceso viejo en User Pinned\TaskBar que apuntase
       a otra version, para que no haya iconos duplicados en la barra.

  Si el verbo taskbarpin no surte efecto (Microsoft lo restringe en algunas
  builds), el acceso YA existe en el menu Inicio: el usuario solo tiene que
  buscar "Aion Sincro" en Inicio -> clic derecho -> Anclar a la barra de
  tareas. Una sola accion manual, sin pelear con carpetas internas.

  Uso:  powershell -ExecutionPolicy Bypass -File anclar-barra-tareas.ps1
        powershell -ExecutionPolicy Bypass -File anclar-barra-tareas.ps1 -Remove   (quita el acceso)

  Requisitos: ejecutar con permisos normales (sin admin). Windows 10/11.

  NOTA: texto ASCII puro a proposito (PowerShell 5.1 lee .ps1 como ANSI;
  los acentos romperian el parseo).

.NOTES
  Autor: Ark & Jimmy - Aion Sincro - Licencia MIT
#>

param(
    [switch]$Remove
)

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

# ------- Rutas implicadas -------
# Carpeta de Programas del MENU INICIO (donde aparecen las apps al buscar en Inicio)
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$startMenuLnk = Join-Path $startMenuDir "Aion Sincro.lnk"

# Carpeta interna de anclados de la barra (la ANTIGUA forma de hacerlo; ya no pinta bien)
$taskbarDir = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
$oldTaskbarLnk = Join-Path $taskbarDir "Aion Sincro.lnk"

# ------- MODO ELIMINAR -------
if ($Remove) {
    Write-Host "=== Quitando Aion Sincro de la barra de tareas / menu Inicio ==="
    if (Test-Path $startMenuLnk) {
        Remove-Item $startMenuLnk -Force
        Write-Host "  [OK] Eliminado acceso del menu Inicio: $startMenuLnk"
    } else {
        Write-Host "  [i] No habia acceso en el menu Inicio"
    }
    if (Test-Path $oldTaskbarLnk) {
        Remove-Item $oldTaskbarLnk -Force
        Write-Host "  [OK] Eliminado acceso antiguo de User Pinned\TaskBar"
    } else {
        Write-Host "  [i] No habia acceso antiguo en User Pinned\TaskBar"
    }
    Write-Host ""
    Write-Host "  Si el icono sigue en la barra de tareas, haz clic derecho sobre" -ForegroundColor Yellow
    Write-Host "  el -> Desanclar. Listo." -ForegroundColor Yellow
    exit 0
}

# ------- 1) Crear el acceso en el MENU INICIO -------
Write-Host "=== Anclando Aion Sincro (metodo menu Inicio) ==="
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($startMenuLnk)
$lnk.TargetPath = $launcher
# IMPORTANTE: limpiar Arguments SIEMPRE. Si el acceso anterior tenia args
# viejos (p. ej. "/c ""...cmd""") y no se borran aqui, al guardar sobre el
# mismo .lnk persisten y el clic invoca cmd dos veces (doble arranque).
$lnk.Arguments = ""
$lnk.WorkingDirectory = $appDir
$lnk.IconLocation = $icon
$lnk.Description = "Aion Sincro - Companion de Pentest y Red Team (arranca servicios + app)"
$lnk.Save()
Write-Host "  [OK] Acceso creado en el menu Inicio:"
Write-Host "       $startMenuLnk"
Write-Host "       Lanzador: $launcher"

# ------- 2) Anclar a la barra de tareas -------
# 2a) Primero el verbo nativo taskbarpin sobre el acceso de Inicio.
try {
    $shellApp = New-Object -ComObject Shell.Application
    $item = $shellApp.Namespace($startMenuDir).ParseName("Aion Sincro.lnk")
    if ($item) {
        # Esperar un instante a que Explorer indexe el acceso nuevo
        Start-Sleep -Milliseconds 400
        $item.InvokeVerb("taskbarpin") | Out-Null
        Start-Sleep -Milliseconds 800
    }
} catch {
    # Se ignora: probaremos el pin directo abajo
}

# 2b) Si el verbo no surtio efecto, PIN DIRECTO en User Pinned\TaskBar.
# Microsoft restringe el verbo en algunas builds; escribir el .lnk a mano
# es el metodo que usan muchas apps y suele pintar el icono en Win10/11.
if (-not (Test-Path $oldTaskbarLnk)) {
    Write-Host "  [i] El verbo taskbarpin no surtio efecto; creando pin directo..."
    try {
        $pin = $ws.CreateShortcut($oldTaskbarLnk)
        $pin.TargetPath = $launcher
        $pin.Arguments = ""
        $pin.WorkingDirectory = $appDir
        $pin.IconLocation = $icon
        $pin.Description = "Aion Sincro - Companion de Pentest y Red Team (arranca servicios + app)"
        $pin.Save()
        Write-Host "  [OK] Pin directo creado en User Pinned\TaskBar"
        # Forzar que Explorer refresque la barra de tareas
        try { $shellApp = New-Object -ComObject Shell.Application } catch {}
    } catch {
        Write-Host "  [i] No se pudo anclar programaticamente; anclalo a mano desde Inicio"
    }
} else {
    Write-Host "  [OK] Anclado verificado en User Pinned\TaskBar"
}

# ------- 3) Limpiar accesos VIEJOS de User Pinned\TaskBar (evita duplicados) -------
# Solo borra otras versiones/nombres antiguos, NUNCA nuestro Aion Sincro.lnk.
foreach ($old in @("Hermes AI.lnk", "Hermes.lnk", "Aion.lnk")) {
    $oldPath = Join-Path $taskbarDir $old
    if (Test-Path $oldPath) {
        try { Remove-Item $oldPath -Force; Write-Host "  [OK] Limpiado acceso antiguo de la barra: $old" }
        catch { Write-Host "  [i] No se pudo limpiar $old (se ignora)" }
    }
}

Write-Host ""
Write-Host "  Hecho. Comprueba la barra de tareas." -ForegroundColor Green
Write-Host ""
Write-Host "  Si el icono NO aparece (Microsoft restringe el anclado programatico" -ForegroundColor Cyan
Write-Host "  en algunas builds), hazlo en 10 segundos a mano:" -ForegroundColor Cyan
Write-Host "    1. Pulsa la tecla Windows y escribe: Aion Sincro" -ForegroundColor Gray
Write-Host "    2. Clic derecho sobre el resultado -> Anclar a la barra de tareas" -ForegroundColor Gray
Write-Host "    (El acceso ya esta en el menu Inicio: solo falta el clic derecho.)" -ForegroundColor Gray
Write-Host ""
Write-Host "IMPORTANTE: desancla la PWA vieja de Edge de la barra de tareas" -ForegroundColor Yellow
Write-Host "  (clic derecho -> Desanclar). Esta PWA solo abre la URL sin arrancar los" -ForegroundColor Yellow
Write-Host "  servicios; este icono nuevo SI arranca la web + puente + Piper." -ForegroundColor Yellow
Write-Host ""

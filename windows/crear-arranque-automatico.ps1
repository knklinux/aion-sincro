# ============================================================
# Aion Sincro - Instalador/desinstalador del arranque automatico
# ============================================================
# Crea o elimina el acceso directo en la carpeta de Inicio de
# Windows para que los servicios de Aion arranquen al iniciar
# sesion (sin ventanas, en segundo plano).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File crear-arranque-automatico.ps1 -Install
#   powershell -ExecutionPolicy Bypass -File crear-arranque-automatico.ps1 -Remove
#
# La app tambien lo invoca desde el terminal con:
#   powershell -ExecutionPolicy Bypass -File "...\crear-arranque-automatico.ps1" -Install
# ============================================================

param(
    [switch]$Install,
    [switch]$Remove,
    [string]$AppDir = ""
)

$ErrorActionPreference = "Stop"

# --- Detectar la carpeta de la app ---
if (-not $AppDir) {
    $AppDir = Split-Path -Parent $PSCommandPath
    # Si estamos en windows/, el cmd y el vbs estan aqui tambien
    if (-not (Test-Path "$AppDir\aion-sincro.cmd")) {
        # Quiza se invoca desde el padre (modo repo)
        $AppDir = Split-Path -Parent $AppDir
    }
}
if (-not (Test-Path "$AppDir\aion-sincro.cmd")) {
    Write-Error "No se encontro aion-sincro.cmd en $AppDir"
    exit 1
}

# --- Archivos necesarios ---
# El VBS y el ICO viven SIEMPRE en la misma carpeta que aion-sincro.cmd
# (modo repo: windows\ ; modo instalado: la carpeta de la app).
# $AppDir ya apunta a esa carpeta: NO anteponer 'windows\' de nuevo.
$VbsPath = Join-Path $AppDir "aion-sincro-startup.vbs"
if (-not (Test-Path $VbsPath)) {
    Write-Error "No se encontro aion-sincro-startup.vbs en $VbsPath"
    exit 1
}

$IcoPath = Join-Path $AppDir "aion-sincro.ico"

# --- Carpeta de Inicio del usuario ---
$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "Aion Sincro.lnk"

# --- WScript.Shell para crear accesos directos ---
$WshShell = New-Object -ComObject WScript.Shell

if ($Install) {
    Write-Host "=== Instalando arranque automatico de Aion Sincro ==="
    Write-Host "  App:      $AppDir"
    Write-Host "  VBS:      $VbsPath"
    Write-Host "  Destino:  $ShortcutPath"

    # Si ya existe, lo eliminamos primero para regenerar limpio
    if (Test-Path $ShortcutPath) {
        Remove-Item $ShortcutPath -Force
        Write-Host "  (acceso directo anterior eliminado)"
    }

    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = "wscript.exe"
    $Shortcut.Arguments = "//B `"$VbsPath`""
    $Shortcut.WorkingDirectory = $AppDir
    $Shortcut.Description = "Aion Sincro - Companera de Pentest y Red Team (arranque silencioso)"
    $Shortcut.WindowStyle = 7  # 7 = Minimizada (ni se ve)

    if (Test-Path $IcoPath) {
        $Shortcut.IconLocation = $IcoPath
    }

    $Shortcut.Save()

    Write-Host "  [OK] Arranque automatico INSTALADO."
    Write-Host "     Aion arrancara en segundo plano al iniciar Windows."
    Write-Host "     Abre http://127.0.0.1:8080/ en tu navegador para usarlo."
    Write-Host "     Para desinstalar: powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Remove"
    exit 0
}

if ($Remove) {
    Write-Host "=== Eliminando arranque automatico de Aion Sincro ==="

    if (Test-Path $ShortcutPath) {
        Remove-Item $ShortcutPath -Force
        Write-Host "  [OK] Arranque automatico ELIMINADO."
    } else {
        Write-Host "  [!] No se encontro ningun acceso directo en Inicio."
    }

    # Limpiar tambien posibles versiones antiguas (con otros nombres)
    $oldNames = @("Hermes AI.lnk", "Hermes.lnk", "Aion.lnk")
    foreach ($old in $oldNames) {
        $oldPath = Join-Path $StartupFolder $old
        if (Test-Path $oldPath) {
            Remove-Item $oldPath -Force
            Write-Host "  [+] Limpiado acceso directo antiguo: $old"
        }
    }

    exit 0
}

# Sin flags: mostrar estado
Write-Host "=== Arranque automatico de Aion Sincro ==="
if (Test-Path $ShortcutPath) {
    $lnk = $WshShell.CreateShortcut($ShortcutPath)
    Write-Host "  [OK] INSTALADO - Aion arranca al iniciar Windows"
    Write-Host "     Destino: $($lnk.TargetPath) $($lnk.Arguments)"
} else {
    Write-Host "  [X] NO instalado"
}
Write-Host ""
Write-Host "  Para instalar:   powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Install"
Write-Host "  Para eliminar:   powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Remove"

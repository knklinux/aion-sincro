# ============================================================
# Aion Sincro — Crea el acceso directo en el Escritorio (Windows)
# ============================================================
# Genera aion-sincro.ico (hexagono dorado + delta) y crea
# "Aion Sincro.lnk" en el Escritorio del usuario apuntando a
# aion-sincro.cmd.
#
# Uso:
#   .\crear-acceso-directo.ps1                      (modo repo)
#   .\crear-acceso-directo.ps1 -InstallDir C:\...\AionSincro   (instalado)
param(
  [string]$InstallDir = ""
)
$ErrorActionPreference = "Stop"

if ($InstallDir) {
  # Modo instalado: el .cmd y el .ico viven en la carpeta instalada.
  $src    = $InstallDir
  $appDir = $InstallDir
} else {
  # Modo repo: el script vive en windows\ y la app en la carpeta padre.
  $src    = $PSScriptRoot
  $appDir = (Resolve-Path (Join-Path $src "..")).Path
}
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "Aion Sincro.lnk"

# --- 1) Icono .ico ------------------------------------------------
# Preferimos el favicon.ico dorado oficial (hexagono + delta, multi-tamano,
# en la raiz del repo o en la carpeta instalada). Si no existe, generamos
# aion-sincro.ico (solo la primera vez) como respaldo.
$favIcon = Join-Path $appDir "favicon.ico"
if (-not (Test-Path $favIcon)) { $favIcon = Join-Path $src "favicon.ico" }
if (Test-Path $favIcon) {
  $icoPath = $favIcon
  Write-Host "  OK Icono: $icoPath"
} else {
  $icoPath = Join-Path $src "aion-sincro.ico"
  if (-not (Test-Path $icoPath)) {
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap 64,64
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(255,8,6,4))
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255,245,165,36)), 3
    $hex = [System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF 32,5),
      (New-Object System.Drawing.PointF 55,17),
      (New-Object System.Drawing.PointF 55,47),
      (New-Object System.Drawing.PointF 32,59),
      (New-Object System.Drawing.PointF 9,47),
      (New-Object System.Drawing.PointF 9,17)
    )
    $g.DrawPolygon($pen, $hex)
    $font  = New-Object System.Drawing.Font "Consolas",24,([System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,255,247,224))
    $g.DrawString([string][char]0x394, $font, $brush, 11, 12)
    $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $fs = [System.IO.File]::Create($icoPath)
    $icon.Save($fs); $fs.Close()
    $g.Dispose(); $bmp.Dispose(); $pen.Dispose(); $brush.Dispose(); $font.Dispose()
    Write-Host "  OK Icono creado (respaldo): $icoPath"
  } else {
    Write-Host "  OK Icono ya existe"
  }
}

# --- 2) Acceso directo .lnk --------------------------------------
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath      = Join-Path $src "aion-sincro.cmd"
# Limpiar Arguments SIEMPRE: si el acceso anterior arrastraba args viejos
# (p. ej. "/c ""...cmd"""), persistirian al guardar y el clic haria un
# doble arranque de cmd (sintoma: una linea suelta "/c" en startup.log).
$lnk.Arguments       = ""
$lnk.WorkingDirectory = $appDir
$lnk.IconLocation    = "$icoPath,0"
$lnk.Description     = "Aion Sincro - Companera de Pentest y Coarquitecta del Plan de Rescate"
$lnk.WindowStyle     = 7
$lnk.Save()

Write-Host "  OK Acceso directo creado: $lnkPath"
Write-Host ""
Write-Host "  Listo. Doble clic en 'Aion Sincro' del Escritorio para arrancar."

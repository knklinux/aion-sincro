# ============================================================
# Aion Sincro - Genera el token del puente (solo la primera vez)
# ============================================================
# Crea el fichero 'token' en la carpeta de la app con un token
# aleatorio de 32 caracteres hex (paridad con secrets.token_hex(16)
# del lanzador). Si el token ya existe, lo reutiliza para que el
# puente no cambie entre arranques (evita el 403 en /run).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File crear-token.ps1 -InstallDir "C:\...\AionSincro"
#   (sin -InstallDir usa la carpeta donde vive este script)
# ============================================================
param(
    [string]$InstallDir = ""
)

if (-not $InstallDir) { $InstallDir = $PSScriptRoot }
$tokenFile = Join-Path $InstallDir "token"

if (Test-Path $tokenFile) {
    Write-Host "  OK Token ya existe (se reutiliza: el puente no cambiara)"
    exit 0
}

$token = [Guid]::NewGuid().ToString("N")
[IO.File]::WriteAllText($tokenFile, $token)
Write-Host "  OK Token del puente generado: $token"
Write-Host "     (la app lo adopta sola al cargar; no hace falta pegarlo)"

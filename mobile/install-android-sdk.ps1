<#
.SYNOPSIS
  Instalador automatizado de JDK 17 + Android SDK CLI tools para Windows.
  Prepara el entorno necesario para compilar el APK de Aion Sincro.

.DESCRIPTION
  Descarga e instala (sin intervención manual):
    1. Eclipse Temurin JDK 17 (MSI, instalación silenciosa)
    2. Android SDK command-line tools (última versión estable)
    3. Paquetes SDK necesarios: platform-tools, build-tools, platforms;android-34
    4. Acepta las licencias del SDK automáticamente
    5. Configura JAVA_HOME y ANDROID_HOME (usuario, sin admin)

  Es idempotente: si JDK/SDK ya están instalados, los detecta y salta el paso.

.PARAMETER SdkRoot
  Ruta donde instalar el Android SDK.
  Por defecto: $env:LOCALAPPDATA\Android\Sdk

.PARAMETER JdkVersion
  Versión mayor del JDK a instalar. Por defecto: 17.

.PARAMETER AcceptLicenses
  Acepta automáticamente las licencias del SDK (sdkmanager --licenses).
  Por defecto: $true

.EXAMPLE
  .\install-android-sdk.ps1
  Instala todo en las ubicaciones por defecto.

.EXAMPLE
  .\install-android-sdk.ps1 -SdkRoot "D:\Android\Sdk"
  Instala el SDK en una unidad distinta a C:.

.NOTES
  Requisitos: PowerShell 5.1+ (incluido en Windows 10/11), conexión a Internet.
  No requiere permisos de administrador (instalación a nivel de usuario).
  Tiempo estimado: 5-15 minutos (depende de la velocidad de descarga).

  Autor: Ark & Jimmy · Aion Sincro
  Licencia: MIT
#>

param(
    [string]$SdkRoot = "$($env:LOCALAPPDATA)\Android\Sdk",
    [int]$JdkVersion = 17,
    [bool]$AcceptLicenses = $true
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # acelera Invoke-WebRequest

# ── Colores para la salida ──────────────────────────────────────────
function Write-Step { param([string]$Text) Write-Host "`n▶ $Text" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Text) Write-Host "  ✔ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠ $Text" -ForegroundColor Yellow }
function Write-Err  { param([string]$Text) Write-Host "  ✘ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  · $Text" -ForegroundColor Gray }

# ── Banner ───────────────────────────────────────────────────────────
Write-Host @"

   ╔══════════════════════════════════════════╗
   ║  AION SINCRÓ · Android SDK Installer    ║
   ║  JDK $JdkVersion + Android CLI tools           ║
   ╚══════════════════════════════════════════╝

"@ -ForegroundColor Magenta

# ── 1. JAVA JDK 17 (Eclipse Temurin) ────────────────────────────────
Write-Step "1/4 — Java JDK $JdkVersion (Eclipse Temurin)"

$javaHome = [Environment]::GetEnvironmentVariable("JAVA_HOME", "User")
$javaCmd  = $null    if ($javaHome -and (Test-Path "$($javaHome)\bin\javac.exe")) {
    Write-Ok "JDK ya instalado en JAVA_HOME = $javaHome"
    $javaCmd = "$($javaHome)\bin\javac.exe"
} else {
    # Buscar javac en PATH
    $found = Get-Command javac -ErrorAction SilentlyContinue
    if ($found) {
        Write-Ok "javac encontrado en PATH: $($found.Source)"
        $javaCmd = $found.Source
        $javaHome = Split-Path -Parent (Split-Path -Parent $found.Source)
    }
}

if (-not $javaCmd) {
    # Descargar e instalar Temurin JDK 17 MSI
    $jdkUrl = "https://api.adoptium.net/v3/installer/latest/$JdkVersion/ga/windows/x64/jdk/hotspot/normal/eclipse"
    $jdkMsi = "$($env:TEMP)\Temurin-jdk$($JdkVersion).msi"

    Write-Info "Descargando Temurin JDK $JdkVersion..."
    try {
        # La API redirige al MSI real
        Invoke-WebRequest -Uri $jdkUrl -OutFile $jdkMsi -UseBasicParsing
    } catch {
        # Fallback: URL directa conocida
        $directUrl = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.12_7.msi"
        Write-Warn "API de Adoptium falló — intentando descarga directa desde GitHub..."
        Invoke-WebRequest -Uri $directUrl -OutFile $jdkMsi -UseBasicParsing
    }

    if (-not (Test-Path $jdkMsi)) {
        Write-Err "No se pudo descargar el JDK. Verifica tu conexión a Internet."
        Write-Info "También puedes instalarlo manualmente desde: https://adoptium.net/download/"
        exit 1
    }

    Write-Info "Instalando JDK (msiexec silencioso, puede tardar ~1 min)..."
    $msiLog = "$($env:TEMP)\temurin-install.log"
    $p = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$jdkMsi`" /quiet /norestart /log `"$msiLog`" ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJarFileRunWith,FeatureJavaHome" -Wait -PassThru

    if ($p.ExitCode -ne 0) {
        Write-Err "msiexec falló con código $($p.ExitCode). Revisa: $msiLog"
        exit 1
    }

    # Temurin instala en Program Files por defecto
    $temurinDir = "${env:ProgramFiles}\Eclipse Adoptium\jdk-$($JdkVersion)*"
    $javaHome = (Get-Item $temurinDir -ErrorAction SilentlyContinue | Select-Object -First 1).FullName

    if (-not $javaHome) {
        # Buscar en Program Files (x86) también
        $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
        $temurinDir = "$pf86\Eclipse Adoptium\jdk-$($JdkVersion)*"
        $javaHome = (Get-Item $temurinDir -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
    }

    if (-not $javaHome) {
        Write-Err "No se encontró la instalación de Temurin JDK. Revisa el log: $msiLog"
        exit 1
    }

    # Establecer JAVA_HOME a nivel de usuario
    [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaHome, "User")
    $env:JAVA_HOME = $javaHome
    Write-Ok "JDK instalado: $javaHome"
    Remove-Item $jdkMsi -Force -ErrorAction SilentlyContinue
}

# Verificar la versión
$jdkBin = "$($javaHome)\bin"
$env:Path = "$jdkBin;$env:Path"
try {
    $jdkVer = & "$($jdkBin)\javac" -version 2>&1
    Write-Ok "javac $jdkVer"
} catch {
    Write-Err "javac no responde. Verifica la instalación manualmente."
    exit 1
}

# ── 2. ANDROID SDK COMMAND-LINE TOOLS ───────────────────────────────
Write-Step "2/4 — Android SDK command-line tools"

$sdkmanDir = "$($SdkRoot)\cmdline-tools\latest"
$sdkmanBin = "$($sdkmanDir)\bin\sdkmanager.bat"

if (Test-Path $sdkmanBin) {
    Write-Ok "Android SDK CLI tools ya instalados: $sdkmanDir"
} else {
    # Crear directorio del SDK
    New-Item -ItemType Directory -Path $sdkmanDir -Force | Out-Null

# URL de command-line tools (Windows)
    # NOTA: Google actualiza periódicamente esta URL. Si la descarga falla,
    # visita https://developer.android.com/studio#command-line-tools-only
    # y actualiza el número de versión (p.ej. 11076708).
    $cmdlineUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
    $cmdlineZip = "$($env:TEMP)\android-cmdline-tools.zip"

    Write-Info "Descargando Android SDK command-line tools (~150 MB)..."
    try {
        Invoke-WebRequest -Uri $cmdlineUrl -OutFile $cmdlineZip -UseBasicParsing
    } catch {
        Write-Err "No se pudo descargar command-line tools. Verifica tu conexión a Internet."
        Write-Info "URL manual: https://developer.android.com/studio#command-line-tools-only"
        exit 1
    }

    if (-not (Test-Path $cmdlineZip) -or (Get-Item $cmdlineZip).Length -lt 1000000) {
        Write-Err "La descarga del SDK parece corrupta (archivo demasiado pequeño)."
        exit 1
    }

    Write-Info "Extrayendo command-line tools..."
    Expand-Archive -Path $cmdlineZip -DestinationPath "$($env:TEMP)\android-cmdline-extract" -Force

    # La estructura del zip tiene una carpeta 'cmdline-tools' dentro
    $extracted = "$($env:TEMP)\android-cmdline-extract\cmdline-tools"
    if (-not (Test-Path $extracted)) {
        # Algunas versiones extraen directamente los archivos
        $extracted = "$($env:TEMP)\android-cmdline-extract"
    }

    # Mover al destino final
    if (Test-Path $sdkmanDir) { Remove-Item $sdkmanDir -Recurse -Force }
    Copy-Item -Path "$extracted\*" -Destination $sdkmanDir -Recurse -Force

    # Limpiar temporales
    Remove-Item $cmdlineZip -Force -ErrorAction SilentlyContinue
    Remove-Item "$($env:TEMP)\android-cmdline-extract" -Recurse -Force -ErrorAction SilentlyContinue

    Write-Ok "SDK CLI tools instalados: $sdkmanDir"
}

# ── 3. VARIABLES DE ENTORNO ─────────────────────────────────────────
Write-Step "3/4 — Variables de entorno"

[Environment]::SetEnvironmentVariable("ANDROID_HOME", $SdkRoot, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $SdkRoot, "User")
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot

# Añadir al PATH del usuario (si no está ya)
$userPathRaw = [Environment]::GetEnvironmentVariable("PATH", "User")
$userPath = $userPathRaw.Split(';')
$sdkLatestBin    = "$($SdkRoot)\cmdline-tools\latest\bin"
$sdkPlatformTools = "$($SdkRoot)\platform-tools"
$sdkBuildTools    = "$($SdkRoot)\build-tools\34.0.0"
$jdkBinPath       = "$($javaHome)\bin"

$pathsToAdd = @($sdkLatestBin, $sdkPlatformTools, $sdkBuildTools, $jdkBinPath)
$changed = $false

foreach ($p in $pathsToAdd) {
    if ($userPath -notcontains $p) {
        $userPathRaw += ";$p"
        $env:Path = "$env:Path;$p"
        Write-Info "Anadido a PATH: $p"
        $changed = $true
    }
}

if ($changed) {
    [Environment]::SetEnvironmentVariable("PATH", $userPathRaw, "User")
}

Write-Ok "ANDROID_HOME = $SdkRoot"
Write-Ok "JAVA_HOME    = $javaHome"

# ── 4. PAQUETES SDK Y LICENCIAS ─────────────────────────────────────
Write-Step "4/4 — Paquetes SDK y licencias"

# Aceptar licencias
if ($AcceptLicenses) {
    Write-Info "Aceptando licencias del SDK..."
    try {
        $yes = "y`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`ny`n"
        $yes | & $sdkmanBin --licenses 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
            Write-Warn "sdkmanager --licenses terminó con código $LASTEXITCODE"
            Write-Info "Ejecuta manualmente:  sdkmanager --licenses"
        } else {
            Write-Ok "Licencias aceptadas"
        }
    } catch {
        Write-Warn "No se pudieron aceptar las licencias automáticamente."
        Write-Info "Ejecuta manualmente:  sdkmanager --licenses"
    }
}

# Instalar paquetes necesarios
$packages = @(
    "platform-tools",
    "build-tools;34.0.0",
    "platforms;android-34",
    "extras;google;usb_driver"
)

Write-Info "Instalando paquetes SDK (platform-tools, build-tools 34, android-34)..."
Write-Info "Esto puede tardar varios minutos — es normal."

try {
    & $sdkmanBin --install $packages 2>&1 | ForEach-Object {
        if ($_ -match "Installed|Done|100%|Loading") {
            Write-Info $_
        }
    }
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
        Write-Warn "sdkmanager --install terminó con código $LASTEXITCODE. Algunos paquetes pueden no haberse instalado."
        Write-Info "Reintenta con:  sdkmanager --install platform-tools build-tools;34.0.0 platforms;android-34"
    } else {
        Write-Ok "Paquetes SDK instalados correctamente"
    }
} catch {
    Write-Warn "Algunos paquetes pueden no haberse instalado. Reintenta con:"
    Write-Info "  sdkmanager --install platform-tools build-tools;34.0.0 platforms;android-34"
}

# ── RESUMEN FINAL ────────────────────────────────────────────────────
Write-Host "`n" -NoNewline
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✔ INSTALACIÓN COMPLETADA               ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  JDK $JdkVersion  : " -NoNewline; Write-Host $javaHome -ForegroundColor Cyan
Write-Host "  Android SDK : " -NoNewline; Write-Host $SdkRoot -ForegroundColor Cyan
Write-Host ""

Write-Host "  ⚠ " -NoNewline -ForegroundColor Yellow
Write-Host "CIERRA y REABRE PowerShell (o la terminal) para que los cambios en PATH surtan efecto." -ForegroundColor Yellow
Write-Host ""

Write-Host "  Siguientes pasos para compilar el APK de Aion Sincro:" -ForegroundColor White
Write-Host "    1. cd mobile" -ForegroundColor Gray
Write-Host "    2. npm run setup    (genera el proyecto Android nativo)" -ForegroundColor Gray
Write-Host "    3. npm run apk      (compila el APK)" -ForegroundColor Gray
Write-Host ""
Write-Host "  El APK se generará en: " -NoNewline
Write-Host "mobile\android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Cyan
Write-Host ""

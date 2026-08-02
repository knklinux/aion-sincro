#!/usr/bin/env bash
# ============================================================
# Aion Sincro · Android SDK Installer (Linux / macOS)
# ============================================================
# Descarga e instala (sin intervencion manual):
#   1. JDK 17 (apt/brew/sdkman o descarga directa de Temurin)
#   2. Android SDK command-line tools (ultima version estable)
#   3. Paquetes SDK: platform-tools, build-tools, platforms;android-34
#   4. Acepta las licencias del SDK automaticamente
#   5. Configura JAVA_HOME y ANDROID_HOME en ~/.bashrc / ~/.zshrc
#
# Es idempotente: si JDK/SDK ya estan instalados, los detecta y salta.
#
# Uso:
#   chmod +x install-android-sdk.sh
#   ./install-android-sdk.sh
#
#   # Personalizar rutas:
#   SDK_ROOT=/opt/android-sdk JDK_VERSION=21 ./install-android-sdk.sh
#
# Requisitos: bash, curl/wget, unzip, tar, conexion a Internet.
# Tiempo estimado: 5-15 minutos.
#
# Autor: Ark & Jimmy · Aion Sincro
# Licencia: MIT
# ============================================================

set -euo pipefail

# ── Configuracion ──────────────────────────────────────────
SDK_ROOT="${SDK_ROOT:-$HOME/Android/Sdk}"
JDK_VERSION="${JDK_VERSION:-17}"
ACCEPT_LICENSES="${ACCEPT_LICENSES:-true}"
TEMP_DIR="${TMPDIR:-/tmp}/aion-android-sdk-$$"

# ── Colores ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; GRAY='\033[0;90m'; MAGENTA='\033[0;35m'
NC='\033[0m'

step()  { echo -e "\n${CYAN}▶ $*${NC}"; }
ok()    { echo -e "  ${GREEN}✔${NC} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $*"; }
err()   { echo -e "  ${RED}✘${NC} $*"; }
info()  { echo -e "  ${GRAY}·${NC} $*"; }

cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT
mkdir -p "$TEMP_DIR"

# ── Banner ─────────────────────────────────────────────────
echo -e "${MAGENTA}
   ╔══════════════════════════════════════════╗
   ║  AION SINCRÓ · Android SDK Installer    ║
   ║  JDK ${JDK_VERSION} + Android CLI tools           ║
   ╚══════════════════════════════════════════╝
${NC}"

# ── Detectar OS ────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux";;
    Darwin*) echo "macos";;
    *)       echo "unknown";;
  esac
}
OS=$(detect_os)
if [ "$OS" = "unknown" ]; then
  err "Sistema operativo no soportado: $(uname -s)"
  exit 1
fi
info "Sistema detectado: ${OS}"

# ── Detectar shell rc file ─────────────────────────────────
detect_rc() {
  if [ -n "${ZSH_VERSION:-}" ] || [ "$SHELL" = "/bin/zsh" ] || [ "$SHELL" = "/usr/bin/zsh" ]; then
    echo "$HOME/.zshrc"
  else
    echo "$HOME/.bashrc"
  fi
}
RC_FILE=$(detect_rc)

# ── 1. JAVA JDK ────────────────────────────────────────────
step "1/4 — Java JDK ${JDK_VERSION}"

java_home=""
javac_bin=""

# Comprobar JAVA_HOME existente
if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
  ok "JDK ya instalado en JAVA_HOME = $JAVA_HOME"
  java_home="$JAVA_HOME"
  javac_bin="$JAVA_HOME/bin/javac"
elif command -v javac &>/dev/null; then
  javac_bin="$(command -v javac)"
  java_home="$(dirname "$(dirname "$(readlink -f "$javac_bin" 2>/dev/null || echo "$javac_bin")")")"
  ok "javac encontrado en PATH: $javac_bin"
else
  # Intentar instalar via gestor de paquetes
  case "$OS" in
    linux)
      if command -v apt-get &>/dev/null; then
        info "Instalando JDK via apt (Temurin)..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq wget apt-transport-https
        wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | sudo tee /etc/apt/trusted.gpg.d/adoptium.asc >/dev/null
        echo "deb https://packages.adoptium.net/artifactory/deb $(awk -F= '/^VERSION_CODENAME/{print$2}' /etc/os-release) main" | sudo tee /etc/apt/sources.list.d/adoptium.list >/dev/null
        sudo apt-get update -qq
        sudo apt-get install -y -qq "temurin-${JDK_VERSION}-jdk"
        java_home="/usr/lib/jvm/temurin-${JDK_VERSION}-jdk-$(dpkg --print-architecture)"
        javac_bin="$java_home/bin/javac"
        ok "JDK Temurin ${JDK_VERSION} instalado via apt"
      elif command -v dnf &>/dev/null; then
        info "Instalando JDK via dnf..."
        sudo dnf install -y "java-${JDK_VERSION}-openjdk-devel"
        java_home="$(dirname "$(dirname "$(readlink -f "$(which javac)")")")"
        javac_bin="$java_home/bin/javac"
        ok "JDK instalado via dnf"
      elif command -v pacman &>/dev/null; then
        info "Instalando JDK via pacman..."
        sudo pacman -S --noconfirm "jdk${JDK_VERSION}-openjdk"
        java_home="/usr/lib/jvm/java-${JDK_VERSION}-openjdk"
        javac_bin="$java_home/bin/javac"
        ok "JDK instalado via pacman"
      else
        # Descarga manual de Temurin
        info "Sin gestor de paquetes detectado — descargando Temurin manualmente..."
        ARCH=$(uname -m)
        [ "$ARCH" = "x86_64" ] && ARCH="x64"
        [ "$ARCH" = "aarch64" ] && ARCH="aarch64"
        TEMURIN_URL="https://api.adoptium.net/v3/binary/latest/${JDK_VERSION}/ga/linux/${ARCH}/jdk/hotspot/normal/eclipse"
        TEMURIN_TGZ="$TEMP_DIR/temurin-jdk.tar.gz"
        info "Descargando $TEMURIN_URL ..."
        curl -L --progress-bar -o "$TEMURIN_TGZ" "$TEMURIN_URL" || wget -q --show-progress -O "$TEMURIN_TGZ" "$TEMURIN_URL"
        java_home="$HOME/.local/share/temurin-jdk-${JDK_VERSION}"
        mkdir -p "$java_home"
        tar xzf "$TEMURIN_TGZ" -C "$java_home" --strip-components=1
        javac_bin="$java_home/bin/javac"
        ok "JDK Temurin ${JDK_VERSION} instalado manualmente en $java_home"
      fi
      ;;
    macos)
      if command -v brew &>/dev/null; then
        info "Instalando JDK via Homebrew..."
        brew install --cask "temurin@${JDK_VERSION}" 2>/dev/null || brew install "openjdk@${JDK_VERSION}"
        java_home="$(/usr/libexec/java_home -v "${JDK_VERSION}" 2>/dev/null || echo "/Library/Java/JavaVirtualMachines/temurin-${JDK_VERSION}.jdk/Contents/Home")"
        javac_bin="$java_home/bin/javac"
        ok "JDK instalado via Homebrew"
      else
        # Descarga manual para macOS
        info "Homebrew no detectado — descargando Temurin manualmente..."
        ARCH=$(uname -m)
        [ "$ARCH" = "x86_64" ] && ARCH="x64"
        [ "$ARCH" = "arm64" ] && ARCH="aarch64"
        TEMURIN_URL="https://api.adoptium.net/v3/binary/latest/${JDK_VERSION}/ga/mac/${ARCH}/jdk/hotspot/normal/eclipse"
        TEMURIN_TGZ="$TEMP_DIR/temurin-jdk.tar.gz"
        curl -L --progress-bar -o "$TEMURIN_TGZ" "$TEMURIN_URL"
        java_home="$HOME/.local/share/temurin-jdk-${JDK_VERSION}"
        mkdir -p "$java_home"
        tar xzf "$TEMURIN_TGZ" -C "$java_home" --strip-components=1
        javac_bin="$java_home/bin/javac"
        ok "JDK Temurin ${JDK_VERSION} instalado manualmente en $java_home"
      fi
      ;;
  esac
fi

if [ ! -x "${javac_bin:-}" ]; then
  err "No se pudo instalar el JDK. Instalalo manualmente: https://adoptium.net/download/"
  exit 1
fi

# Verificar la version
jdk_ver=$("$javac_bin" -version 2>&1)
ok "javac $jdk_ver"

# ── 2. ANDROID SDK COMMAND-LINE TOOLS ──────────────────────
step "2/4 — Android SDK command-line tools"

sdkman_dir="$SDK_ROOT/cmdline-tools/latest"
sdkman_bin="$sdkman_dir/bin/sdkmanager"

if [ -x "$sdkman_bin" ]; then
  ok "Android SDK CLI tools ya instalados: $sdkman_dir"
else
  mkdir -p "$sdkman_dir"

  # URL de command-line tools
  # NOTA: Google actualiza esta URL periodicamente. Si la descarga falla,
  # visita https://developer.android.com/studio#command-line-tools-only
  # y actualiza el numero de version (p.ej. 11076708).
  case "$OS" in
    linux)  CMDLINE_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" ;;
    macos)  CMDLINE_URL="https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip" ;;
  esac

  CMDLINE_ZIP="$TEMP_DIR/android-cmdline-tools.zip"
  info "Descargando Android SDK command-line tools (~150 MB)..."

  if command -v curl &>/dev/null; then
    curl -L --progress-bar -o "$CMDLINE_ZIP" "$CMDLINE_URL" || {
      err "No se pudo descargar command-line tools."
      info "URL manual: https://developer.android.com/studio#command-line-tools-only"
      exit 1
    }
  else
    wget -q --show-progress -O "$CMDLINE_ZIP" "$CMDLINE_URL" || {
      err "No se pudo descargar command-line tools."
      info "URL manual: https://developer.android.com/studio#command-line-tools-only"
      exit 1
    }
  fi

  # Verificar que el archivo tenga tamano razonable
  zip_size=$(stat -f%z "$CMDLINE_ZIP" 2>/dev/null || stat -c%s "$CMDLINE_ZIP" 2>/dev/null || echo 0)
  if [ "${zip_size:-0}" -lt 1000000 ]; then
    err "La descarga del SDK parece corrupta (archivo demasiado pequeno: ${zip_size} bytes)."
    exit 1
  fi

  info "Extrayendo command-line tools..."
  unzip -qqo "$CMDLINE_ZIP" -d "$TEMP_DIR/cmdline-extract"

  # La estructura del zip tiene una carpeta 'cmdline-tools' dentro
  if [ -d "$TEMP_DIR/cmdline-extract/cmdline-tools" ]; then
    cp -r "$TEMP_DIR/cmdline-extract/cmdline-tools/"* "$sdkman_dir/"
  else
    cp -r "$TEMP_DIR/cmdline-extract/"* "$sdkman_dir/"
  fi

  ok "SDK CLI tools instalados: $sdkman_dir"
fi

# ── 3. VARIABLES DE ENTORNO ────────────────────────────────
step "3/4 — Variables de entorno"

export JAVA_HOME="$java_home"
export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="$SDK_ROOT"

# Anadir a PATH en esta sesion
export PATH="$sdkman_dir/bin:$SDK_ROOT/platform-tools:$SDK_ROOT/cmdline-tools/latest/bin:$JAVA_HOME/bin:$PATH"

# Anadir a ~/.bashrc / ~/.zshrc de forma idempotente
add_to_rc() {
  local line="$1"
  if ! grep -qxF "$line" "$RC_FILE" 2>/dev/null; then
    echo "$line" >> "$RC_FILE"
    info "Anadido a $RC_FILE: $line"
  fi
}

add_to_rc "export JAVA_HOME=\"$java_home\""
add_to_rc "export ANDROID_HOME=\"$SDK_ROOT\""
add_to_rc "export ANDROID_SDK_ROOT=\"$SDK_ROOT\""
add_to_rc "export PATH=\"\$JAVA_HOME/bin:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$PATH\""

ok "JAVA_HOME    = $java_home"
ok "ANDROID_HOME = $SDK_ROOT"
ok "Variables guardadas en $RC_FILE"

# ── 4. PAQUETES SDK Y LICENCIAS ────────────────────────────
step "4/4 — Paquetes SDK y licencias"

# Aceptar licencias
if [ "$ACCEPT_LICENSES" = "true" ]; then
  info "Aceptando licencias del SDK..."
  if yes | "$sdkman_bin" --licenses >/dev/null 2>&1; then
    ok "Licencias aceptadas"
  else
    warn "sdkmanager --licenses fallo. Ejecuta manualmente: sdkmanager --licenses"
  fi
fi

# Instalar paquetes necesarios
packages=(
  "platform-tools"
  "build-tools;34.0.0"
  "platforms;android-34"
  "extras;google;usb_driver"
)

info "Instalando paquetes SDK (platform-tools, build-tools 34, android-34)..."
info "Esto puede tardar varios minutos — es normal."

if "$sdkman_bin" --install "${packages[@]}" 2>&1; then
  ok "Paquetes SDK instalados correctamente"
else
  warn "Algunos paquetes pueden no haberse instalado. Reintenta con:"
  info "  sdkmanager --install platform-tools build-tools;34.0.0 platforms;android-34"
fi

# ── RESUMEN FINAL ──────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✔ INSTALACION COMPLETADA               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  JDK ${JDK_VERSION}  : ${CYAN}${java_home}${NC}"
echo -e "  Android SDK : ${CYAN}${SDK_ROOT}${NC}"
echo ""

echo -e "  ${YELLOW}⚠  Abre una terminal NUEVA (o ejecuta 'source $RC_FILE')${NC}"
echo -e "  ${YELLOW}   para que los cambios en PATH surtan efecto.${NC}"
echo ""

echo "  Siguientes pasos para compilar el APK de Aion Sincro:"
echo -e "    ${GRAY}1. cd mobile${NC}"
echo -e "    ${GRAY}2. npm run setup    (genera el proyecto Android nativo)${NC}"
echo -e "    ${GRAY}3. npm run apk      (compila el APK)${NC}"
echo ""

echo -n "  El APK se generara en: "
echo -e "${CYAN}mobile/android/app/build/outputs/apk/debug/app-debug.apk${NC}"
echo ""

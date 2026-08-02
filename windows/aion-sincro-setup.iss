; ============================================================
; Aion Sincro - Instalador unificado (Inno Setup)
; ============================================================
; Compila con:  windows\compilar-instalador.cmd   (instala Inno si falta)
; o a mano:     "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" aion-sincro-setup.iss
;
; Hace en UN solo paso lo que antes eran 4 scripts:
;   1. Instala la app en %LOCALAPPDATA%\AionSincro
;   2. Genera el token del puente (solo la primera vez)
;   3. Crea el acceso directo del Escritorio
;   4. Ancla el lanzador a la barra de tareas (metodo menu Inicio)
;   5. Configura el arranque automatico al iniciar Windows (VBS oculto)
;
; Sin permisos de administrador (instala en LocalAppData del usuario).
; Al desinstalar, limpia acceso directo, barra de tareas y arranque.

#define MyAppName "Aion Sincro"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Ark & Jimmy"
#define MyAppExeName "aion-sincro.cmd"

[Setup]
AppId={{E4B2A9C7-3F5D-4A6B-9C1E-8D2F4A5B6C7D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppComments=Aion Sincro - Companera de Pentest y Red Team
DefaultDirName={localappdata}\AionSincro
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=AionSincro-Setup
SetupIconFile=aion-sincro.ico
UninstallDisplayIcon={app}\aion-sincro.ico
UninstallDisplayName={#MyAppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; --- App (raiz del repo) ---
Source: "..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\bridge.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\bridge.mjs"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\piper_server.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\proxy.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\aion_osint.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\robots_wayback.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\SECURITY.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\NUCLEO_MEMORIA.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\MANIFIESTO.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\COMPARATIVA.md"; DestDir: "{app}"; Flags: ignoreversion
; --- Lanzador y herramientas de Windows ---
Source: "aion-sincro.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "serve.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "aion-sincro.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "aion-sincro-startup.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "crear-acceso-directo.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "anclar-barra-tareas.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "crear-arranque-automatico.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "crear-token.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "instalar-piper.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "uninstall.cmd"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\aion-sincro.ico"; Comment: "Aion Sincro - Companera de Pentest y Red Team"

[Run]
; 1) Token del puente (solo la primera vez; reutiliza si ya existe)
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\crear-token.ps1"" -InstallDir ""{app}"""; StatusMsg: "Generando token del puente..."; Flags: runhidden
; 2) Acceso directo en el Escritorio
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\crear-acceso-directo.ps1"" -InstallDir ""{app}"""; StatusMsg: "Creando acceso directo en el Escritorio..."; Flags: runhidden
; 3) Anclar el lanzador a la barra de tareas (metodo menu Inicio)
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\anclar-barra-tareas.ps1""; StatusMsg: "Anclando a la barra de tareas..."; Flags: runhidden
; 4) Arranque automatico al iniciar Windows (VBS oculto)
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\crear-arranque-automatico.ps1"" -Install -AppDir ""{app}""; StatusMsg: "Configurando arranque automatico..."; Flags: runhidden
; 5) Abrir Aion al terminar (checkbox opcional)
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Aion Sincro ahora"; Flags: postinstall nowait skipifsilent; WorkingDir: "{app}"

[UninstallRun]
; Se ejecutan ANTES de borrar los archivos de {app}: limpian barra de
; tareas, arranque automatico y acceso directo del Escritorio.
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\anclar-barra-tareas.ps1"" -Remove"; Flags: runhidden
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\crear-arranque-automatico.ps1"" -Remove"; Flags: runhidden
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Aion Sincro.lnk') -Force -ErrorAction SilentlyContinue""; Flags: runhidden

[UninstallDelete]
Type: files; Name: "{app}\token"
Type: files; Name: "{app}\startup.log"
Type: filesandordirs; Name: "{app}\.venv-piper"
Type: filesandordirs; Name: "{app}\piper-voices"
Type: filesandordirs; Name: "{app}\__pycache__"

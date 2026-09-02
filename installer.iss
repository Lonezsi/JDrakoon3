; ──────────────────────────────────────────────────────────────────────────
;  JDrakoon3 installer (Inno Setup 6)
;
;  Wraps the prebuilt .\release\ folder into a real per-user installer:
;    - installs to %LOCALAPPDATA%\Programs\JDrakoon3  (no admin prompt, and
;      writable so the backend can save settings/cache next to itself)
;    - Start Menu + optional Desktop shortcut using the Drakoon icon
;    - clean uninstaller
;
;  Build:  iscc installer.iss     (or:  build-release.ps1 -Installer)
;  Output: .\release\installer\JDrakoon3-Setup.exe
;
;  Prereq: run build-release.ps1 first so .\release\ exists.
; ──────────────────────────────────────────────────────────────────────────

#define MyAppName "JDrakoon3"
#define MyAppExe  "JDrakoon3.exe"
; Keep in sync with the root VERSION file.
#define MyAppVersion "3.0.5"

[Setup]
AppId={{A7E3F9C2-1B4D-4E8A-9F6C-2D5B8E1A4C70}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Lonezsi
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
; Lets the silent auto-updater replace a running copy cleanly. Must match the
; mutex name created in launcher.cs.
AppMutex=JDrakoon3_Launcher
CloseApplications=yes
RestartApplications=no
OutputDir=release\installer
OutputBaseFilename=JDrakoon3-Setup
SetupIconFile=drakoon.ico
UninstallDisplayIcon={app}\{#MyAppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; The kiosk needs a desktop browser; this targets x64 Windows.
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"
Name: "startup"; Description: "Start {#MyAppName} when Windows starts"; GroupDescription: "Startup:"; Flags: unchecked

[Registry]
; Per-user autorun (no admin). Created only if the Startup task is checked,
; and removed cleanly on uninstall.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\{#MyAppExe}"""; Flags: uninsdeletevalue; Tasks: startup

[Files]
; Everything the build script assembled, minus the installer output itself.
Source: "release\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion; Excludes: "installer\*"

[Icons]
Name: "{group}\{#MyAppName}";        Filename: "{app}\{#MyAppExe}"; IconFilename: "{app}\drakoon.ico"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}";  Filename: "{app}\{#MyAppExe}"; IconFilename: "{app}\drakoon.ico"; Tasks: desktopicon

[Run]
; No "skipifsilent" so the silent auto-updater relaunches the new version too.
Filename: "{app}\{#MyAppExe}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall

[UninstallDelete]
; Remove the per-user runtime data (logs, edge profile) created at runtime.
Type: filesandordirs; Name: "{localappdata}\{#MyAppName}"

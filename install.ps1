# JDrakoon3 Installer – self‑contained, works from an empty folder
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "=== JDrakoon3 Installer ===" -ForegroundColor Cyan

# 1. Node.js check
try {
    $nodeVersion = (node -v) 2>$null
    if (-not $nodeVersion) { throw }
    $major = [int]$nodeVersion.Substring(1).Split('.')[0]
    if ($major -lt 18) { throw "Node v18+ required (found v$major)" }
    Write-Host "Node.js $nodeVersion found." -ForegroundColor Green
} catch {
    Write-Host "Node.js v18+ not found. Install from https://nodejs.org" -ForegroundColor Red
    Start-Process "https://nodejs.org"
    exit 1
}

# 2. Git check
try {
    git --version | Out-Null
    Write-Host "Git found." -ForegroundColor Green
} catch {
    Write-Host "Git not found. Install from https://git-scm.com" -ForegroundColor Red
    Start-Process "https://git-scm.com"
    exit 1
}

# 3. Clone the repo if we're not already inside it
if (-not (Test-Path "backend\package.json")) {
    Write-Host "Cloning JDrakoon3 from GitHub..." -ForegroundColor Yellow
    git clone https://github.com/Lonezsi/JDrakoon3.git .
    Write-Host "Repository cloned." -ForegroundColor Green
}

# 4. Install dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install
Set-Location ..

Write-Host "Installing TV frontend dependencies..." -ForegroundColor Yellow
Set-Location couch-console
npm install
Set-Location ..

Write-Host "Installing phone frontend dependencies..." -ForegroundColor Yellow
Set-Location couch-remote
npm install
Set-Location ..

# 5. Build frontends
Write-Host "Building TV frontend..." -ForegroundColor Yellow
Set-Location couch-console
npm run build
Set-Location ..

Write-Host "Building phone frontend..." -ForegroundColor Yellow
Set-Location couch-remote
npm run build
Set-Location ..

# 6. Copy builds
$frontendBuild = "backend\frontend-build"
Remove-Item -Recurse -Force $frontendBuild -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$frontendBuild\phone" -Force | Out-Null

Copy-Item -Recurse -Force "couch-console\dist\*" $frontendBuild
Copy-Item -Recurse -Force "couch-remote\dist\*" "$frontendBuild\phone"

Write-Host "Frontends built and copied." -ForegroundColor Green

# 7. Generate update secret
$secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
$envFile = "backend\.env"
@"
UPDATE_SECRET=$secret
"@ | Out-File -FilePath $envFile -Encoding utf8
Write-Host "Update secret saved to $envFile" -ForegroundColor Green

# 8. Create desktop shortcut to start.ps1
$shortcutPath = [Environment]::GetFolderPath("Desktop") + "\JDrakoon3.lnk"
$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$root\start.ps1`""
$Shortcut.WorkingDirectory = $root
$Shortcut.IconLocation = "powershell.exe,0"
$Shortcut.Save()

Write-Host "`nInstallation complete!" -ForegroundColor Cyan
Write-Host "Double-click 'JDrakoon3' on your desktop to start." -ForegroundColor White
Write-Host "`nUpdate secret (needed for auto‑update prompt): $secret" -ForegroundColor DarkGray
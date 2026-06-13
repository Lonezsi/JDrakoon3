# ===========================================================================
#  build-release.ps1  -  Produce a fully self-contained JDrakoon3 release.
#
#  Output:  .\release\   a portable folder you can zip and hand to anyone:
#     JDrakoon3.exe   tiny C# launcher (GUI subsystem -> no console; icon baked in)
#     node.exe        bundled Node runtime (users need NOTHING but Windows)
#     drakoon.ico     app icon
#     VERSION
#     backend\        prebuilt server: dist + node_modules + frontend-build
#
#  Everything is built HERE, once. The exe never compiles or downloads at
#  startup. Optionally also builds an installer if Inno Setup (ISCC) is found.
#
#  Usage:   powershell -ExecutionPolicy Bypass -File .\build-release.ps1
#           ...        -File .\build-release.ps1 -SkipBuild   (repackage only)
#           ...        -File .\build-release.ps1 -Installer   (also build setup)
# ===========================================================================
param(
    [switch]$SkipBuild,   # skip the npm builds, just recompile + reassemble
    [switch]$Installer    # also build the Inno Setup installer (needs ISCC)
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Info($m) { Write-Host "  $m" -ForegroundColor DarkGray }

# Ensure the WebView2 SDK DLLs (managed Core + WinForms wrappers and the native
# WebView2Loader.dll) are present in .\webview2 so the launcher can host a
# branded WebView2 window. Downloaded once from NuGet, then cached.
function Ensure-WebView2 {
    param([string]$rootDir)
    $wvDir  = Join-Path $rootDir "webview2"
    $core   = Join-Path $wvDir "Microsoft.Web.WebView2.Core.dll"
    $wf     = Join-Path $wvDir "Microsoft.Web.WebView2.WinForms.dll"
    $loader = Join-Path $wvDir "WebView2Loader.dll"
    if ((Test-Path $core) -and (Test-Path $wf) -and (Test-Path $loader)) {
        Info "WebView2 SDK present."
        return $wvDir
    }
    New-Item -ItemType Directory -Force -Path $wvDir | Out-Null
    $ver   = "1.0.2792.45"
    $url   = "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$ver"
    $nupkg = Join-Path $env:TEMP "webview2.$ver.zip"
    $ex    = Join-Path $env:TEMP "webview2_extract"
    Info "Downloading WebView2 SDK $ver from NuGet..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $nupkg -UseBasicParsing
    Remove-Item $ex -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -Path $nupkg -DestinationPath $ex -Force
    Copy-Item (Join-Path $ex "lib\net462\Microsoft.Web.WebView2.Core.dll")     $wvDir -Force
    Copy-Item (Join-Path $ex "lib\net462\Microsoft.Web.WebView2.WinForms.dll") $wvDir -Force
    Copy-Item (Join-Path $ex "runtimes\win-x64\native\WebView2Loader.dll")     $wvDir -Force
    Info "WebView2 SDK ready in webview2\."
    return $wvDir
}

$release = Join-Path $root "release"
$relBackend = Join-Path $release "backend"

# --- 0. Tools --------------------------------------------------------------
Step "Checking tools"

$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $cscCmd = Get-Command csc -ErrorAction SilentlyContinue
    if ($cscCmd) { $csc = $cscCmd.Source }
}
if (-not (Test-Path $csc)) {
    Write-Host "C# compiler (csc.exe) not found - install .NET Framework 4." -ForegroundColor Red
    exit 1
}
Info "Using csc: $csc"

$ico = Join-Path $root "drakoon.ico"
if (-not (Test-Path $ico)) {
    Write-Host "drakoon.ico not found in project root." -ForegroundColor Red
    exit 1
}

$nodeExe = (Get-Command node -ErrorAction Stop).Source
Info "Bundling Node runtime: $nodeExe"

# --- 1. Build the three projects -------------------------------------------
if (-not $SkipBuild) {
    Step "Building TV frontend (couch-console)"
    Push-Location (Join-Path $root "couch-console")
    cmd /c "npm run build" ; if ($LASTEXITCODE) { Pop-Location; throw "TV build failed" }
    Pop-Location

    Step "Building phone frontend (couch-remote)"
    Push-Location (Join-Path $root "couch-remote")
    cmd /c "npm run build" ; if ($LASTEXITCODE) { Pop-Location; throw "Phone build failed" }
    Pop-Location

    Step "Building backend (tsc)"
    Push-Location (Join-Path $root "backend")
    cmd /c "npm run build" ; if ($LASTEXITCODE) { Pop-Location; throw "Backend build failed" }
    Pop-Location
}
else {
    Info "Skipping npm builds (-SkipBuild)."
}

# --- 2. Assemble backend\frontend-build (TV at root, phone under /phone) ----
Step "Assembling frontend-build"
$fb = Join-Path $root "backend\frontend-build"
Remove-Item $fb -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $fb "phone") | Out-Null
Copy-Item (Join-Path $root "couch-console\dist\*") $fb -Recurse -Force
Copy-Item (Join-Path $root "couch-remote\dist\*") (Join-Path $fb "phone") -Recurse -Force

# --- 3. Compile the launcher (C# winexe: no console, icon embedded) ---------
Step "Compiling JDrakoon3.exe (C# launcher)"
$wvDir = Ensure-WebView2 $root
$wvCore = Join-Path $wvDir "Microsoft.Web.WebView2.Core.dll"
$wvWf   = Join-Path $wvDir "Microsoft.Web.WebView2.WinForms.dll"

# Free the output file if a previous instance is running.
try { taskkill /IM JDrakoon3.exe /F 2>$null | Out-Null } catch {}
Start-Sleep -Milliseconds 200

& $csc /nologo /target:winexe /platform:x64 /optimize+ `
    /reference:"System.Windows.Forms.dll" /reference:"System.Drawing.dll" `
    /reference:"$wvCore" /reference:"$wvWf" `
    /win32icon:"drakoon.ico" /out:"JDrakoon3.exe" "launcher.cs"
if ($LASTEXITCODE -or -not (Test-Path (Join-Path $root "JDrakoon3.exe"))) {
    throw "csc failed to produce JDrakoon3.exe"
}
Info "Launcher compiled (GUI subsystem, icon embedded, WebView2 host)."

# --- 4. Assemble the release\ folder ---------------------------------------
Step "Assembling release\"
Remove-Item $release -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $relBackend | Out-Null

Copy-Item (Join-Path $root "JDrakoon3.exe") $release -Force
Copy-Item $nodeExe (Join-Path $release "node.exe") -Force
Copy-Item $ico $release -Force

# WebView2 wrapper DLLs + native loader must sit next to JDrakoon3.exe.
Copy-Item (Join-Path $wvDir "Microsoft.Web.WebView2.Core.dll")     $release -Force
Copy-Item (Join-Path $wvDir "Microsoft.Web.WebView2.WinForms.dll") $release -Force
Copy-Item (Join-Path $wvDir "WebView2Loader.dll")                  $release -Force
if (Test-Path (Join-Path $root "VERSION")) {
    Copy-Item (Join-Path $root "VERSION") $release -Force
}

# Backend payload: code + deps + built frontends + config/bin. NOT src/tests.
Info "Copying backend dist + node_modules (this is the big one)..."
Copy-Item (Join-Path $root "backend\dist")           (Join-Path $relBackend "dist")           -Recurse -Force
Copy-Item (Join-Path $root "backend\node_modules")   (Join-Path $relBackend "node_modules")   -Recurse -Force
Copy-Item (Join-Path $root "backend\frontend-build") (Join-Path $relBackend "frontend-build") -Recurse -Force
Copy-Item (Join-Path $root "backend\package.json")   $relBackend -Force
if (Test-Path (Join-Path $root "backend\config")) {
    Copy-Item (Join-Path $root "backend\config") (Join-Path $relBackend "config") -Recurse -Force
}
if (Test-Path (Join-Path $root "backend\bin")) {
    Copy-Item (Join-Path $root "backend\bin") (Join-Path $relBackend "bin") -Recurse -Force
}

$sizeMB = [math]::Round((Get-ChildItem $release -Recurse | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "`nRelease ready: $release  ($sizeMB MB)" -ForegroundColor Green
Write-Host "Run release\JDrakoon3.exe - it starts the backend (hidden) and opens the kiosk." -ForegroundColor Green

# --- 5. Optional installer -------------------------------------------------
if ($Installer) {
    Step "Building installer (Inno Setup)"
    $isccCmd = Get-Command iscc -ErrorAction SilentlyContinue
    $iscc = if ($isccCmd) { $isccCmd.Source } else { $null }
    if (-not $iscc) {
        $guess = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
        if (Test-Path $guess) { $iscc = $guess }
    }
    if ($iscc) {
        & $iscc (Join-Path $root "installer.iss")
        Write-Host "Installer written to release\installer\JDrakoon3-Setup.exe" -ForegroundColor Green
    }
    else {
        Write-Host "Inno Setup (ISCC.exe) not found - skipping installer." -ForegroundColor Yellow
        Write-Host "Install it from https://jrsoftware.org/isdl.php then re-run with -Installer," -ForegroundColor Yellow
        Write-Host "or just zip the release\ folder - the portable exe needs no install." -ForegroundColor Yellow
    }
}

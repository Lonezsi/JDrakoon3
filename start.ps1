param(
    [switch]$ShowTerminal,
    [switch]$SkipBuild,
    [switch]$ForceBuild
)

# JDrakoon3 Launcher – self-contained (production mode)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$ErrorActionPreference = "Stop"
$savedNodeEnv = $env:NODE_ENV
$env:NODE_ENV = "production"

# ── Helper: check if a directory needs rebuild ──────
function Test-RebuildNeeded($srcDir, $distFile, $label) {
    if (-not (Test-Path $distFile)) {
        Write-Host "  $label : dist missing" -ForegroundColor Yellow
        return $true
    }
    # Also rebuild if node_modules is missing (fresh clone)
    $modulesDir = Join-Path (Split-Path $distFile -Parent) "node_modules"
    if (-not (Test-Path $modulesDir)) {
        Write-Host "  $label : node_modules missing" -ForegroundColor Yellow
        return $true
    }
    $distTime = (Get-Item $distFile).LastWriteTime
    $srcFiles = @(Get-ChildItem -Path $srcDir -Recurse -File -ErrorAction SilentlyContinue)
    if ($srcFiles.Count -eq 0) {
        Write-Host "  $label : no source files found" -ForegroundColor Yellow
        return $true
    }
    $latestSrc = ($srcFiles | Sort-Object LastWriteTime -Descending)[0].LastWriteTime
    if ($latestSrc -gt $distTime) {
        Write-Host "  $label : source newer than dist" -ForegroundColor Yellow
        return $true
    }
    Write-Host "  $label : up to date" -ForegroundColor Green
    return $false
}

# ── Kill any previous backend on port 3001 ─────────
Write-Host "Checking for existing backend..." -ForegroundColor Cyan
$pids = netstat -ano | Select-String ":3001 " | Select-String "LISTENING" | ForEach-Object { (-split $_)[-1] }
if ($pids) {
    foreach ($id in $pids) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        Write-Host "Killed process $id on port 3001"
    }
    Start-Sleep -Seconds 1
}

# ── Rebuild backend if needed ───────────────────────
$doBackendBuild = $ForceBuild -or (-not $SkipBuild -and (Test-RebuildNeeded "$root\backend\src" "$root\backend\dist\index.js" "Backend"))
if ($doBackendBuild) {
    Write-Host "Building backend..." -ForegroundColor Yellow
    Push-Location backend
    if (-not (Test-Path "node_modules")) { cmd /c "npm install 2>&1" }
    cmd /c "npm run build 2>&1"
    Pop-Location
    if (-not (Test-Path "backend\dist\index.js")) {
        Write-Host "Backend build failed." -ForegroundColor Red
        exit 1
    }
    Write-Host "Backend build complete." -ForegroundColor Green
} else {
    Write-Host "Backend build skipped (up to date)." -ForegroundColor Cyan
}

# ── Rebuild TV frontend if needed ───────────────────
$doTvBuild = $ForceBuild -or (-not $SkipBuild -and (Test-RebuildNeeded "$root\couch-console\src" "$root\couch-console\dist\index.html" "TV"))
if ($doTvBuild) {
    Write-Host "Rebuilding TV frontend..." -ForegroundColor Yellow
    Push-Location couch-console
    if (-not (Test-Path "node_modules")) { cmd /c "npm install 2>&1" }
    cmd /c "npm run build 2>&1"
    Pop-Location
    Write-Host "TV build complete." -ForegroundColor Green
} else {
    Write-Host "TV build skipped (up to date)." -ForegroundColor Cyan
}

# ── Rebuild phone frontend if needed ────────────────
$doPhoneBuild = $ForceBuild -or (-not $SkipBuild -and (Test-RebuildNeeded "$root\couch-remote\src" "$root\couch-remote\dist\index.html" "Phone"))
if ($doPhoneBuild) {
    Write-Host "Rebuilding phone frontend..." -ForegroundColor Yellow
    Push-Location couch-remote
    if (-not (Test-Path "node_modules")) { cmd /c "npm install 2>&1" }
    cmd /c "npm run build 2>&1"
    Pop-Location
    Write-Host "Phone build complete." -ForegroundColor Green
} else {
    Write-Host "Phone build skipped (up to date)." -ForegroundColor Cyan
}

# ── Copy frontends into backend static folder ────────
Remove-Item -Recurse -Force "backend\frontend-build" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "backend\frontend-build\phone" -Force | Out-Null
Copy-Item -Recurse -Force "couch-console\dist\*" "backend\frontend-build"
Copy-Item -Recurse -Force "couch-remote\dist\*" "backend\frontend-build\phone"
Write-Host "Frontends copied to backend." -ForegroundColor Green

# ── Start backend ─────────────────────────────────────
Write-Host "Starting backend..." -ForegroundColor Cyan
if ($ShowTerminal) {
    $backend = Start-Process -FilePath "cmd" `
        -ArgumentList "/k `"cd /d `"$root\backend`" && node dist/index.js`"" `
        -PassThru
} else {
    $backend = Start-Process -FilePath "cmd" `
        -ArgumentList "/c `"node dist/index.js > `"$root\backend\startup.log`" 2>&1`"" `
        -WorkingDirectory "$root\backend" `
        -PassThru -WindowStyle Hidden
}

# Wait for backend to be ready
$maxWait = 30
$startTime = Get-Date
$ready = $false
while ((Get-Date) - $startTime -lt [TimeSpan]::FromSeconds($maxWait)) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3001" -Method Head -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 800 }
}

if (-not $ready) {
    Write-Host "Backend did not start." -ForegroundColor Red
    if (-not $ShowTerminal -and (Test-Path "$root\backend\startup.log")) {
        Write-Host "Last log output:" -ForegroundColor Yellow
        Get-Content "$root\backend\startup.log" -Tail 20 | ForEach-Object { Write-Host $_ }
    }
    Stop-Process $backend.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "Backend ready. Launching dashboard..." -ForegroundColor Green

# ── Edge kiosk ─────────────────────────────────────────
$edge = Start-Process -FilePath "msedge" `
    -ArgumentList "--kiosk http://localhost:3001 --edge-kiosk-type=fullscreen --no-first-run" `
    -PassThru
$edge.Id | Out-File -FilePath "$root\backend\.edge_pid" -Encoding ascii

Start-Sleep -Seconds 2
if ($edge.HasExited) {
    Write-Host "Edge closed immediately (exit code $($edge.ExitCode))." -ForegroundColor Red
    Remove-Item "$root\backend\.edge_pid" -ErrorAction SilentlyContinue
    Stop-Process $backend.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

# ── Wait for browser close, then stop everything ───
$edge.WaitForExit()
Remove-Item "$root\backend\.edge_pid" -ErrorAction SilentlyContinue
Write-Host "Dashboard closed. Shutting down..." -ForegroundColor Yellow

# Kill the Edge process if it still lingers
Stop-Process $edge.Id -Force -ErrorAction SilentlyContinue

# Kill the backend process (may already be dead if /api/shutdown was used)
Stop-Process $backend.Id -Force -ErrorAction SilentlyContinue

# Terminate any remaining node processes that might be our backend
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process $_.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Cleaned up node process $($_.Id)"
}

# Kill anything still holding port 3001 (final sweep)
$leftoverPids = netstat -ano | Select-String ":3001 " | Select-String "LISTENING" | ForEach-Object { (-split $_)[-1] }
foreach ($id in $leftoverPids) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    Write-Host "Cleaned up leftover process $id on port 3001"
}

$env:NODE_ENV = $savedNodeEnv
Write-Host "Done." -ForegroundColor Green
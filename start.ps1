# JDrakoon3 Launcher
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$ErrorActionPreference = "Stop"

Write-Host "Starting JDrakoon3 backend..." -ForegroundColor Cyan
$backend = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "$root\backend" -PassThru

# Wait for backend to be ready (poll http://localhost:3001)
$maxWait = 15  # seconds
$startTime = Get-Date
$ready = $false
while ((Get-Date) - $startTime -lt [TimeSpan]::FromSeconds($maxWait)) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001" -Method Head -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if (-not $ready) {
    Write-Host "Backend did not start in time. Exiting." -ForegroundColor Red
    Stop-Process $backend.Id -Force
    exit 1
}

Write-Host "Backend ready. Launching fullscreen dashboard..." -ForegroundColor Green

# Open Edge in kiosk mode (reliable fullscreen)
$edge = Start-Process -FilePath "msedge" -ArgumentList "--kiosk http://localhost:3001 --edge-kiosk-type=fullscreen --no-first-run" -PassThru

# Wait for browser to close, then kill backend
$edge.WaitForExit()
Write-Host "Dashboard closed. Shutting down backend..." -ForegroundColor Yellow
Stop-Process $backend.Id -Force
# Deprecated. The old build-on-startup launcher is gone.
# Use build-release.ps1, which produces a fully self-contained .\release\ folder
# (prebuilt — the exe never compiles anything at runtime).
Write-Host "build-exe.ps1 is deprecated -> running build-release.ps1" -ForegroundColor Yellow
& (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "build-release.ps1") @args

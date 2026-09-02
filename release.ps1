# ===========================================================================
#  release.ps1  -  FULL release in one command.
#
#  1. (optional) bump the VERSION file
#  2. sync that version into installer.iss + launcher.cs
#  3. tag the commit  vX.Y.Z  and push the tag using your normal Git SSH key
#  4. GitHub Actions builds the installer and creates the pre-release using
#     GitHub's own scoped token (no local GitHub API token required)
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File .\release.ps1            # release current VERSION
#    powershell -ExecutionPolicy Bypass -File .\release.ps1 -Version 3.0.6
#    powershell -ExecutionPolicy Bypass -File .\release.ps1 -SkipBuild # reuse current build
#    powershell -ExecutionPolicy Bypass -File .\release.ps1 -Force     # overwrite an existing release
# ===========================================================================
param(
    [string]$Version,    # set/bump the VERSION file first (e.g. "3.0.6"); else use current
    [switch]$SkipBuild,  # retained for compatibility; builds happen in Actions
    [switch]$Force       # overwrite an existing tag
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$REPO = "Lonezsi/JDrakoon3"
function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Info($m) { Write-Host "  $m" -ForegroundColor DarkGray }

# --- 1. Version -------------------------------------------------------------
Step "Version"
$versionFile = Join-Path $root "VERSION"
if ($Version) {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "-Version must be X.Y.Z (got '$Version')" }
    Set-Content $versionFile $Version.Trim() -NoNewline -Encoding ascii
    Info "VERSION set to $Version"
}
$ver = (Get-Content $versionFile -Raw).Trim()
if ($ver -notmatch '^\d+\.\d+\.\d+$') { throw "VERSION file is not X.Y.Z (got '$ver')" }
$tag = "v$ver"
$title = "v$ver ALPHA"
Info "Releasing $title"

# Warn if the working tree is dirty - the built installer comes from the working
# tree, but the release tag points at the last commit, so they could differ.
$dirty = git status --porcelain 2>$null
if ($dirty) {
    Write-Host "  ! Working tree has uncommitted changes - the tag $tag will point at the last commit, which may not match the built installer. Commit first for an exact release." -ForegroundColor Yellow
}

# --- 2. Sync version into installer.iss + launcher.cs -----------------------
Step "Syncing version into installer.iss + launcher.cs"
$iss = Join-Path $root "installer.iss"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$issText = Get-Content $iss -Raw
$issUpdated = $issText -replace '(#define\s+MyAppVersion\s+")[^"]*(")', ('${1}' + $ver + '${2}')
if ($issUpdated -cne $issText) { [IO.File]::WriteAllText($iss, $issUpdated, $utf8) }
$launcher = Join-Path $root "launcher.cs"
$launcherText = Get-Content $launcher -Raw
$launcherUpdated = $launcherText -replace '(AssemblyFileVersion\(")[^"]*("\))', ('${1}' + $ver + '${2}')
if ($launcherUpdated -cne $launcherText) { [IO.File]::WriteAllText($launcher, $launcherUpdated, $utf8) }
Info "installer.iss + launcher.cs now report $ver"

# --- 3. Tag + push ----------------------------------------------------------
Step "Tagging $tag"
$tagExists = $false
git rev-parse -q --verify "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) { $tagExists = $true }
if ($tagExists -and -not $Force) {
    throw "Tag $tag already exists. Re-run with -Force to move + re-release it."
}
git tag -f $tag | Out-Null
git push -f origin "refs/tags/$tag"
if ($LASTEXITCODE) { throw "git push of tag $tag failed" }
Info "Pushed tag $tag"
Write-Host "`nTag pushed. GitHub Actions will build and publish $title automatically." -ForegroundColor Green

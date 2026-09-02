# ===========================================================================
#  release.ps1  -  FULL release in one command.
#
#  1. (optional) bump the VERSION file
#  2. sync that version into installer.iss + launcher.cs
#  3. build everything + the Inno Setup installer  (build-release.ps1 -Installer)
#  4. tag the commit  vX.Y.Z  and push the tag
#  5. create a GitHub **pre-release** titled  "vX.Y.Z ALPHA"  with the
#     installer attached  (so the in-app / launcher auto-updater picks it up)
#
#  GitHub auth (no gh CLI required):
#    set a token in  $env:GITHUB_TOKEN  OR a  .github_token  file in the repo
#    root (gitignored).  Needs the `repo` scope (classic) or contents:write
#    (fine-grained).  If the `gh` CLI is installed + authed, it's used instead.
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File .\release.ps1            # release current VERSION
#    powershell -ExecutionPolicy Bypass -File .\release.ps1 -Version 3.0.6
#    powershell -ExecutionPolicy Bypass -File .\release.ps1 -SkipBuild # reuse current build
#    powershell -ExecutionPolicy Bypass -File .\release.ps1 -Force     # overwrite an existing release
# ===========================================================================
param(
    [string]$Version,    # set/bump the VERSION file first (e.g. "3.0.6"); else use current
    [switch]$SkipBuild,  # reuse the existing release\ folder (still rebuilds the installer)
    [switch]$Force,      # overwrite an existing tag / GitHub release of this version
    [string]$Notes       # optional release notes (markdown)
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
(Get-Content $iss -Raw) -replace '(#define\s+MyAppVersion\s+")[^"]*(")', ('${1}' + $ver + '${2}') |
    Set-Content $iss -Encoding utf8
$launcher = Join-Path $root "launcher.cs"
(Get-Content $launcher -Raw) -replace '(AssemblyFileVersion\(")[^"]*("\))', ('${1}' + $ver + '${2}') |
    Set-Content $launcher -Encoding utf8
Info "installer.iss + launcher.cs now report $ver"

# --- 3. Build + installer ---------------------------------------------------
Step "Building release + installer"
$buildArgs = @("-Installer")
if ($SkipBuild) { $buildArgs += "-SkipBuild" }
& powershell -ExecutionPolicy Bypass -File (Join-Path $root "build-release.ps1") @buildArgs
if ($LASTEXITCODE) { throw "build-release.ps1 failed (exit $LASTEXITCODE)" }

$setup = Join-Path $root "release\installer\JDrakoon3-Setup.exe"
if (-not (Test-Path $setup)) {
    throw "Installer not found at $setup - is Inno Setup (ISCC.exe) installed?"
}
# Versioned asset name (the updater matches any *.exe whose name contains 'setup').
$assetName = "JDrakoon3-Setup-$tag.exe"
$asset = Join-Path $root "release\installer\$assetName"
Copy-Item $setup $asset -Force
Info "Installer: $asset ($([math]::Round((Get-Item $asset).Length / 1MB, 1)) MB)"

# --- 4. Tag + push ----------------------------------------------------------
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

# --- 5. GitHub pre-release --------------------------------------------------
Step "Publishing GitHub pre-release"
$body = if ($Notes) { $Notes } else { "Alpha build $ver." }

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    Info "Using gh CLI"
    if ($tagExists -and $Force) { gh release delete $tag --repo $REPO --yes 2>$null }
    gh release create $tag $asset --repo $REPO --title $title --notes $body --prerelease
    if ($LASTEXITCODE) { throw "gh release create failed" }
}
else {
    # REST API fallback (no gh). Needs a token.
    $token = $env:GITHUB_TOKEN
    if (-not $token) {
        $tokFile = Join-Path $root ".github_token"
        if (Test-Path $tokFile) { $token = (Get-Content $tokFile -Raw).Trim() }
    }
    if (-not $token) {
        throw 'No GitHub auth. Install the gh CLI, OR set $env:GITHUB_TOKEN, OR put a token in .github_token (repo scope / contents:write).'
    }

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $base = "https://api.github.com/repos/$REPO"
    $headers = @{
        Authorization = "Bearer $token"
        "User-Agent"  = "JDrakoon3-Release"
        Accept        = "application/vnd.github+json"
    }

    # Existing release for this tag?
    $existing = $null
    try { $existing = Invoke-RestMethod "$base/releases/tags/$tag" -Headers $headers } catch {}
    if ($existing) {
        if (-not $Force) { throw "A GitHub release for $tag already exists. Use -Force." }
        Info "Deleting existing release for $tag"
        Invoke-RestMethod "$base/releases/$($existing.id)" -Method Delete -Headers $headers | Out-Null
    }

    $relBody = @{
        tag_name   = $tag
        name       = $title
        body       = $body
        prerelease = $true
        draft      = $false
    } | ConvertTo-Json
    Info "Creating release $title"
    $rel = Invoke-RestMethod "$base/releases" -Method Post -Headers $headers -Body $relBody -ContentType "application/json"

    # Upload the installer asset.
    $uploadUrl = ($rel.upload_url -replace '\{[^}]*\}', '') + "?name=$assetName"
    Info "Uploading $assetName"
    Invoke-RestMethod $uploadUrl -Method Post -Headers $headers -InFile $asset -ContentType "application/octet-stream" | Out-Null

    Write-Host "`nReleased: $($rel.html_url)" -ForegroundColor Green
}

Write-Host "`nDone - $title is live as a pre-release with $assetName attached." -ForegroundColor Green

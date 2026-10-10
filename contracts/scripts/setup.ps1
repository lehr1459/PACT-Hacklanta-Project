$ErrorActionPreference = 'Stop'
$contractRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pins = Get-Content (Join-Path $contractRoot 'dependencies.json') -Raw | ConvertFrom-Json
$toolDir = Join-Path $contractRoot '.tools/foundry-v1.8.5'
New-Item -ItemType Directory -Force $toolDir | Out-Null
if (!(Test-Path (Join-Path $toolDir 'forge.exe'))) {
    $archive = Join-Path $contractRoot '.tools/foundry-v1.8.5.zip'
    Invoke-WebRequest -UseBasicParsing 'https://github.com/foundry-rs/foundry/releases/download/v1.8.5/foundry_v1.8.5_win32_amd64.zip' -OutFile $archive
    if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLower() -ne $pins.foundry.windowsZipSha256) { throw 'Foundry checksum mismatch' }
    Expand-Archive $archive $toolDir -Force
}
New-Item -ItemType Directory -Force (Join-Path $contractRoot 'lib') | Out-Null
foreach ($name in @('forge-std', 'openzeppelin-contracts')) {
    $pin = $pins.$name
    $destination = Join-Path $contractRoot "lib/$name"
    if (!(Test-Path $destination)) {
        & git clone --depth 1 --branch $pin.tag $pin.repository $destination
        if ($LASTEXITCODE -ne 0) { throw "$name clone failed" }
    }
    $commit = & git -C $destination rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $commit -ne $pin.commit) { throw "$name commit mismatch" }
    Write-Output "$name verified at $commit"
}
& (Join-Path $toolDir 'forge.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'Foundry failed to start' }

$ErrorActionPreference = 'Stop'

# Stream literal file bytes using .NET on Windows PowerShell 5.1 and PowerShell 7.
# Do not depend on Get-FileHash module discovery across the pwsh -> powershell boundary.
function Get-PactFileSha256([string]$LiteralPath) {
    $stream = [IO.File]::OpenRead($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($LiteralPath))
    try {
        $sha256 = [Security.Cryptography.SHA256]::Create()
        try { return [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $sha256.Dispose() }
    } finally { $stream.Dispose() }
}

$contractRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pins = Get-Content (Join-Path $contractRoot 'dependencies.json') -Raw | ConvertFrom-Json
$toolDir = Join-Path $contractRoot '.tools/foundry-v1.8.5'
New-Item -ItemType Directory -Force $toolDir | Out-Null
if (!(Test-Path (Join-Path $toolDir 'forge.exe'))) {
    $archive = Join-Path $contractRoot '.tools/foundry-v1.8.5.zip'
    Invoke-WebRequest -UseBasicParsing 'https://github.com/foundry-rs/foundry/releases/download/v1.8.5/foundry_v1.8.5_win32_amd64.zip' -OutFile $archive
    if ((Get-PactFileSha256 $archive) -ne $pins.foundry.windowsZipSha256) { throw 'Foundry checksum mismatch' }
    Expand-Archive $archive $toolDir -Force
}
foreach ($pin in $pins.foundry.windowsExeSha256.PSObject.Properties) {
    $executable = Join-Path $toolDir $pin.Name
    if (!(Test-Path $executable) -or (Get-PactFileSha256 $executable) -ne $pin.Value) {
        throw "Foundry executable checksum mismatch: $($pin.Name)"
    }
    Write-Output "$($pin.Name) checksum verified"
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
    $dirty = & git -C $destination status --porcelain --untracked-files=all --ignored
    if ($LASTEXITCODE -ne 0 -or $dirty) { throw "$name working tree is not clean; restore the pinned checkout before continuing" }
    Write-Output "$name verified at $commit"
}
& (Join-Path $toolDir 'forge.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'Foundry failed to start' }

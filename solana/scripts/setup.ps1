$ErrorActionPreference='Stop'

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

$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tools=Join-Path $root '.tools'
$pins=Get-Content (Join-Path $root 'toolchain.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force $tools | Out-Null
if (!(Test-Path (Join-Path $tools 'rust/bin/cargo.exe'))) {
    $archive=Join-Path $tools 'platform-tools-windows-x86_64.tar.bz2'
    if (!(Test-Path $archive)) { & curl.exe -fL $pins.platformTools.url -o $archive; if($LASTEXITCODE -ne 0){throw 'Tool download failed'} }
    if ((Get-PactFileSha256 $archive) -ne $pins.platformTools.sha256){throw 'Tool archive checksum mismatch'}
    # PATH can select a tar that launches an external bzip2. Qualify Windows
    # bsdtar to avoid PATH-dependent decompression; it handles bzip2 in-process.
    $tar = Join-Path $env:SystemRoot 'System32/tar.exe'
    Write-Output "Extracting verified compiler archive with $tar"
    & $tar -xjf $archive -C $tools
    if($LASTEXITCODE -ne 0){throw 'Tool extraction failed'}
}
foreach($pin in $pins.executables.PSObject.Properties) {
    $path=Join-Path $tools $pin.Name
    if (!(Test-Path $path) -or (Get-PactFileSha256 $path) -ne $pin.Value){throw "Tool executable mismatch: $($pin.Name)"}
    Write-Output "Verified $($pin.Name)"
}
$python=Join-Path $tools 'venv/Scripts/python.exe'
if (!(Test-Path $python)) { & py -m venv (Join-Path $tools 'venv'); if($LASTEXITCODE -ne 0){throw 'Python venv creation failed'} }
& $python -m pip install --require-hashes --only-binary=:all: -r (Join-Path $root 'requirements-lock.txt')
if($LASTEXITCODE -ne 0){throw 'Python dependency setup failed'}
Write-Output 'Local compiler and LiteSVM ready. No CLI, wallets or keypairs installed/generated.'

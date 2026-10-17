param([string]$CastPath = (Join-Path $PSScriptRoot '../.tools/foundry-v1.8.5/cast.exe'))
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
$artifactPath = Join-Path $contractRoot 'out/PactLicensing.sol/PactLicensing.json'
$abiPath = Join-Path $contractRoot 'abi/PactLicensing.json'
$artifact = Get-Content $artifactPath -Raw | ConvertFrom-Json
$abi = Get-Content $abiPath -Raw | ConvertFrom-Json
if ((ConvertTo-Json -InputObject @($artifact.abi) -Depth 100 -Compress) -ne (ConvertTo-Json -InputObject @($abi) -Depth 100 -Compress)) {
    throw 'Exported ABI differs from current artifact'
}
function Get-BytecodeEvidence([string]$hex) {
    $hex = $hex -replace '^0x', ''
    if (!$hex -or $hex.Length % 2 -ne 0 -or $hex -notmatch '^[0-9a-fA-F]+$') { throw 'Invalid bytecode' }
    $bytes = New-Object byte[] ($hex.Length / 2)
    for ($index = 0; $index -lt $bytes.Length; $index++) { $bytes[$index] = [Convert]::ToByte($hex.Substring($index * 2, 2), 16) }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $sha256 = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLower() } finally { $sha.Dispose() }
    $keccak = & $CastPath keccak "0x$hex"
    if ($LASTEXITCODE -ne 0) { throw 'cast keccak failed' }
    return [ordered]@{lengthBytes = $bytes.Length; sha256 = $sha256; keccak256 = $keccak}
}
$evidence = [ordered]@{
    contract = 'src/PactLicensing.sol:PactLicensing'
    compiler = $artifact.metadata.compiler.version
    settings = $artifact.metadata.settings
    creationBytecode = Get-BytecodeEvidence $artifact.bytecode.object
    runtimeBytecode = Get-BytecodeEvidence $artifact.deployedBytecode.object
    sourceSha256 = (Get-PactFileSha256 (Join-Path $contractRoot 'src/PactLicensing.sol'))
    abiSha256 = (Get-PactFileSha256 $abiPath)
    abiEntries = @($abi).Count
    abiMatchesArtifact = $true
    address = $null
    deploymentTransaction = $null
}
$outputPath = Join-Path $contractRoot 'abi/PactLicensing.evidence.json'
[IO.File]::WriteAllText($outputPath, (ConvertTo-Json $evidence -Depth 100) + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
Write-Output (ConvertTo-Json $evidence -Depth 100)

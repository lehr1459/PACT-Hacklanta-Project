param([string]$ForgePath = (Join-Path $PSScriptRoot '../.tools/foundry-v1.8.5/forge.exe'))
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    & $ForgePath build
    if ($LASTEXITCODE -ne 0) { throw 'forge build failed' }
    $artifact = Get-Content 'out/PactLicensing.sol/PactLicensing.json' -Raw | ConvertFrom-Json
    New-Item -ItemType Directory -Force 'abi' | Out-Null
    $json = ConvertTo-Json -InputObject @($artifact.abi) -Depth 100
    [IO.File]::WriteAllText((Join-Path (Get-Location) 'abi/PactLicensing.json'), $json + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    Write-Output 'Exported abi/PactLicensing.json'
} finally { Pop-Location }

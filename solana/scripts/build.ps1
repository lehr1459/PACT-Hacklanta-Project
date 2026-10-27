param(
    [string]$TargetDirectory = 'target',
    [string]$ArtifactDirectory = 'artifacts'
)

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

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tools = Join-Path $root '.tools'
$pins = Get-Content -LiteralPath (Join-Path $root 'toolchain.json') -Raw | ConvertFrom-Json

function Resolve-BuildOutput([string]$Directory, [string]$Allowed) {
    if ([string]::IsNullOrWhiteSpace($Directory)) { throw 'A build output directory is required.' }
    $full = if ([IO.Path]::IsPathRooted($Directory)) { [IO.Path]::GetFullPath($Directory) } else { [IO.Path]::GetFullPath((Join-Path $root $Directory)) }
    if (!$full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Build outputs must remain inside the Solana workspace.' }
    $relative = $full.Substring($root.Length + 1).Replace('\', '/')
    if ($relative -notmatch $Allowed) { throw 'Build outputs must use the approved target/artifacts directories.' }
    # Do not allow an existing child junction to redirect writes outside the workspace.
    for ($ancestor = $full; $ancestor -ne $root; $ancestor = [IO.Path]::GetDirectoryName($ancestor)) {
        if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Build output paths must not traverse workspace child reparse points.' }
    }
    return $full
}

$target = Resolve-BuildOutput $TargetDirectory '^target(?:/|$)'
$artifacts = Resolve-BuildOutput $ArtifactDirectory '^(?:target|artifacts)(?:/|$)'

# These can replace the reviewed compiler, flags or release profile. Report only
# variable names; never echo inherited values. No user environment is changed.
$unsupported = @('RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'CARGO_BUILD_RUSTFLAGS', 'CARGO_TARGET_SBPF_SOLANA_SOLANA_RUSTFLAGS', 'RUSTC_WRAPPER', 'RUSTC_WORKSPACE_WRAPPER', 'CARGO_TARGET_SBPF_SOLANA_SOLANA_LINKER', 'CARGO_PROFILE_RELEASE_OPT_LEVEL', 'CARGO_PROFILE_RELEASE_LTO', 'CARGO_PROFILE_RELEASE_CODEGEN_UNITS', 'CARGO_PROFILE_RELEASE_OVERFLOW_CHECKS', 'CARGO_PROFILE_RELEASE_PANIC', 'CARGO_PROFILE_RELEASE_DEBUG', 'CARGO_PROFILE_RELEASE_STRIP', 'CARGO_INCREMENTAL')
foreach ($name in $unsupported) {
    if (![string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name, 'Process'))) { throw "Unsupported inherited compiler configuration: $name. Use a clean build environment." }
}

# Verification is local only. Install the pinned tools separately with setup.ps1.
foreach ($pin in $pins.executables.PSObject.Properties) {
    $executable = [IO.Path]::GetFullPath((Join-Path $tools $pin.Name))
    if (!$executable.StartsWith($tools + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or $pin.Value -notmatch '^[0-9a-f]{64}$') { throw 'Invalid pinned tool declaration.' }
    if (!(Test-Path -LiteralPath $executable -PathType Leaf) -or (Get-PactFileSha256 $executable) -ne $pin.Value) { throw "Tool executable checksum mismatch: $($pin.Name). Run the reviewed setup separately." }
    Write-Output "Verified $($pin.Name)"
}

$oldEnvironment = [ordered]@{}
foreach ($name in @('CARGO_HOME', 'RUSTC', 'PATH', 'CARGO_ENCODED_RUSTFLAGS')) { $oldEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$literalCargo = Join-Path $root '.tools/cargo'
$cargo = [IO.Path]::GetFullPath($literalCargo)
$flags = @()
# rustc applies the last matching rule. Keep the nested Cargo-home rules last.
# https://doc.rust-lang.org/rustc/remap-source-paths.html
foreach ($prefix in (@($root, $root.Replace('\', '/')) | Select-Object -Unique)) { $flags += "--remap-path-prefix=$prefix=$($pins.pathRemapping.workspace)" }
foreach ($prefix in (@($literalCargo, $literalCargo.Replace('/', '\'), $literalCargo.Replace('\', '/'), $cargo, $cargo.Replace('\', '/')) | Select-Object -Unique)) { $flags += "--remap-path-prefix=$prefix=$($pins.pathRemapping.cargoHome)" }
if ($pins.pathRemapping.workspace -ne '/pact/solana' -or $pins.pathRemapping.cargoHome -ne '/pact/cargo') { throw 'Unexpected virtual source-path policy.' }

Push-Location $root
try {
    $env:CARGO_HOME = $cargo
    $env:RUSTC = Join-Path $tools 'rust/bin/rustc.exe'
    $env:PATH = (Join-Path $tools 'llvm/bin') + ';' + $oldEnvironment['PATH']
    # ASCII 31 separates complete arguments, preserving checkout paths with spaces.
    $env:CARGO_ENCODED_RUSTFLAGS = $flags -join [char]31
    & (Join-Path $tools 'rust/bin/cargo.exe') build --release --locked --target sbpf-solana-solana --target-dir $target
    if ($LASTEXITCODE -ne 0) { throw 'SBF build failed' }
    $compiled = Join-Path $target 'sbpf-solana-solana/release/pact_licensing.so'
    & (Join-Path $tools 'llvm/bin/llvm-readelf.exe') -h $compiled
    if ($LASTEXITCODE -ne 0) { throw 'ELF verification failed' }
    New-Item -ItemType Directory -Path $artifacts -Force | Out-Null
    $output = Join-Path $artifacts 'pact_licensing.so'
    Copy-Item -LiteralPath $compiled -Destination $output -Force
    $relativeArtifact = $output.Substring($root.Length + 1).Replace('\', '/')
    $evidence = [ordered]@{
        artifact = $relativeArtifact; format = 'ELF64 Solana Bytecode Format shared object'
        sha256 = (Get-PactFileSha256 $output)
        sizeBytes = (Get-Item -LiteralPath $output).Length
        sourceSha256 = (Get-PactFileSha256 'src/lib.rs')
        cargoLockSha256 = (Get-PactFileSha256 'Cargo.lock')
        wireSpecSha256 = (Get-PactFileSha256 'wire-spec.json')
        toolchain = 'anza platform-tools v1.57'; target = 'sbpf-solana-solana'
        pathRemapping = [ordered]@{workspace = '/pact/solana'; cargoHome = '/pact/cargo'; encoding = 'CARGO_ENCODED_RUSTFLAGS (ASCII 31)'}
        runtimeProgramId = 'dynamic'; deploymentProgramId = $null; deploymentSignature = $null
        localFixtureProgramId = 'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx'
    }
    [IO.File]::WriteAllText((Join-Path $artifacts 'evidence.json'), (ConvertTo-Json $evidence -Depth 10) + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
    Write-Output (ConvertTo-Json $evidence -Depth 10)
} finally {
    Pop-Location
    foreach ($name in $oldEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $oldEnvironment[$name], 'Process') }
}

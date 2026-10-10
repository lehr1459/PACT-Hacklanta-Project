$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$oldCargo=$env:CARGO_HOME; $oldRustc=$env:RUSTC; $oldPath=$env:PATH
Push-Location $root
try {
    $env:CARGO_HOME=Join-Path $root '.tools/cargo'
    $env:RUSTC=Join-Path $root '.tools/rust/bin/rustc.exe'
    $env:PATH=(Join-Path $root '.tools/llvm/bin')+';'+$oldPath
    & (Join-Path $root '.tools/rust/bin/cargo.exe') build --release --locked --target sbpf-solana-solana --target-dir target
    if($LASTEXITCODE -ne 0){throw 'SBF build failed'}
    New-Item -ItemType Directory -Force artifacts | Out-Null
    Copy-Item -LiteralPath 'target/sbpf-solana-solana/release/pact_licensing.so' -Destination 'artifacts/pact_licensing.so' -Force
    $evidence=[ordered]@{
        artifact='artifacts/pact_licensing.so'; format='ELF64 Solana Bytecode Format shared object'
        sha256=(Get-FileHash 'artifacts/pact_licensing.so' -Algorithm SHA256).Hash.ToLower()
        sizeBytes=(Get-Item 'artifacts/pact_licensing.so').Length
        sourceSha256=(Get-FileHash 'src/lib.rs' -Algorithm SHA256).Hash.ToLower()
        cargoLockSha256=(Get-FileHash 'Cargo.lock' -Algorithm SHA256).Hash.ToLower()
        wireSpecSha256=(Get-FileHash 'wire-spec.json' -Algorithm SHA256).Hash.ToLower()
        toolchain='anza platform-tools v1.57'; target='sbpf-solana-solana'
        runtimeProgramId='dynamic'; deploymentProgramId=$null; deploymentSignature=$null
        localFixtureProgramId='US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx'
    }
    [IO.File]::WriteAllText((Join-Path $root 'artifacts/evidence.json'),(ConvertTo-Json $evidence -Depth 10)+[Environment]::NewLine,(New-Object Text.UTF8Encoding($false)))
    & (Join-Path $root '.tools/llvm/bin/llvm-readelf.exe') -h 'artifacts/pact_licensing.so'
    if($LASTEXITCODE -ne 0){throw 'ELF verification failed'}
    Write-Output (ConvertTo-Json $evidence -Depth 10)
} finally { Pop-Location; $env:CARGO_HOME=$oldCargo; $env:RUSTC=$oldRustc; $env:PATH=$oldPath }

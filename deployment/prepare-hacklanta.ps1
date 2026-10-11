param(
    [Parameter(Mandatory = $true)][string]$PactPublicUrl,
    [string]$SaturdayProjectId = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$saturdaySource = 'C:\Hackathon\saturday-lights'
$originalSiteId = 'appgprj_6ab80811a9988191b55627a22b14bed2'
$offer = '7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh'

# Only an HTTPS root URL with a public DNS hostname is accepted. No inline-script
# delimiters, credentials, ports, query, fragment or operator-controlled offer.
if ($PactPublicUrl -notmatch '^https://[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/?$') {
    throw 'Supply the approved public PACT HTTPS origin only (for example https://your-project.vercel.app/).'
}
$publicOrigin = [Uri]$PactPublicUrl
if ($publicOrigin.Host -match '(^|\.)(localhost|local|internal)$' -or $publicOrigin.Host -match '^\d+(\.\d+){3}$') {
    throw 'A local or IP address is not a public demo target.'
}
if ($SaturdayProjectId -and ($SaturdayProjectId -eq $originalSiteId -or $SaturdayProjectId -match '\s')) {
    throw 'Use only the exact newly approved Sites project ID; the original Saturday target is forbidden.'
}
$purchaseUrl = $publicOrigin.GetLeftPart([UriPartial]::Authority) + '/?offer=' + $offer
$candidateRoot = Join-Path $repoRoot '.deployment-candidates'
New-Item -ItemType Directory -Path $candidateRoot -Force | Out-Null
$candidate = Join-Path $candidateRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $candidate | Out-Null
$pact = Join-Path $candidate 'pact'
$saturday = Join-Path $candidate 'saturday-lights'

function Copy-PublicFile([string]$SourceRoot, [string]$Relative, [string]$DestinationRoot) {
    $sourceFile = Join-Path $SourceRoot $Relative
    if (!(Test-Path -LiteralPath $sourceFile -PathType Leaf)) { throw "Missing public input: $sourceFile" }
    $destinationFile = Join-Path $DestinationRoot $Relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destinationFile) -Force | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination $destinationFile
}
function Copy-PublicDirectory([string]$SourceRoot, [string]$Relative, [string]$DestinationRoot) {
    $sourceDirectory = Join-Path $SourceRoot $Relative
    if (!(Test-Path -LiteralPath $sourceDirectory -PathType Container)) { throw "Missing public input: $sourceDirectory" }
    foreach ($file in Get-ChildItem -LiteralPath $sourceDirectory -File -Recurse) {
        $suffix = $file.FullName.Substring($SourceRoot.Length + 1)
        if ($suffix -match '(^|[\\/])(node_modules|dist|\.next|\.git)([\\/]|$)' -or $file.Name -like '.env*') { continue }
        Copy-PublicFile $SourceRoot $suffix $DestinationRoot
    }
}

# Deliberate source allowlists: no .env, deployment authorities, Solana signers,
# Git remotes or cached build trees can enter either upload directory.
foreach ($folder in @('web/app', 'web/components', 'web/lib', 'packages/pact-sdk/src')) {
    Copy-PublicDirectory $repoRoot $folder $pact
}
if (Test-Path -LiteralPath (Join-Path $repoRoot 'web/public') -PathType Container) { Copy-PublicDirectory $repoRoot 'web/public' $pact }
foreach ($file in @('web/package.json', 'web/package-lock.json', 'web/next.config.ts', 'web/next-env.d.ts', 'web/tsconfig.json', 'web/vercel.json', 'packages/pact-sdk/package.json', 'packages/pact-sdk/package-lock.json', 'packages/pact-sdk/tsconfig.json', 'packages/pact-sdk/build.mjs', 'packages/pact-sdk/README.md', 'contracts/abi/PactLicensing.json', 'solana/wire-spec.json')) {
    Copy-PublicFile $repoRoot $file $pact
}
foreach ($folder in @('worker', 'scripts', 'drizzle', 'vendor/pact-sdk/src')) {
    Copy-PublicDirectory $saturdaySource $folder $saturday
}
foreach ($file in @('package.json', 'package-lock.json', 'README.md', 'PACT_INTEGRATION.md', 'vendor/pact-sdk/package.json', 'vendor/pact-sdk/tsconfig.json')) {
    Copy-PublicFile $saturdaySource $file $saturday
}
& node (Join-Path $PSScriptRoot 'fence-saturday-connect.mjs') $saturday | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Saturday release-copy connection hardening failed.' }
New-Item -ItemType Directory -Path (Join-Path $saturday '.openai') -Force | Out-Null
$manifest = Get-Content -LiteralPath (Join-Path $saturdaySource '.openai/hosting.json') -Raw | ConvertFrom-Json
$manifest.PSObject.Properties.Remove('project_id')
if ($SaturdayProjectId) { $manifest | Add-Member -NotePropertyName project_id -NotePropertyValue $SaturdayProjectId }
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $saturday '.openai/hosting.json'), ($manifest | ConvertTo-Json -Depth 20) + "`n", $utf8)
foreach ($directory in @($pact, $saturday)) {
    [IO.File]::WriteAllText((Join-Path $directory '.gitignore'), "node_modules/`ndist/`n.next/`n.env`n.env.*`n*.log`n", $utf8)
}
$inputs = foreach ($file in Get-ChildItem -LiteralPath $candidate -File -Recurse) {
    [ordered]@{path = $file.FullName.Substring($candidate.Length + 1); sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}
}
$result = [ordered]@{
    candidate = $candidate
    pactSource = $pact
    saturdaySource = $saturday
    purchaseUrl = $purchaseUrl
    publicUrlVerified = $false
    saturdayProjectId = $SaturdayProjectId
    deploymentAuthorized = $false
    files = @($inputs)
}
[IO.File]::WriteAllText((Join-Path $candidate 'preparation.json'), ($result | ConvertTo-Json -Depth 20) + "`n", $utf8)
[pscustomobject]$result | Select-Object candidate, pactSource, saturdaySource, purchaseUrl, publicUrlVerified, saturdayProjectId, deploymentAuthorized | ConvertTo-Json

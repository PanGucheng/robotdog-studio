param([string]$Version = 'v1.9.1')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'config/reasonix-runtime.json') -Raw | ConvertFrom-Json
if ($Version -ne $manifest.version) { throw "Only pinned Reasonix $($manifest.version) is supported." }

$target = Join-Path $root "resources/tools/reasonix-$($manifest.version.TrimStart('v'))"
$archive = Join-Path $target $manifest.asset
$binary = Join-Path $root $manifest.binaryRelativePath
New-Item -ItemType Directory -Force $target | Out-Null

if (-not (Test-Path $archive)) {
  gh release download $manifest.version -R esengine/DeepSeek-Reasonix --pattern $manifest.asset --pattern SHA256SUMS --dir $target
}
$archiveHash = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($archiveHash -ne $manifest.assetSha256) { throw 'Reasonix archive SHA-256 mismatch.' }

if (-not (Test-Path $binary)) {
  Expand-Archive -LiteralPath $archive -DestinationPath (Split-Path -Parent $binary) -Force
}
$binaryHash = (Get-FileHash $binary -Algorithm SHA256).Hash.ToLowerInvariant()
if ($binaryHash -ne $manifest.binarySha256) { throw 'Reasonix binary SHA-256 mismatch.' }
Write-Host "Reasonix $($manifest.version) is ready: $binary"

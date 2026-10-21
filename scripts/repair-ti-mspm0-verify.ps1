param(
  [Parameter(Mandatory = $true)]
  [string]$StudioDirectory
)

$ErrorActionPreference = 'Stop'
$studioRoot = (Resolve-Path -LiteralPath $StudioDirectory).Path
$toolsRoot = Join-Path $studioRoot 'resources\toolchains\ti-mspm0'
$manifestFile = Join-Path $toolsRoot 'manifest.json'
if (!(Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
  throw 'Select the TI Studio application folder containing resources/toolchains/ti-mspm0/manifest.json.'
}
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($manifest.platform -ne 'ti-mspm0') { throw 'The selected toolchain is not TI MSPM0.' }

$configFile = Join-Path $toolsRoot 'openocd\share\openocd\scripts\target\ti\mspm0.cfg'
$config = [IO.File]::ReadAllText($configFile)
$oldSetting = 'set _WORKAREABASE 0x20000000'
$newSetting = 'set _WORKAREABASE 0x20200000'
if ($config.Contains($newSetting) -and !$config.Contains($oldSetting)) {
  Write-Output 'TI MSPM0G3507 verification SRAM is already corrected. No changes needed.'
  exit 0
}
if ([regex]::Matches($config, [regex]::Escape($oldSetting)).Count -ne 1) {
  throw 'Unexpected OpenOCD configuration. No changes made.'
}

# Preserve the exact original bytes before changing the installed configuration.
$backupFile = $configFile + '.before-g3507-sram-fix-' + [Guid]::NewGuid().ToString('N')
Copy-Item -LiteralPath $configFile -Destination $backupFile
try {
  [IO.File]::WriteAllText($configFile, $config.Replace($oldSetting, $newSetting), [Text.UTF8Encoding]::new($false))
  if (![IO.File]::ReadAllText($configFile).Contains($newSetting)) { throw 'Configuration readback failed.' }
} catch {
  Copy-Item -LiteralPath $backupFile -Destination $configFile -Force
  throw
}
Write-Output 'TI MSPM0G3507 verification SRAM corrected to 0x20200000. Restart Studio and retry flashing.'
Write-Output ('Original configuration backup: ' + $backupFile)

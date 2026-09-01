param(
  [string]$SourceRoot = 'D:\ti\sysconfig_1.28.1',
  [string]$SdkRoot = 'D:\ti\mspm0_sdk_2_11_00_07',
  [string]$ProbeRoot = (Join-Path ([IO.Path]::GetTempPath()) 'robotdog-sysconfig-portable-1.28.1'),
  [switch]$SkipCopy,
  [switch]$SkipGui
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedProbe = [IO.Path]::GetFullPath($ProbeRoot)
if (-not $resolvedProbe.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "ProbeRoot must stay inside the system temporary directory: $resolvedProbe"
}

if (-not $SkipCopy) {
  if (Test-Path -LiteralPath $resolvedProbe) { Remove-Item -LiteralPath $resolvedProbe -Recurse -Force }
  Copy-Item -LiteralPath $SourceRoot -Destination $resolvedProbe -Recurse -Force
}

$cli = Join-Path $resolvedProbe 'sysconfig_cli.bat'
$gui = Join-Path $resolvedProbe 'sysconfig_gui.bat'
$product = Join-Path $SdkRoot '.metadata\product.json'
$syscfg = Join-Path $workspaceRoot 'resources\workspace-templates\ti-mspm0g3507-foundations\gpio_toggle_output.syscfg'
$generated = Join-Path $resolvedProbe '_robotdog_probe_generated'
New-Item -ItemType Directory -Path $generated -Force | Out-Null

& $env:ComSpec /d /c call $cli --version
if ($LASTEXITCODE -ne 0) { throw "Portable SysConfig version probe failed: $LASTEXITCODE" }
& $env:ComSpec /d /c call $cli --compiler gcc --product $product --output $generated $syscfg
if ($LASTEXITCODE -ne 0) { throw "Portable SysConfig generation failed: $LASTEXITCODE" }

$required = @('ti_msp_dl_config.c', 'ti_msp_dl_config.h', 'device.opt', 'device.lds.genlibs')
foreach ($name in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $generated $name))) { throw "Portable SysConfig did not generate $name" }
}

$guiLaunched = $false
if (-not $SkipGui) {
  $nwPath = Join-Path $resolvedProbe 'nw\nw.exe'
  $before = @(Get-Process -Name nw -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $nwPath } | Select-Object -ExpandProperty Id)
  Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', 'call', $gui, '--compiler', 'gcc', '--product', $product, $syscfg) -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 8
  $spawned = @(Get-Process -Name nw -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $nwPath -and $_.Id -notin $before })
  if ($spawned.Count -eq 0) { throw 'Portable SysConfig GUI did not remain running' }
  $spawned | Stop-Process -Force
  $guiLaunched = $true
}

Write-Output "SYSCONFIG_PORTABLE_OK root=$resolvedProbe generated=$($required.Count) guiLaunched=$guiLaunched"

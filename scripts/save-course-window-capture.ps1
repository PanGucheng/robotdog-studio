param([Parameter(Mandatory = $true)][string]$OutputPath)

# First capture the intended foreground window with Alt+PrintScreen.
# This script only saves that clipboard image; it does not control any window.
Add-Type -AssemblyName System.Windows.Forms
$captureImage = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $captureImage) { throw 'No window image in clipboard. Capture the intended window first.' }
try {
    $captureOutput = [System.IO.Path]::GetFullPath($OutputPath)
    New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($captureOutput)) -Force | Out-Null
    $captureImage.Save($captureOutput, [System.Drawing.Imaging.ImageFormat]::Png)
    [PSCustomObject]@{ path = $captureOutput; width = $captureImage.Width; height = $captureImage.Height; format = 'PNG' } | ConvertTo-Json -Compress
} finally {
    $captureImage.Dispose()
}

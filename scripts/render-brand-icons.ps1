$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconRoot = Join-Path $PSScriptRoot '..\images\icons'
$targets = @(
  @{Name='icon-192.png'; Size=192; Maskable=$false},
  @{Name='icon-512.png'; Size=512; Maskable=$false},
  @{Name='icon-maskable-512.png'; Size=512; Maskable=$true},
  @{Name='apple-touch-icon.png'; Size=180; Maskable=$false}
)
# Same three cut polygons as the SVG mark; maskable version has extra safe space.
$polygons = @(
  @(15,16,24,12,24,52,15,52),
  @(27,31,41,17,52,17,34,36),
  @(27,38,34,31,53,52,41,52)
)
foreach ($target in $targets) {
  $bitmap = New-Object System.Drawing.Bitmap($target.Size, $target.Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#251a2e'))
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#e3f291'))
  $scale = $target.Size / 64.0
  $safe = if ($target.Maskable) { 0.76 } else { 1.0 }
  foreach ($polygon in $polygons) {
    $points = for ($i=0; $i -lt $polygon.Length; $i+=2) {
      $pointX = (($polygon[$i]-32)*$safe+32)*$scale
      $pointY = (($polygon[$i+1]-32)*$safe+32)*$scale
      [System.Drawing.PointF]::new([float]$pointX,[float]$pointY)
    }
    $graphics.FillPolygon($brush, [System.Drawing.PointF[]]$points)
  }
  $bitmap.Save((Join-Path $iconRoot $target.Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

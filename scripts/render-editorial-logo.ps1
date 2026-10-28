$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot
$font = [System.Drawing.FontFamily]::new('Georgia')
$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddString('kronr', $font, [int][System.Drawing.FontStyle]::Bold, 100, [System.Drawing.PointF]::new(0,0), [System.Drawing.StringFormat]::GenericTypographic)
$bounds = $path.GetBounds()
$matrix = [System.Drawing.Drawing2D.Matrix]::new()
$matrix.Translate(5-$bounds.X,5-$bounds.Y)
$path.Transform($matrix)
function Number($n) { $n.ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) }
function SvgPath($shape) {
  $points=$shape.PathPoints; $types=$shape.PathTypes
  $d=[Text.StringBuilder]::new()
  for($i=0;$i -lt $points.Length;$i++){
    $kind=$types[$i] -band 7
    if($kind -eq 0){[void]$d.Append("M$(Number $points[$i].X) $(Number $points[$i].Y)")}
    elseif($kind -eq 1){[void]$d.Append("L$(Number $points[$i].X) $(Number $points[$i].Y)")}
    elseif($kind -eq 3){
      [void]$d.Append("C$(Number $points[$i].X) $(Number $points[$i].Y) $(Number $points[$i+1].X) $(Number $points[$i+1].Y) $(Number $points[$i+2].X) $(Number $points[$i+2].Y)")
      $i+=2
    }
    if(($types[$i] -band 128) -ne 0){[void]$d.Append('Z')}
  }
  return $d.ToString()
}
$outline=SvgPath $path
$height=$bounds.Height+10
$dotX=$bounds.Width+20
$dotY=$height-12
$width=$dotX+12
foreach($variant in @(@{Name='kronr-wordmark.svg';Color='#251a2e'},@{Name='kronr-wordmark-light.svg';Color='#f7f5ef'})){
  $svg="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 $(Number $width) $(Number $height)'><title>kronr.</title><path fill='$($variant.Color)' d='$outline'/><circle cx='$(Number $dotX)' cy='$(Number $dotY)' r='8' fill='#e3f291'/></svg>"
  [IO.File]::WriteAllText((Join-Path $root "images/$($variant.Name)"),$svg)
}
$glyph=[System.Drawing.Drawing2D.GraphicsPath]::new()
$glyph.AddString('k',$font,[int][System.Drawing.FontStyle]::Bold,48,[System.Drawing.PointF]::new(8,0),[System.Drawing.StringFormat]::GenericTypographic)
$gb=$glyph.GetBounds(); $move=[System.Drawing.Drawing2D.Matrix]::new();$move.Translate(12-$gb.X,12-$gb.Y);$glyph.Transform($move)
$glyphData=SvgPath $glyph
$mark="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#251a2e'/><path fill='#f7f5ef' d='$glyphData'/><circle cx='51' cy='47' r='4' fill='#e3f291'/></svg>"
[IO.File]::WriteAllText((Join-Path $root 'images/kronr-mark.svg'),$mark)
[IO.File]::WriteAllText((Join-Path $root 'favicon.svg'),$mark)
foreach($target in @(@{Name='icon-192.png';Size=192;Safe=1},@{Name='icon-512.png';Size=512;Safe=1},@{Name='icon-maskable-512.png';Size=512;Safe=.76},@{Name='apple-touch-icon.png';Size=180;Safe=1})){
  $bitmap=[System.Drawing.Bitmap]::new($target.Size,$target.Size)
  $g=[System.Drawing.Graphics]::FromImage($bitmap);$g.SmoothingMode='AntiAlias';$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#251a2e'))
  $g.ScaleTransform($target.Size/64.0,$target.Size/64.0)
  $g.TranslateTransform(32*(1-$target.Safe),32*(1-$target.Safe));$g.ScaleTransform($target.Safe,$target.Safe)
  $ink=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f7f5ef'))
  $accent=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#e3f291'))
  $g.FillPath($ink,$glyph);$g.FillEllipse($accent,47,43,8,8)
  $bitmap.Save((Join-Path $root "images/icons/$($target.Name)"),[System.Drawing.Imaging.ImageFormat]::Png)
  $ink.Dispose();$accent.Dispose();$g.Dispose();$bitmap.Dispose()
}
$path.Dispose();$glyph.Dispose();$font.Dispose();$matrix.Dispose();$move.Dispose()

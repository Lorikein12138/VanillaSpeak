param([string]$Source = (Join-Path $PSScriptRoot 'VanillaClub.png'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$web = Split-Path -Parent $PSScriptRoot
$public = Join-Path $web 'public/brand'
$res = Join-Path $web 'android/app/src/main/res'
New-Item -ItemType Directory -Path $public -Force | Out-Null
$image = [Drawing.Image]::FromFile($Source)
function Write-BrandImage([string]$File,[int]$Width,[int]$Height,[double]$Scale,[bool]$Paper = $false) {
    $bitmap = [Drawing.Bitmap]::new($Width,$Height,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.Clear($(if($Paper){[Drawing.Color]::FromArgb(248,245,237)}else{[Drawing.Color]::Transparent}))
        $side = [int][Math]::Round([Math]::Min($Width,$Height) * $Scale)
        $graphics.DrawImage($image,[Drawing.Rectangle]::new([int](($Width-$side)/2),[int](($Height-$side)/2),$side,$side))
        $bitmap.Save($File,[Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    Write-BrandImage (Join-Path $public 'vanillaspeak-64.png') 64 64 1
    Write-BrandImage (Join-Path $public 'vanillaspeak-128.png') 128 128 1
    Write-BrandImage (Join-Path $public 'favicon-32.png') 32 32 1
    Write-BrandImage (Join-Path $public 'apple-touch-icon.png') 180 180 .78 $true
    $sizes = @{mdpi=48;hdpi=72;xhdpi=96;xxhdpi=144;xxxhdpi=192}
    foreach($profile in $sizes.GetEnumerator()){
        $folder = Join-Path $res "mipmap-$($profile.Key)"
        $size = $profile.Value
        Write-BrandImage (Join-Path $folder 'ic_launcher.png') $size $size 1
        Write-BrandImage (Join-Path $folder 'ic_launcher_round.png') $size $size 1
        $adaptive = [int]($size * 2.25)
        Write-BrandImage (Join-Path $folder 'ic_launcher_foreground.png') $adaptive $adaptive .60
    }
    foreach($file in (Get-ChildItem -LiteralPath $res -Recurse -Filter 'splash.png')){
        $prior = [Drawing.Image]::FromFile($file.FullName)
        $width = $prior.Width
        $height = $prior.Height
        $prior.Dispose()
        Write-BrandImage $file.FullName $width $height .24 $true
    }
} finally { $image.Dispose() }

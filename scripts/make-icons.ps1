# Regenerates every PNG icon, favicon.ico and og.png from scripts/brand/*.html.
# Zero npm: headless Microsoft Edge renders the pages, System.Drawing (part of
# Windows) scales them down, and this script writes the .ico container itself.
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
#
# Windows PowerShell 5.1. Writes into public/; commit the results.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pub = Join-Path $root 'public'
$brand = Join-Path $PSScriptRoot 'brand'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('sm-icons-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
          "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found.' }

Add-Type -AssemblyName System.Drawing

function Shoot([string]$page, [string]$query, [int]$w, [int]$h, [string]$out) {
  $url = ([Uri](Join-Path $brand $page)).AbsoluteUri + $query
  # A throwaway profile, so this never touches the user's own Edge profile.
  $prof = Join-Path $tmp ('profile-' + [guid]::NewGuid().ToString('N'))
  $args = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
            '--force-device-scale-factor=1', "--user-data-dir=$prof",
            '--virtual-time-budget=6000', "--window-size=$w,$h", "--screenshot=$out", $url)
  $p = Start-Process -FilePath $edge -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
  if (-not (Test-Path $out)) { throw "Edge produced no screenshot for $page (exit $($p.ExitCode))" }
  $img = [Drawing.Image]::FromFile($out); $size = "$($img.Width)x$($img.Height)"; $img.Dispose()
  if ($size -ne "${w}x${h}") { throw "$page rendered at $size, expected ${w}x${h}" }
}

function Resize([string]$src, [int]$size, [string]$out) {
  $img = [Drawing.Image]::FromFile($src)
  $bmp = New-Object Drawing.Bitmap $size, $size, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($img, 0, 0, $size, $size)
  $g.Dispose(); $img.Dispose()
  $bmp.Save($out, [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}

# PNG-in-ICO (Windows Vista+, every current browser): a 6-byte header, a
# 16-byte entry per image, then the PNG files as they are.
function WriteIco([string[]]$pngs, [string]$out) {
  $datas = $pngs | ForEach-Object { , [IO.File]::ReadAllBytes($_) }
  $ms = New-Object IO.MemoryStream
  $bw = New-Object IO.BinaryWriter $ms
  $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$pngs.Count)
  $offset = 6 + 16 * $pngs.Count
  for ($i = 0; $i -lt $pngs.Count; $i++) {
    $img = [Drawing.Image]::FromFile($pngs[$i]); $w = $img.Width; $h = $img.Height; $img.Dispose()
    $bw.Write([byte]($(if ($w -ge 256) { 0 } else { $w })))
    $bw.Write([byte]($(if ($h -ge 256) { 0 } else { $h })))
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$datas[$i].Length); $bw.Write([UInt32]$offset)
    $offset += $datas[$i].Length
  }
  foreach ($d in $datas) { $bw.Write($d) }
  $bw.Flush(); [IO.File]::WriteAllBytes($out, $ms.ToArray()); $bw.Dispose()
}

try {
  $square = Join-Path $tmp 'square-512.png'
  $round = Join-Path $tmp 'round-512.png'
  Shoot 'icon.html' '' 512 512 $square
  Shoot 'icon.html' '?shape=round' 512 512 $round

  # App icons: full square (the platform rounds them).
  Copy-Item $square (Join-Path $pub 'icon-512.png') -Force
  Resize $square 192 (Join-Path $pub 'icon-192.png')
  Resize $square 180 (Join-Path $pub 'apple-touch-icon.png')

  # favicon.ico: the rounded square, at 16, 32 and 48.
  $ico = foreach ($s in 16, 32, 48) { $f = Join-Path $tmp "fav-$s.png"; Resize $round $s $f; $f }
  WriteIco $ico (Join-Path $pub 'favicon.ico')

  # Link preview.
  Shoot 'og.html' '' 1200 630 (Join-Path $pub 'og.png')

  Get-ChildItem $pub -Include 'icon-*.png', 'apple-touch-icon.png', 'favicon.ico', 'og.png' -Recurse |
    ForEach-Object { '{0,-22} {1,8:N0} bytes' -f $_.Name, $_.Length }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# Regenerates every app icon, the favicons and og.png from ONE source,
# scripts/brand/brand.html (commit 5, the "Scoreboard" identity). Zero npm:
# headless Microsoft Edge renders the page, System.Drawing (part of Windows)
# scales it, and this script writes the .ico and the .svg wrappers itself.
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
#
# Windows PowerShell 5.1. Writes into public/; then run node scripts/bump-sw.mjs
# (the icons are precached) and commit the results.
#
#   icon-192.png, icon-512.png          purpose "any": full-bleed navy square
#   icon-maskable-192.png, -512.png     purpose "maskable": monogram in the safe zone
#   apple-touch-icon.png (180)          full square; iOS rounds it
#   favicon.ico (16, 32, 48)            the rounded square
#   favicon.svg                         the rounded square at 128, as an embedded PNG
#                                       (an SVG favicon cannot load the web font)
#   og.png (1200x630)                   the link preview

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pub = Join-Path $root 'public'
$src = Join-Path $PSScriptRoot 'brand\brand.html'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('sm-icons-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
          "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found.' }

Add-Type -AssemblyName System.Drawing

function EdgeArgs([int]$w, [int]$h) {
  # A throwaway profile, so this never touches the user's own Edge profile.
  # --allow-file-access-from-files: the page loads the fonts from public/vendor.
  $prof = Join-Path $tmp ('profile-' + [guid]::NewGuid().ToString('N'))
  return @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
           '--allow-file-access-from-files', '--default-background-color=00000000',
           '--force-device-scale-factor=1', "--user-data-dir=$prof",
           '--virtual-time-budget=8000', "--window-size=$w,$h")
}
function Url([string]$view) { return ([Uri]$src).AbsoluteUri + '?view=' + $view }

# The fonts must be in before any screenshot, or a fallback face is drawn.
function AssertFonts {
  $out = Join-Path $tmp 'dom.html'
  $args = (EdgeArgs 512 512) + @('--dump-dom', (Url 'og'))
  Start-Process -FilePath $edge -ArgumentList $args -Wait -WindowStyle Hidden -RedirectStandardOutput $out | Out-Null
  $dom = Get-Content $out -Raw
  if ($dom -notmatch '<title>fonts-ready</title>') { throw 'brand.html: Barlow Condensed / DM Sans did not load (title: ' + ([regex]::Match($dom, '<title>[^<]*</title>').Value) + ')' }
}

function Shoot([string]$view, [int]$w, [int]$h, [string]$out) {
  $args = (EdgeArgs $w $h) + @("--screenshot=$out", (Url $view))
  $p = Start-Process -FilePath $edge -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
  if (-not (Test-Path $out)) { throw "Edge produced no screenshot for $view (exit $($p.ExitCode))" }
  $img = [Drawing.Image]::FromFile($out); $size = "$($img.Width)x$($img.Height)"; $img.Dispose()
  if ($size -ne "${w}x${h}") { throw "$view rendered at $size, expected ${w}x${h}" }
}

function Resize([string]$from, [int]$size, [string]$out, [switch]$Opaque) {
  $img = [Drawing.Image]::FromFile($from)
  # -Opaque: no alpha channel at all (app icons; iOS paints transparency black).
  $fmt = $(if ($Opaque) { [Drawing.Imaging.PixelFormat]::Format24bppRgb } else { [Drawing.Imaging.PixelFormat]::Format32bppArgb })
  $bmp = New-Object Drawing.Bitmap $size, $size, $fmt
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($img, 0, 0, $size, $size)
  $g.Dispose(); $img.Dispose()
  $bmp.Save($out, [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}

# An icon with no transparency at all: iOS fills transparent pixels with black.
function Opaque([string]$from, [string]$out) {
  $img = [Drawing.Image]::FromFile($from)
  $bmp = New-Object Drawing.Bitmap $img.Width, $img.Height, ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.Clear([Drawing.ColorTranslator]::FromHtml('#12304F'))
  $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
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
  AssertFonts

  $icon = Join-Path $tmp 'icon-raw.png';      Shoot 'icon' 512 512 $icon
  $mask = Join-Path $tmp 'maskable-raw.png';  Shoot 'maskable' 512 512 $mask
  $round = Join-Path $tmp 'round-512.png';    Shoot 'round' 512 512 $round

  # App icons, opaque navy to every edge.
  $icon512 = Join-Path $pub 'icon-512.png'; Opaque $icon $icon512
  Resize $icon512 192 (Join-Path $pub 'icon-192.png') -Opaque
  Resize $icon512 180 (Join-Path $pub 'apple-touch-icon.png') -Opaque
  $mask512 = Join-Path $pub 'icon-maskable-512.png'; Opaque $mask $mask512
  Resize $mask512 192 (Join-Path $pub 'icon-maskable-192.png') -Opaque

  # favicon.ico: the rounded square (transparent corners) at 16, 32 and 48.
  $ico = foreach ($s in 16, 32, 48) { $f = Join-Path $tmp "fav-$s.png"; Resize $round $s $f; $f }
  WriteIco $ico (Join-Path $pub 'favicon.ico')

  # favicon.svg: the same rounded square at 128, embedded, so the browser tab
  # shows the real number face (an SVG favicon cannot load a web font).
  $f128 = Join-Path $tmp 'fav-128.png'; Resize $round 128 $f128
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f128))
  $svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">' + "`n" +
         '  <!-- Generated by scripts/make-icons.ps1 from scripts/brand/brand.html (?view=round). Do not edit by hand. -->' + "`n" +
         '  <image width="64" height="64" href="data:image/png;base64,' + $b64 + '" xlink:href="data:image/png;base64,' + $b64 + '"/>' + "`n" +
         '</svg>' + "`n"
  [IO.File]::WriteAllText((Join-Path $pub 'favicon.svg'), $svg, (New-Object Text.UTF8Encoding($false)))

  # Link preview, opaque (WhatsApp and others draw transparency as black).
  $og = Join-Path $tmp 'og-raw.png'; Shoot 'og' 1200 630 $og
  Opaque $og (Join-Path $pub 'og.png')

  Get-ChildItem $pub -Include 'icon-*.png', 'apple-touch-icon.png', 'favicon.ico', 'favicon.svg', 'og.png' -Recurse |
    ForEach-Object { '{0,-24} {1,8:N0} bytes' -f $_.Name, $_.Length }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

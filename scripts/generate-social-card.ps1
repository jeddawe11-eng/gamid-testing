# Regenerates dist/assets/social-card-1200x630.png: the ONE generic, non-personalized Open Graph / Twitter card image used by the Phase 1 /@handle
# Worker as the static baseline for every public identity (Phase 2 will add a per-profile dynamic image; this is deliberately generic and brand-only).
# Deterministic; requires a local ffmpeg. Re-run and commit the PNG whenever the design should change.
$ErrorActionPreference = "Stop"
$ff = "C:\Users\user\scoop\shims\ffmpeg.exe"
$out = Join-Path (Split-Path $PSScriptRoot -Parent) "dist\assets\social-card-1200x630.png"
$font = "C\:/Windows/Fonts/arialbd.ttf"
$fontReg = "C\:/Windows/Fonts/arial.ttf"
$vf = @(
  "drawtext=fontfile='$font':text='GAM':fontcolor=white:fontsize=132:x=(w/2)-268:y=(h/2)-150",
  "drawtext=fontfile='$font':text='ID':fontcolor=0x62e7ff:fontsize=132:x=(w/2)+46:y=(h/2)-150",
  "drawtext=fontfile='$fontReg':text='Your gaming identity. One GamID.':fontcolor=0xaaa4b7:fontsize=34:x=(w-text_w)/2:y=(h/2)+30",
  "drawtext=fontfile='$fontReg':text='TESTING':fontcolor=0x62e7ff:fontsize=22:x=(w-text_w)/2:y=(h/2)+96:box=1:boxcolor=0x1a1030:boxborderw=10"
) -join ","
& $ff -hide_banner -loglevel error -y -f lavfi -i "color=c=0x0b0912:s=1200x630" -vf $vf -frames:v 1 $out
if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed" }
"generated $out ({0:N0} bytes)" -f (Get-Item $out).Length

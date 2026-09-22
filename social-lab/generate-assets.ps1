# Phase 0b social-preview LAB: generates the synthetic test media into social-lab/assets/ (git-ignored; deterministic; nothing here comes from the real Intro pipeline).
# Every clip is a moving test pattern with a burned-in running clock, so a human can tell "video actually played" from "only the poster / first frame was shown".
$ErrorActionPreference = "Stop"
$ff = "C:\Users\user\scoop\shims\ffmpeg.exe"
$out = Join-Path $PSScriptRoot "assets"
New-Item -ItemType Directory -Force $out | Out-Null
$font = "C\:/Windows/Fonts/arialbd.ttf"
function Run([string[]]$a) { & $ff -hide_banner -loglevel error -y @a; if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed: $($a -join ' ')" } }

# ---- still images (PNG). Text says exactly which asset a platform rendered.
function Card($name, $w, $h, $line1, $line2, $bg) {
  $vf = "drawtext=fontfile='$font':text='$line1':fontcolor=white:fontsize=$([int]($h/7)):x=(w-text_w)/2:y=h*0.30,drawtext=fontfile='$font':text='$line2':fontcolor=0x62e7ff:fontsize=$([int]($h/12)):x=(w-text_w)/2:y=h*0.55"
  Run @("-f", "lavfi", "-i", "color=c=${bg}:s=${w}x${h}", "-vf", $vf, "-frames:v", "1", (Join-Path $out $name))
}
Card "card-1200x630.png" 1200 630 "GAMID LAB  S1" "static OG image 1200x630" "0x1a1030"
Card "card-600x600.png" 600 600 "GAMID LAB  S2" "square image 600x600" "0x10301a"
Card "poster-1280x720.png" 1280 720 "POSTER ONLY" "if you see this the video did not play" "0x301010"

# ---- video: same moving content encoded three ways. Clock text proves playback.
$src = "testsrc2=size=1280x720:rate=30:duration=6,drawtext=fontfile='$font':text='PLAYING t=%{pts\:hms}':fontcolor=white:fontsize=64:box=1:boxcolor=black@0.6:x=(w-text_w)/2:y=h*0.45"
$aud = "sine=frequency=440:sample_rate=44100:duration=6"
Run @("-f", "lavfi", "-i", $src, "-f", "lavfi", "-i", $aud, "-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p", "-crf", "28", "-preset", "medium", "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", "-shortest", (Join-Path $out "lab-h264-720p.mp4"))
Run @("-f", "lavfi", "-i", $src, "-f", "lavfi", "-i", $aud, "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-crf", "36", "-b:v", "0", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-c:a", "libopus", "-b:a", "48k", "-shortest", (Join-Path $out "lab-vp9-720p.webm"))

# ---- size probe: MP4/H.264 around 9-10 MB (above the ~8 MB figure quoted for Discord's own embeds)
$srcBig = "testsrc2=size=1280x720:rate=30:duration=12,noise=alls=45:allf=t+u,drawtext=fontfile='$font':text='BIG PLAYING t=%{pts\:hms}':fontcolor=white:fontsize=64:box=1:boxcolor=black@0.6:x=(w-text_w)/2:y=h*0.45"
Run @("-f", "lavfi", "-i", $srcBig, "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=12", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-b:v", "6200k", "-maxrate", "6200k", "-bufsize", "12400k", "-preset", "medium", "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", "-shortest", (Join-Path $out "lab-h264-big.mp4"))

# ---- D3-shaped synthetic clip: 3840x2160, 30 fps, VP9 yuv420p + Opus, ~11 s, ~14 MB (same SHAPE as the accepted Intro derivative, but a made-up test pattern)
$src4k = "testsrc2=size=3840x2160:rate=30:duration=11,noise=alls=12:allf=t,drawtext=fontfile='$font':text='4K WEBM PLAYING t=%{pts\:hms}':fontcolor=white:fontsize=200:box=1:boxcolor=black@0.6:x=(w-text_w)/2:y=h*0.45"
Run @("-f", "lavfi", "-i", $src4k, "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=11", "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "9000k", "-maxrate", "9800k", "-bufsize", "19600k", "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-c:a", "libopus", "-b:a", "32k", "-shortest", (Join-Path $out "lab-d3like-4k.webm"))

Get-ChildItem $out | ForEach-Object { "{0,-24} {1,10:N0} bytes" -f $_.Name, $_.Length }

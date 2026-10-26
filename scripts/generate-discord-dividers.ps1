# Regenerates the Discord share card's divider images (cf-worker/discord-card.mjs, docs/DISCORD-SHARE-CARD.md). Discord's native Separator is always grey
# (it has no colour field), so the card draws its dividers as one-item Media Galleries showing a thin image in the card's accent colour:
#   dist/assets/discord-divider-purple.png    B1: a solid #B14CFF line
#   dist/assets/discord-divider-gradient.gif  B2: the same line with a soft pink (#FF5FD2) glow sweeping slowly across it, looping every 3 s
# 1200 x 8 px: about 3 px tall at Discord's desktop card width and about 2 px on a phone (Discord scales gallery images to the card's width).
# Deterministic; requires a local ffmpeg. Re-run and commit the images whenever the design should change.
$ErrorActionPreference = "Stop"
$ff = "C:\Users\user\scoop\shims\ffmpeg.exe"
$assets = Join-Path (Split-Path $PSScriptRoot -Parent) "dist\assets"
& $ff -v error -y -f lavfi -i "color=c=0xb14cff:s=1200x8:d=1" -frames:v 1 (Join-Path $assets "discord-divider-purple.png")
if ($LASTEXITCODE) { throw "ffmpeg failed (png)" }
# glow k = ((1 + cos(2 pi (X/W - T/3))) / 2)^3: one soft highlight per loop; T runs 0..3 s, so the last frame meets the first seamlessly
$k = "pow((1+cos(2*PI*(X/W-T/3)))/2,3)"
$geq = "geq=r='177+78*$k':g='76+19*$k':b='255-45*$k'"
& $ff -v error -y -f lavfi -i "color=c=black:s=1200x8:d=3:r=20,format=rgb24,$geq,split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none" -loop 0 (Join-Path $assets "discord-divider-gradient.gif")
if ($LASTEXITCODE) { throw "ffmpeg failed (gif)" }
Get-ChildItem (Join-Path $assets "discord-divider-*") | ForEach-Object { "{0}  {1} bytes" -f $_.Name, $_.Length }

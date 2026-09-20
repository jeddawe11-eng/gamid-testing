# Loads the SQL batch files written by wikidata-export.mjs into the LINKED database through the catalog importer (private.import_game_catalog_batch).
#
#   powershell -File scripts/catalog/load-catalog.ps1 -Dir <export dir> [-Cli <path to supabase>]
#
# TESTING ONLY. The script refuses to run unless the linked project is the GamID TESTING project, so a mis-linked CLI can never push a catalog anywhere else.
# Each file is one importer call; the importer is idempotent and only ever adds, so the whole load can be repeated safely (a repeat merges into the same games).
param(
  [Parameter(Mandatory = $true)][string]$Dir,
  [string]$Cli = "supabase"
)
$ErrorActionPreference = "Stop"
$testingRef = "upvtrczefcvigxdyuylw"
$refFile = Join-Path (Get-Location) "supabase\.temp\project-ref"
if (-not (Test-Path $refFile)) { throw "No linked Supabase project (supabase\.temp\project-ref is missing). Link the TESTING project first." }
$linked = (Get-Content $refFile -Raw).Trim()
if ($linked -ne $testingRef) { throw "Refusing to load: the linked project is not the GamID TESTING project." }

$files = Get-ChildItem (Join-Path $Dir "chunks") -Filter "chunk-*.sql" | Sort-Object Name
if (-not $files) { throw "No chunk files found under $Dir\chunks" }
$created = 0; $merged = 0; $skipped = 0
foreach ($file in $files) {
  # the CLI writes progress to stderr; that must not be treated as a failure (the answer itself is checked below)
  $ErrorActionPreference = "Continue"
  $raw = & $Cli db query --linked -f $file.FullName 2>&1 | Out-String
  $ErrorActionPreference = "Stop"
  if ($raw -notmatch '"created\\?"\s*:\s*\d+') { throw "Unexpected answer for $($file.Name): $($raw.Substring(0, [Math]::Min(400, $raw.Length)))" }
  $c = ([regex]::Match($raw, '"created\\?"\s*:\s*(\d+)')).Groups[1].Value
  $m = ([regex]::Match($raw, '"merged\\?"\s*:\s*(\d+)')).Groups[1].Value
  $s = ([regex]::Match($raw, '"skipped\\?"\s*:\s*(\d+)')).Groups[1].Value
  $created += [int]$c; $merged += [int]$m; $skipped += [int]$s
  Write-Host ("{0}: created {1}, merged {2}, skipped {3}" -f $file.Name, $c, $m, $s)
}
Write-Host ("TOTAL created {0}, merged {1}, skipped {2}" -f $created, $merged, $skipped)

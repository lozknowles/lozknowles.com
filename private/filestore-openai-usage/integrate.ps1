param(
  [Parameter(Mandatory=$true)][string]$FileStoreRoot,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$package = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = (Resolve-Path -LiteralPath $FileStoreRoot).Path
$patch = Join-Path $package 'integration.patch'
$overlay = Join-Path $package 'overlay'
if (-not (Test-Path -LiteralPath (Join-Path $target 'app/main.py') -PathType Leaf)) {
  throw 'Target is not a File Store checkout'
}
$files = @(
  'app/openai_usage.py',
  'app/codex_usage.py',
  'app/static/openai-usage.css',
  'app/static/openai-usage.js',
  'app/templates/openai-usage.html',
  'docs/openai-usage.md',
  'tests/test_openai_usage.py'
)
foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $overlay $file) -PathType Leaf)) {
    throw "Package file missing: $file"
  }
  if (Test-Path -LiteralPath (Join-Path $target $file)) {
    throw "Target already has $file; review it before integration"
  }
}
Push-Location $target
try {
  git apply --check -- $patch
  if ($LASTEXITCODE -ne 0) { throw 'Patch does not match this File Store source revision' }
  if (-not $Apply) { Write-Output 'Integration preflight passed. Re-run with -Apply in an isolated checkout.'; return }
  git apply -- $patch
  if ($LASTEXITCODE -ne 0) { throw 'Patch application failed' }
  foreach ($file in $files) {
    $destination = Join-Path $target $file
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $overlay $file) -Destination $destination
  }
  Write-Output 'Integrated into File Store checkout. Run its tests before deployment.'
} finally {
  Pop-Location
}

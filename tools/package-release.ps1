$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$releaseRoot = Split-Path -Parent $PSScriptRoot
$releaseManifest = Get-Content -LiteralPath (Join-Path $releaseRoot 'module.json') -Raw | ConvertFrom-Json
$releaseDirectory = Join-Path $releaseRoot 'artifacts/releases'
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$releaseName = "build-n-action-v$($releaseManifest.version).zip"
if (-not $releaseManifest.download.EndsWith("/v$($releaseManifest.version)/$releaseName")) { throw 'Manifest download URL does not match release archive.' }
$releaseZip = Join-Path $releaseDirectory $releaseName
$releaseInputs = @('module.json','module.mjs','module.css','README.md') | ForEach-Object { Get-Item -LiteralPath (Join-Path $releaseRoot $_) }
foreach ($releaseFolder in @('templates','lang','assets')) { $releaseInputs += Get-ChildItem -LiteralPath (Join-Path $releaseRoot $releaseFolder) -Recurse -File }
$releaseStream = [IO.File]::Open($releaseZip,[IO.FileMode]::Create)
$releaseArchive = [IO.Compression.ZipArchive]::new($releaseStream,[IO.Compression.ZipArchiveMode]::Create)
try {
 foreach ($releaseInput in $releaseInputs) {
  $releaseEntryName = $releaseInput.FullName.Substring($releaseRoot.Length + 1).Replace('\','/')
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($releaseArchive,$releaseInput.FullName,$releaseEntryName,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
 }
} finally { $releaseArchive.Dispose(); $releaseStream.Dispose() }
$releaseCheck = [IO.Compression.ZipFile]::OpenRead($releaseZip)
try {
 foreach ($releaseRequired in @('module.json','module.mjs','module.css','lang/en.json','lang/ru.json','templates/condition-blueprint.hbs','assets/vfx/fire-bed-v1.png')) {
  if (-not $releaseCheck.GetEntry($releaseRequired)) { throw "Missing archive entry: $releaseRequired" }
 }
 foreach ($releaseEntry in $releaseCheck.Entries) {
  $releaseSource = Join-Path $releaseRoot $releaseEntry.FullName
  $releaseEntryStream = $releaseEntry.Open()
  $releaseHasher = [Security.Cryptography.SHA256]::Create()
  try { $releaseEntryHash = [BitConverter]::ToString($releaseHasher.ComputeHash($releaseEntryStream)).Replace('-','') }
  finally { $releaseEntryStream.Dispose(); $releaseHasher.Dispose() }
  if ($releaseEntryHash -ne (Get-FileHash -LiteralPath $releaseSource -Algorithm SHA256).Hash) { throw "Archive content mismatch: $($releaseEntry.FullName)" }
 }
 Write-Output "Verified $($releaseCheck.Entries.Count) archive entries against source files."
} finally { $releaseCheck.Dispose() }
Copy-Item -LiteralPath (Join-Path $releaseRoot 'module.json') -Destination (Join-Path $releaseDirectory 'module.json')
$releaseHash = (Get-FileHash -LiteralPath $releaseZip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $releaseDirectory "$releaseName.sha256"),"$releaseHash  $releaseName`n")
Write-Output $releaseZip

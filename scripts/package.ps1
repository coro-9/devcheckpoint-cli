$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$spec = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$zip = [IO.Compression.ZipFile]::Open($spec.zip, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($entry in $spec.entries) {
    $source = Join-Path $spec.root $entry.path
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $source, ($spec.prefix + '/' + $entry.path), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose() }
$zip = [IO.Compression.ZipFile]::OpenRead($spec.zip)
try {
  if ($zip.Entries.Count -ne $spec.entries.Count) { throw 'ZIP entry count mismatch' }
  foreach ($expected in $spec.entries) {
    $entry = $zip.GetEntry($spec.prefix + '/' + $expected.path)
    if ($null -eq $entry -or $entry.Length -ne $expected.bytes) { throw 'ZIP path or size mismatch' }
    $stream = $entry.Open()
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $actual = ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hash.Dispose() }
    if ($actual -ne $expected.sha256) { throw 'ZIP hash mismatch' }
  }
  @{ entries = $zip.Entries.Count; verified = $true } | ConvertTo-Json -Compress
} finally { $zip.Dispose() }

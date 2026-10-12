$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
# Windows PowerShell 5 can silently return no directory streams through
# Get-Item -Stream. Use the documented Win32 enumerator for files AND directories.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class CheckpointStreams {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct StreamData { public long Size; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=296)] public string Name; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr FindFirstStreamW(string path, int level, out StreamData data, uint flags);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)] static extern bool FindNextStreamW(IntPtr handle, out StreamData data);
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)] static extern bool FindClose(IntPtr handle);
  public static string[] Names(string path) {
    var names = new List<string>(); StreamData data;
    var handle = FindFirstStreamW(path, 0, out data, 0);
    if (handle == new IntPtr(-1)) { int error = Marshal.GetLastWin32Error(); if(error == 38) return names.ToArray(); throw new Win32Exception(error); }
    try {
      names.Add(data.Name);
      while(FindNextStreamW(handle, out data)) names.Add(data.Name);
      int error = Marshal.GetLastWin32Error(); if(error != 38) throw new Win32Exception(error);
    } finally { FindClose(handle); }
    return names.ToArray();
  }
}
'@
$items = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
$checked = 0
$unsupported = 0
foreach ($entry in $items) {
  $item = Get-Item -LiteralPath $entry.path -Force
  if (($item.Attributes -band [IO.FileAttributes]::Encrypted) -ne 0) { $unsupported++ }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -and $entry.kind -ne 'link') { $unsupported++ }
  if ($entry.kind -ne 'link') {
    $streams = [CheckpointStreams]::Names($entry.path)
    foreach ($stream in $streams) { if ($stream -ne '::$DATA') { $unsupported++ } }
  }
  $checked++
}
@{ checked = $checked; unsupported = $unsupported } | ConvertTo-Json -Compress

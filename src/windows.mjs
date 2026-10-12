import { fileURLToPath } from 'node:url';
import { run, succeeded } from './process.mjs';
import { CheckpointError } from './common.mjs';

// Native metadata not exposed by Node: reject streams and non-symlink reparse points.
export function checkWindowsEntries(entries) {
  if (process.platform !== 'win32' || entries.length === 0) return;
  const r = succeeded(run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./windows-check.ps1', import.meta.url))], { input: JSON.stringify(entries), timeout: 120000 }));
  let report;
  try { report = JSON.parse(r.stdout.replace(/^\uFEFF/, '')); } catch { throw new CheckpointError('UNSUPPORTED', 'Windows metadata inspection was incomplete'); }
  if (report.checked !== entries.length || report.unsupported !== 0) throw new CheckpointError('UNSUPPORTED', 'Alternate streams, encrypted files, or unsupported reparse metadata detected');
}

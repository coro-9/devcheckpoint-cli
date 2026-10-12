import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CheckpointError, atomic, json, ns } from './common.mjs';

export function run(executable, args, { cwd, input, env, log, timeout = 120000 } = {}) {
  const result = spawnSync(executable, args, { cwd, input, env, windowsHide: true, shell: false,
    maxBuffer: 16 * 1024 * 1024, timeout, encoding: 'utf8' });
  const record = { executable, args, exitCode: result.status, signal: result.signal,
    errorCode: result.error?.code ?? null, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  if (log) { atomic(log + '.stdout', record.stdout); atomic(log + '.stderr', record.stderr);
    atomic(log + '.json', json({ ...record, stdout: undefined, stderr: undefined })); }
  return record;
}
export function succeeded(r, code = 'COMMAND') {
  if (r.errorCode || r.signal || r.exitCode !== 0) throw new CheckpointError(code, 'Process failed; inspect the private command evidence', { exitCode: r.exitCode, signal: r.signal, errorCode: r.errorCode });
  return r;
}
export const gitFlags = ['--no-optional-locks', '-c', 'core.longpaths=true', '-c', 'core.autocrlf=false', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false'];
export function gitEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^GIT_/i.test(k)) delete env[k];
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
}
export function git(repo, args, options = {}) { return succeeded(run('git', [...gitFlags, '-C', repo, ...args], { ...options, env: gitEnv() }), 'GIT'); }
export function strictGit(repo, args) {
  const r = git(repo, args);
  if (r.stderr) throw new CheckpointError('GIT', 'Git enumeration emitted diagnostics; inspect repository configuration');
  return r.stdout;
}
export function privateDirectory(dir) {
  fs.mkdirSync(ns(dir), { mode: 0o700 });
  if (process.platform === 'win32') {
    const sid = succeeded(run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'])).stdout.trim();
    if (!/^S-1-[\d-]+$/.test(sid)) throw new CheckpointError('UNSUPPORTED', 'Cannot establish private recovery ACL');
    succeeded(run('icacls.exe', [path.resolve(dir), '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`]));
  }
}

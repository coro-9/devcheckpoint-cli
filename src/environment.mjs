import fs from 'node:fs';
import path from 'node:path';
import { CheckpointError, ns } from './common.mjs';
import { run } from './process.mjs';
import { repository } from './repository.mjs';

export const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export function requireNode(nodeVersion = process.versions.node) {
  if (!/^\d+\./.test(nodeVersion) || Number(nodeVersion.split('.')[0]) < 24)
    throw new CheckpointError('UNSUPPORTED', 'Node.js 24 or newer is required; select a supported Node runtime before transactional work');
}
export function checkRepositoryPath(repo) {
  let stat;
  try { stat = fs.lstatSync(ns(repo)); } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') throw new CheckpointError('USAGE', 'Repository path does not exist; specify an existing repository root with --repo');
    throw e;
  }
  if (!stat.isDirectory()) throw new CheckpointError('UNSUPPORTED', 'Repository path must be an ordinary directory; specify a supported self-contained repository root');
  try { fs.lstatSync(ns(path.join(repo, '.git'))); } catch (e) {
    if (e.code === 'ENOENT') throw new CheckpointError('UNSUPPORTED', 'No .git entry at the supplied root; specify the root of an existing self-contained Git repository');
    throw e;
  }
}
export function doctor(options = {}) {
  const checks = [];
  try { requireNode(); checks.push({ name: 'node', status: 'PASS', version: process.versions.node }); }
  catch (e) { checks.push({ name: 'node', status: 'FAIL', version: process.versions.node, message: e.message }); }
  const probes = [{ name: 'git', executable: 'git', args: ['--version'], version: true }];
  if (process.platform === 'win32') probes.push(
    { name: 'powershell', executable: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], version: true },
    { name: 'icacls', executable: 'icacls.exe', args: ['/?'] });
  for (const p of probes) {
    const r = run(p.executable, p.args, { timeout: 10000 });
    const okay = r.exitCode === 0 && !r.errorCode && !r.signal;
    // Only version-only output is returned. Help and private diagnostics are not printed.
    checks.push({ name: p.name, status: okay ? 'PASS' : 'FAIL', ...(okay && p.version ? { version: r.stdout.trim().slice(0, 120) } : {}),
      ...(!okay ? { message: `Cannot run ${p.executable}; make the prerequisite available on PATH, then rerun doctor` } : {}) });
  }
  if (options.repo !== undefined) {
    try { checkRepositoryPath(options.repo); repository(options.repo); checks.push({ name: 'repository', status: 'PASS', scope: 'basic supported Git layout' }); }
    catch (e) { checks.push({ name: 'repository', status: 'FAIL', code: e.code ?? 'ERROR', message: e instanceof CheckpointError ? e.message : 'Repository inspection failed; check the supplied root and access permissions' }); }
  }
  return { status: checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL', command: 'doctor', version, platform: process.platform,
    qualification: 'Windows is the qualified baseline; no cross-platform qualification is implied', checks,
    deferred: ['Complete file-content hashing, filesystem/link inventory, disk-space estimates and patch checks are deferred to plan/rehearse.', 'Doctor does not run validators or prove that a transaction is safe.'] };
}

export function safeError(e) {
  if (e instanceof CheckpointError) return { status: 'FAIL', code: e.code, message: e.message, details: e.details, nextStep: ({
    USAGE: 'Check --help and the supplied paths/configuration; retry only after correcting the input.',
    APPROVAL: 'Review the requested commands or changes and provide the separate explicit approval only if authorized.',
    UNSUPPORTED: 'Run doctor; use the documented supported environment and repository layout.',
    GIT: 'Check Git availability and private diagnostics; do not force patch application or discard local work.',
    COMMAND: 'Run doctor and inspect private command evidence; do not assume a failed or timed-out process has stopped its descendants.',
    VALIDATION: 'Inspect the private validation evidence; resolve the failure before attempting adoption.',
    SPACE: 'Provide sufficient free space on the indicated volume; preserve all recovery snapshots and evidence.',
    DRIFT: 'Stop writers and reconcile changes against the saved evidence; do not force restoration.',
    INTEGRITY: 'Preserve the checkpoint and diagnostics; investigate the mismatch before further writes.',
    RECOVERY_REQUIRED: 'Stop repository writers and reconcile the recorded recovery state before retrying.',
    LOCKED: 'Stop the owning operation first; use stale-lock recovery only after its PID is confirmed absent.'
  })[e.code] ?? 'Inspect the private evidence before retrying.' };
  const message = e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 'A required path or file is missing; check --repo, --patch, --config and --backup-dir, and run doctor for prerequisites'
    : e.code === 'EACCES' || e.code === 'EPERM' ? 'Required filesystem access was denied; check permissions without changing or deleting recovery evidence'
    : e instanceof SyntaxError ? 'Malformed JSON metadata or configuration; preserve the file and correct only the intended configuration input'
    : 'Operation failed; no PASS claimed. Preserve evidence and inspect the supplied inputs before retrying';
  return { status: 'FAIL', code: e.code ?? 'ERROR', message, details: {} };
}

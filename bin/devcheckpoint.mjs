#!/usr/bin/env node
import path from 'node:path';
import { plan, createBackup, rehearse, apply, restore } from '../src/engine.mjs';
import { CheckpointError } from '../src/common.mjs';
import { version, doctor, requireNode, checkRepositoryPath, safeError } from '../src/environment.mjs';
import { inspectStatus } from '../src/status.mjs';

const help = `DevCheckpoint ${version} — local Git snapshots and rehearsed patch adoption

Commands: plan (default), backup, rehearse, apply, restore, doctor, status
  --repo PATH             Self-contained Git repository root (default: cwd)
  --patch FILE            Ordered patch; repeat for a series (plan/rehearse)
  --config FILE           JSON validation commands (plan/rehearse)
  --backup-dir PATH       New external snapshot (backup); existing for later commands
  --approve-commands      Explicit approval to execute the displayed command argv
  --confirm               Explicit authorization for apply/restore owner writes
  --recover-lock          Remove a stale cooperative lock only if its PID is absent
  --verify                Full backup rehash (status only); --repo also checks live drift
  --help                  Show this help
  --version               Show the package version

doctor [--repo PATH] is a read-only prerequisite/layout check, without content hashing.
status --backup-dir PATH reads recorded metadata only. It makes no restore-safety claim.
status --backup-dir PATH --verify [--repo PATH] explicitly requests deeper checks.

Run plan first. Rehearsal is not a security sandbox. Stop all other repository
writers. Commands may use the network; review them before approval. No command
performs git reset, git clean, commits, installs, publishing, or provider calls.
`;
const exits = { USAGE: 2, APPROVAL: 3, UNSUPPORTED: 4, DRIFT: 5, INTEGRITY: 5, GIT: 6, COMMAND: 6, VALIDATION: 7, RECOVERY_REQUIRED: 8, LOCKED: 9, SPACE: 10 };
try {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) { console.log(help); process.exit(0); }
  if (argv.length === 1 && argv[0] === '--version') { console.log(version); process.exit(0); }
  const command = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'plan';
  if (!['plan', 'backup', 'rehearse', 'apply', 'restore', 'doctor', 'status'].includes(command)) throw new CheckpointError('USAGE', 'Unknown command; use --help');
  const options = { patches: [], progress: message => console.error('[devcheckpoint] ' + message) }, seen = new Set();
  const values = { '--repo': 'repo', '--patch': 'patches', '--config': 'config', '--backup-dir': 'backupDir' };
  const booleans = { '--confirm': 'confirm', '--approve-commands': 'approveCommands', '--recover-lock': 'recoverLock', '--verify': 'verify' };
  const allowed = {
    plan: ['--repo', '--patch', '--config'], backup: ['--repo', '--backup-dir', '--recover-lock'],
    rehearse: ['--repo', '--backup-dir', '--patch', '--config', '--approve-commands', '--recover-lock'],
    apply: ['--repo', '--backup-dir', '--approve-commands', '--confirm', '--recover-lock'],
    restore: ['--repo', '--backup-dir', '--confirm', '--recover-lock'],
    doctor: ['--repo'], status: ['--backup-dir', '--verify', '--repo']
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!allowed[command].includes(flag)) throw new CheckpointError('USAGE', 'Option is not valid for this command; use --help');
    if (seen.has(flag) && flag !== '--patch') throw new CheckpointError('USAGE', 'Duplicate option'); seen.add(flag);
    if (booleans[flag]) options[booleans[flag]] = true;
    else if (values[flag] && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      const value = path.resolve(argv[++i]); if (flag === '--patch') options.patches.push(value); else options[values[flag]] = value;
    } else throw new CheckpointError('USAGE', 'Unknown option or missing value; use --help');
  }
  if (!['plan', 'doctor'].includes(command) && !options.backupDir) throw new CheckpointError('USAGE', '--backup-dir is required');
  if (command === 'status' && options.repo !== undefined && !options.verify) throw new CheckpointError('USAGE', 'status --repo requires --verify; omit --repo for recorded metadata only');
  if (['apply', 'restore', 'backup'].includes(command) && (options.patches.length || options.config)) throw new CheckpointError('USAGE', 'Patches/config belong to plan/rehearse; adoption uses the sealed receipt');
  if (!['doctor', 'status'].includes(command)) { requireNode(); options.repo ??= process.cwd(); checkRepositoryPath(options.repo); }
  const result = { plan, backup: createBackup, rehearse, apply, restore, doctor, status: inspectStatus }[command](options);
  console.log(JSON.stringify(result, null, 2));
  if (command === 'doctor' && result.status === 'FAIL') process.exitCode = exits.UNSUPPORTED;
} catch (e) {
  console.error(JSON.stringify(safeError(e), null, 2));
  process.exitCode = exits[e.code] ?? 1;
}

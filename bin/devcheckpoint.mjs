#!/usr/bin/env node
import path from 'node:path';
import { plan, createBackup, rehearse, apply, restore } from '../src/engine.mjs';
import { CheckpointError } from '../src/common.mjs';

const help = `DevCheckpoint 0.1.0 — local Git snapshots and rehearsed patch adoption

Commands: plan (default), backup, rehearse, apply, restore
  --repo PATH             Self-contained Git repository root (default: cwd)
  --patch FILE            Ordered patch; repeat for a series (plan/rehearse)
  --config FILE           JSON validation commands (plan/rehearse)
  --backup-dir PATH       New external snapshot (backup); existing for later commands
  --approve-commands      Explicit approval to execute the displayed command argv
  --confirm               Explicit authorization for apply/restore owner writes
  --recover-lock          Remove a stale cooperative lock only if its PID is absent
  --help                  Show this help

Run plan first. Rehearsal is not a security sandbox. Stop all other repository
writers. Commands may use the network; review them before approval. No command
performs git reset, git clean, commits, installs, publishing, or provider calls.
`;
const exits = { USAGE: 2, APPROVAL: 3, UNSUPPORTED: 4, DRIFT: 5, INTEGRITY: 5, GIT: 6, COMMAND: 6, VALIDATION: 7, RECOVERY_REQUIRED: 8, LOCKED: 9 };
try {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) { console.log(help); process.exit(0); }
  const command = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'plan';
  if (!['plan', 'backup', 'rehearse', 'apply', 'restore'].includes(command)) throw new CheckpointError('USAGE', 'Unknown command');
  const options = { repo: process.cwd(), patches: [], progress: message => console.error('[devcheckpoint] ' + message) }, seen = new Set();
  const values = { '--repo': 'repo', '--patch': 'patches', '--config': 'config', '--backup-dir': 'backupDir' };
  const booleans = { '--confirm': 'confirm', '--approve-commands': 'approveCommands', '--recover-lock': 'recoverLock' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag) && flag !== '--patch') throw new CheckpointError('USAGE', 'Duplicate option'); seen.add(flag);
    if (booleans[flag]) options[booleans[flag]] = true;
    else if (values[flag] && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      const value = path.resolve(argv[++i]); if (flag === '--patch') options.patches.push(value); else options[values[flag]] = value;
    } else throw new CheckpointError('USAGE', 'Unknown option or missing value; use --help');
  }
  if (command !== 'plan' && !options.backupDir) throw new CheckpointError('USAGE', '--backup-dir is required');
  if (['apply', 'restore', 'backup'].includes(command) && (options.patches.length || options.config)) throw new CheckpointError('USAGE', 'Patches/config belong to plan/rehearse; adoption uses the sealed receipt');
  const result = { plan, backup: createBackup, rehearse, apply, restore }[command](options);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(JSON.stringify({ status: 'FAIL', code: e.code ?? 'ERROR', message: e instanceof CheckpointError ? e.message : 'Operation failed; no PASS claimed', details: e instanceof CheckpointError ? e.details : {} }, null, 2));
  process.exitCode = exits[e.code] ?? 1;
}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { requireThat, ns, outside, exists, sha, digest, seal, unseal, same, CheckpointError } from './common.mjs';
import { inventory, exact, difference, indexRows, requireNoLinks } from './inventory.mjs';
import { repository, patchPaths } from './repository.mjs';
import { git } from './process.mjs';
import { backup, verifyBackup, reconstruct } from './snapshot.mjs';
import { configuration, checkConfig, validate } from './validation.mjs';
import { locked, journal, state } from './journal.mjs';
import { restoreKnown } from './restore.mjs';

function unchanged(repo, m) {
  requireThat(path.resolve(repo) === m.repo, 'INTEGRITY', 'Snapshot belongs to another repository');
  exact(inventory(repo), m.entries);
  const id = repository(repo);
  requireThat(id.head === m.head && sha(id.statusSha256Input) === m.gitStatusSha256, 'DRIFT', 'Git identity drift');
}
function copyPatches(patches, dir) {
  requireThat(Array.isArray(patches) && patches.length > 0, 'USAGE', 'At least one --patch is required');
  return patches.map((p, i) => {
    const bytes = fs.readFileSync(ns(p)), name = `patch-${i + 1}.patch`;
    fs.writeFileSync(ns(path.join(dir, name)), bytes, { flag: 'wx', mode: 0o600 });
    return { name, sha256: sha(bytes) };
  });
}
function safePatchDelta(before, after, paths) {
  const permitted = new Set(paths), b = indexRows(before), a = indexRows(after);
  for (const p of paths) { let parent = path.posix.dirname(p); while (parent !== '.') { if (!b.has(parent)) permitted.add(parent); parent = path.posix.dirname(parent); } }
  requireThat(difference(before, after).every(p => permitted.has(p)), 'INTEGRITY', 'Patch changed unexpected files or Git metadata');
  requireNoLinks(after);
  for (const p of paths) requireThat(!b.has(p) || b.get(p).kind === 'file', 'UNSUPPORTED', 'Patch preimage is not an ordinary file');
  for (const p of paths) requireThat(!a.has(p) || a.get(p).kind === 'file', 'UNSUPPORTED', 'Patch postimage is not an ordinary file');
}
function patchesInto(root, patches, runDir, baseline, progress) {
  let current = baseline;
  const stages = [], expectedPaths = new Set();
  for (const [i, p] of patches.entries()) {
    progress(`patch ${i + 1}/${patches.length}`);
    const file = path.join(runDir, p.name);
    requireThat(sha(fs.readFileSync(ns(file))) === p.sha256, 'INTEGRITY', 'Patch hash mismatch');
    const paths = patchPaths(root, file, path.join(runDir, `patch-${i + 1}-paths`));
    git(root, ['apply', '--check', '--whitespace=warn', '--', file], { log: path.join(runDir, `patch-${i + 1}-check`) });
    git(root, ['apply', '--whitespace=warn', '--', file], { log: path.join(runDir, `patch-${i + 1}-apply`) });
    const after = inventory(root); safePatchDelta(current, after, paths);
    stages.push(after); paths.forEach(p => expectedPaths.add(p)); current = after;
    journal(runDir, 'PATCH_VERIFIED', { ordinal: i + 1, inventorySha256: digest(after) });
  }
  return { stages, expectedPaths: [...expectedPaths].sort() };
}
export function plan(options) {
  requireThat(options.patches?.length > 0, 'USAGE', 'At least one --patch is required; use --help');
  const repo = path.resolve(options.repo), identity = repository(repo), before = inventory(repo), config = configuration(options.config);
  const output = { status: 'PLAN', repo, head: identity.head, git: identity.status,
    backupMode: 'complete content: .git, modified, untracked and ignored entries; no exclusions',
    entries: before.length, backupBytes: before.reduce((n, r) => n + (r.bytes ?? 0), 0), commands: config.commands,
    risks: ['Stop editors, watchers and background writers before transactions.', 'Validation commands run with your privileges and may use the network.', 'This is a content snapshot, not an ACL/timestamp/system backup.'], applicable: false };
  if (before.some(r => r.kind === 'link')) return { ...output, risks: [...output.risks, 'Links can be inventoried/backed up but rehearsal/apply are unsupported.'] };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'devcheckpoint-plan-'));
  let completed = false;
  try {
    const dest = path.join(temp, 'backup'); backup(repo, dest); const m = verifyBackup(dest);
    const work = path.join(dest, 'workspace'); reconstruct(dest, m, work);
    const copied = copyPatches(options.patches, dest);
    const p = patchesInto(work, copied, dest, m.entries, options.progress ?? (() => {}));
    exact(inventory(repo), before);
    completed = true;
    return { ...output, applicable: true, expectedChangedFiles: p.expectedPaths, patchSha256: copied.map(p => p.sha256) };
  } catch (e) {
    throw new CheckpointError(e.code ?? 'ERROR', 'Preflight failed; target was not modified and private diagnostics were retained', { evidence: path.join(temp, 'backup') });
  } finally {
    // Only the random private directory created by this invocation is disposable.
    requireThat(path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('devcheckpoint-plan-'), 'INTEGRITY', 'Invalid temporary root');
    if (completed) fs.rmSync(ns(temp), { recursive: true });
  }
}
export function createBackup(options) {
  return locked(options.repo, options.recoverLock, () => backup(options.repo, options.backupDir));
}
export function rehearse(options) {
  const dir = path.resolve(options.backupDir), config = configuration(options.config), progress = options.progress ?? (() => {});
  requireThat(config.commands.length === 0 || options.approveCommands, 'APPROVAL', 'Review commands with plan, then use --approve-commands');
  return locked(options.repo, options.recoverLock, () => {
    const m = verifyBackup(dir); requireNoLinks(m.entries); unchanged(options.repo, m);
    requireThat(!exists(path.join(dir, 'rehearsal.json')), 'USAGE', 'A rehearsal is already sealed; use a new snapshot for new changes');
    const runDir = path.join(dir, 'rehearsal-' + crypto.randomUUID()); fs.mkdirSync(ns(runDir));
    const work = path.join(runDir, 'workspace'), patches = copyPatches(options.patches, runDir);
    reconstruct(dir, m, work); const initial = inventory(work);
    journal(runDir, 'REHEARSAL_STARTED');
    let application;
    try {
      application = patchesInto(work, patches, runDir, initial, progress);
      const post = application.stages.at(-1);
      const results = validate(work, config, runDir, options.approveCommands, progress);
      exact(inventory(work), post);
      restoreKnown(work, dir, m.entries, application.stages, runDir);
      unchanged(options.repo, m);
      const receipt = { version: 1, status: 'REHEARSAL_PASS', snapshotSha256: digest(m), run: path.basename(runDir), patches,
        config, expectedPaths: application.expectedPaths, stages: application.stages, results,
        validationScope: config.commands.some(c => c.kind === 'tests') ? 'test evidence checked' : 'no tests configured; patch verification only',
        restored: true };
      seal(path.join(dir, 'rehearsal.json'), receipt); journal(runDir, 'REHEARSAL_PASS');
      return { status: receipt.status, backup: dir, changedFiles: receipt.expectedPaths, results, validationScope: receipt.validationScope, restored: true };
    } catch (e) {
      let recovery = 'NOT_ATTEMPTED';
      if (application && !e.details?.signal && !e.details?.errorCode) {
        try { restoreKnown(work, dir, m.entries, application.stages, runDir); recovery = 'RESTORED'; }
        catch { recovery = 'RECONCILIATION_REQUIRED'; }
      }
      journal(runDir, 'REHEARSAL_FAILED', { code: e.code ?? 'ERROR', recovery });
      throw new CheckpointError(e.code ?? 'VALIDATION', 'Rehearsal failed; owner checkout was not modified', { runDir, recovery });
    }
  });
}
function receipt(dir, m) {
  const r = unseal(path.join(dir, 'rehearsal.json'));
  requireThat(r.version === 1 && r.status === 'REHEARSAL_PASS' && r.restored === true && r.snapshotSha256 === digest(m)
    && /^rehearsal-[a-f0-9-]+$/.test(r.run) && Array.isArray(r.stages) && r.stages.length === r.patches.length && r.stages.length > 0,
  'INTEGRITY', 'Invalid rehearsal receipt');
  checkConfig(r.config); for (const stage of r.stages) indexRows(stage);
  for (const [i, p] of r.patches.entries()) {
    requireThat(p.name === `patch-${i + 1}.patch` && sha(fs.readFileSync(ns(path.join(dir, r.run, p.name)))) === p.sha256, 'INTEGRITY', 'Rehearsed patch was modified');
  }
  return r;
}
export function apply(options) {
  requireThat(options.confirm, 'APPROVAL', 'Explicit --confirm is required for owner writes');
  const dir = path.resolve(options.backupDir), progress = options.progress ?? (() => {});
  return locked(options.repo, options.recoverLock, () => {
    const m = verifyBackup(dir), r = receipt(dir, m); requireNoLinks(m.entries);
    requireThat(r.config.commands.length === 0 || options.approveCommands, 'APPROVAL', 'Validation execution requires --approve-commands');
    unchanged(options.repo, m);
    requireThat(!exists(path.join(dir, 'transaction.json')), 'USAGE', 'This snapshot already has a transaction; restore it or use a new snapshot');
    const runDir = path.join(dir, 'apply-' + crypto.randomUUID()); fs.mkdirSync(ns(runDir));
    const tx = { version: 1, repo: m.repo, run: path.basename(runDir), snapshotSha256: digest(m), phase: 'APPLYING' };
    seal(path.join(dir, 'transaction.json'), tx); state(runDir, tx);
    try {
      let expected = m.entries;
      for (const [i, p] of r.patches.entries()) {
        exact(inventory(m.repo), expected); progress(`apply ${i + 1}/${r.patches.length}`);
        const file = path.join(dir, r.run, p.name);
        git(m.repo, ['apply', '--check', '--whitespace=warn', '--', file], { log: path.join(runDir, `patch-${i + 1}-check`) });
        journal(runDir, 'PATCH_INTENT', { ordinal: i + 1 });
        git(m.repo, ['apply', '--whitespace=warn', '--', file], { log: path.join(runDir, `patch-${i + 1}-apply`) });
        expected = r.stages[i]; exact(inventory(m.repo), expected); journal(runDir, 'PATCH_VERIFIED', { ordinal: i + 1 });
      }
      state(runDir, { ...tx, phase: 'VALIDATING' });
      const results = validate(m.repo, r.config, runDir, options.approveCommands, progress);
      exact(inventory(m.repo), r.stages.at(-1));
      state(runDir, { ...tx, phase: 'APPLIED', results });
      return { status: 'APPLY_PASS', repo: m.repo, backup: dir, results, postimageSha256: digest(r.stages.at(-1)) };
    } catch (e) {
      // Unknown process lifetime or drift must be reconciled before any automatic write.
      if (e.details?.signal || e.details?.errorCode) {
        state(runDir, { ...tx, phase: 'RECOVERY_REQUIRED', code: e.code });
        throw new CheckpointError('RECOVERY_REQUIRED', 'Command lifetime is uncertain; stop all writers before deliberate restore');
      }
      try {
        restoreKnown(m.repo, dir, m.entries, r.stages, runDir);
        state(runDir, { ...tx, phase: 'ROLLED_BACK', cause: e.code ?? 'ERROR' });
      } catch (recoveryError) {
        state(runDir, { ...tx, phase: 'RECOVERY_REQUIRED', cause: e.code ?? 'ERROR' });
        throw new CheckpointError('RECOVERY_REQUIRED', 'Adoption failed and unknown drift prevents automatic recovery', { runDir, recoveryCode: recoveryError.code });
      }
      throw new CheckpointError(e.code ?? 'VALIDATION', 'Adoption failed; exact baseline restoration verified', { recovery: 'RESTORED', runDir });
    }
  });
}
export function restore(options) {
  requireThat(options.confirm, 'APPROVAL', 'Explicit --confirm is required for restore');
  const dir = path.resolve(options.backupDir);
  return locked(options.repo, options.recoverLock, () => {
    const m = verifyBackup(dir), r = receipt(dir, m), tx = unseal(path.join(dir, 'transaction.json'));
    requireThat(tx.version === 1 && tx.repo === path.resolve(options.repo) && tx.repo === m.repo && tx.snapshotSha256 === digest(m)
      && /^apply-[a-f0-9-]+$/.test(tx.run), 'INTEGRITY', 'Transaction identity mismatch');
    const runDir = path.join(dir, tx.run), latest = unseal(path.join(runDir, 'state.json'));
    if (latest.phase === 'APPLIED') exact(inventory(m.repo), r.stages.at(-1));
    const result = restoreKnown(m.repo, dir, m.entries, r.stages, runDir);
    unchanged(m.repo, m); state(runDir, { ...tx, phase: 'RESTORED' }); return result;
  });
}

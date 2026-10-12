import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, config } from './helpers.mjs';
import { createBackup, rehearse, apply, restore } from '../src/engine.mjs';
import { inspectStatus } from '../src/status.mjs';
import { inventory, exact } from '../src/inventory.mjs';
import { unseal, seal, digest, ns } from '../src/common.mjs';
import { state } from '../src/journal.mjs';

function inspectUnchanged(f, options = {}) {
  const before = inventory(f.base);
  try { return inspectStatus({ backupDir: f.backupDir, ...options }); }
  finally { exact(inventory(f.base), before); }
}
test('status inspects backup, rehearsal, applied and restored metadata without writes', () => {
  const f = fixture(); try {
    fs.writeFileSync(path.join(f.repo, 'status.test.mjs'), "import test from 'node:test'; test('synthetic status evidence', () => {});\n");
    const checks = config(f, [{ name: 'unit', kind: 'tests', argv: ['node', '--test', '--test-reporter={reporter}', 'status.test.mjs'] }]);
    createBackup(f);
    assert.equal(inspectUnchanged(f).recordedState, 'BACKUP_ONLY');
    const pending = path.join(f.backupDir, 'transaction.json.pending-synthetic');
    fs.writeFileSync(pending, '{}');
    assert.equal(inspectUnchanged(f).recordedState, 'INCOMPLETE'); fs.unlinkSync(pending);
    rehearse({ ...f, patches: [f.patch], config: checks, approveCommands: true });
    const rehearsed = inspectUnchanged(f); assert.equal(rehearsed.recordedState, 'REHEARSED');
    assert.equal(rehearsed.rehearsal.changedFiles, 1); assert.equal(rehearsed.verification, 'METADATA_ONLY');
    assert.equal(rehearsed.rehearsal.results[0].tests.total, 1);
    apply({ ...f, confirm: true, approveCommands: true });
    assert.equal(inspectUnchanged(f).recordedState, 'APPLIED');
    const checked = inspectUnchanged(f, { verify: true, repo: f.repo });
    assert.equal(checked.checkout.verification, 'EXACT_MATCH'); assert.equal(checked.checkout.comparedWith, 'postimage');
    fs.writeFileSync(path.join(f.repo, 'keep.txt'), 'unexpected edit\n');
    assert.equal(inspectUnchanged(f).checkout.verification, 'NOT_INSPECTED');
    assert.throws(() => inspectUnchanged(f, { verify: true, repo: f.repo }), e => e.code === 'DRIFT');
    fs.writeFileSync(path.join(f.repo, 'keep.txt'), 'preserved\n');
    restore({ ...f, confirm: true });
    assert.equal(inspectUnchanged(f, { verify: true, repo: f.repo }).recordedState, 'RESTORED');
    assert.throws(() => inspectUnchanged(f, { repo: f.repo }), e => e.code === 'USAGE');
    assert.throws(() => inspectUnchanged(f, { verify: true, repo: f.base }), e => e.code === 'INTEGRITY');
  } finally { f.cleanup(); }
});
test('metadata-only status does not read objects or the recorded checkout; deep verification detects tampering', t => {
  const f = fixture(); try {
    createBackup(f);
    const original = fs.readFileSync, read = t.mock.method(fs, 'readFileSync', (file, ...args) => {
      if (typeof file !== 'number') {
        const key = ns(String(file));
        assert(!key.startsWith(ns(f.repo) + path.sep), 'read live checkout without permission');
        assert(!key.includes(path.sep + 'objects' + path.sep), 'read backup object by default');
      }
      return original(file, ...args);
    });
    assert.equal(inspectStatus({ backupDir: f.backupDir }).verification, 'METADATA_ONLY'); read.mock.restore();
    const object = path.join(f.backupDir, 'objects', fs.readdirSync(path.join(f.backupDir, 'objects'))[0]);
    fs.appendFileSync(object, 'tampered');
    assert.equal(inspectUnchanged(f).verification, 'METADATA_ONLY');
    assert.throws(() => inspectUnchanged(f, { verify: true }), e => e.code === 'INTEGRITY');
    fs.appendFileSync(path.join(f.backupDir, 'snapshot.json'), ' ');
    assert.throws(() => inspectUnchanged(f), e => e.code === 'INTEGRITY');
  } finally { f.cleanup(); }
});
test('status retains failed, rolled back and incomplete states without claiming success or repairing them', () => {
  const f = fixture(); try {
    createBackup(f);
    const failing = config(f, [{ name: 'failure', kind: 'command', argv: ['node', '-e', 'process.exit(9)'] }]);
    assert.throws(() => rehearse({ ...f, config: failing, patches: [f.patch], approveCommands: true }));
    assert.equal(inspectUnchanged(f).recordedState, 'REHEARSAL_FAILED');
    const selective = config(f, [{ name: 'owner_failure', kind: 'command', argv: ['node', '-e', `process.exit(process.cwd() === ${JSON.stringify(f.repo)} ? 9 : 0)`] }]);
    rehearse({ ...f, config: selective, patches: [f.patch], approveCommands: true });
    assert.throws(() => apply({ ...f, confirm: true, approveCommands: true }), e => e.code === 'VALIDATION');
    assert.equal(inspectUnchanged(f, { verify: true, repo: f.repo }).recordedState, 'ROLLED_BACK');
    const tx = unseal(path.join(f.backupDir, 'transaction.json')), run = path.join(f.backupDir, tx.run);
    state(run, { ...tx, phase: 'RECOVERY_REQUIRED' });
    const incomplete = inspectUnchanged(f, { verify: true, repo: f.repo });
    assert.equal(incomplete.recordedState, 'INCOMPLETE'); assert.equal(incomplete.checkout.verification, 'INCOMPLETE_TRANSACTION');
    seal(path.join(run, 'state.json'), { ...tx, phase: 'APPLIED', results: [] });
    assert.throws(() => inspectUnchanged(f), e => e.code === 'INTEGRITY');
  } finally { f.cleanup(); }
});
test('status rejects missing and inconsistent sidecars, receipts and journal metadata', () => {
  const f = fixture(); try {
    createBackup(f); rehearse({ ...f, patches: [f.patch] });
    const receiptFile = path.join(f.backupDir, 'rehearsal.json'), r = unseal(receiptFile);
    const journal = path.join(f.backupDir, r.run, 'journal.jsonl'), bytes = fs.readFileSync(journal);
    fs.writeFileSync(journal, bytes.subarray(0, bytes.length - 1));
    assert.throws(() => inspectUnchanged(f), e => e.code === 'INTEGRITY'); fs.writeFileSync(journal, bytes);
    seal(receiptFile, { ...r, snapshotSha256: '0'.repeat(64) });
    assert.throws(() => inspectUnchanged(f), e => e.code === 'INTEGRITY'); seal(receiptFile, r);
    fs.unlinkSync(receiptFile + '.sha256');
    assert.throws(() => inspectUnchanged(f), e => e.code === 'INTEGRITY'); seal(receiptFile, r);
    const run = 'apply-00000000-0000-0000-0000-000000000000'; fs.mkdirSync(path.join(f.backupDir, run));
    seal(path.join(f.backupDir, 'transaction.json'), { version: 1, repo: f.repo, run, snapshotSha256: digest(unseal(path.join(f.backupDir, 'snapshot.json'))), phase: 'APPLYING' });
    assert.throws(() => inspectUnchanged(f)); // no invented state for a missing state file
  } finally { f.cleanup(); }
});

test('status rejects a linked rehearsal directory before reading copied patches', t => {
  const f = fixture(); try {
    createBackup(f); rehearse({ ...f, patches: [f.patch] });
    const r = unseal(path.join(f.backupDir, 'rehearsal.json')), run = path.join(f.backupDir, r.run), moved = path.join(f.base, 'external evidence');
    fs.renameSync(run, moved);
    fs.symlinkSync(moved, run, process.platform === 'win32' ? 'junction' : 'dir');
    const original = fs.readFileSync; let patchReads = 0;
    const read = t.mock.method(fs, 'readFileSync', (file, ...args) => {
      if (typeof file !== 'number' && String(file).endsWith('patch-1.patch')) patchReads++;
      return original(file, ...args);
    });
    assert.throws(() => inspectStatus({ backupDir: f.backupDir }), e => e.code === 'UNSUPPORTED');
    assert.equal(patchReads, 0); read.mock.restore();
  } finally { f.cleanup(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, diff, config } from './helpers.mjs';
import { plan, createBackup, rehearse, apply, restore } from '../src/engine.mjs';
import { inventory, exact } from '../src/inventory.mjs';
import { verifyBackup } from '../src/snapshot.mjs';
import { unseal, ns } from '../src/common.mjs';
import { requireSpace } from '../src/space.mjs';

test('single-patch plan copies no repository files; ordered plan uses one verified copy', t => {
  const f = fixture(); try {
    const baseline = inventory(f.repo), original = fs.copyFileSync, copies = [];
    const spy = t.mock.method(fs, 'copyFileSync', (...args) => { copies.push(args); return original(...args); });
    const single = plan({ repo: f.repo, patches: [f.patch] });
    assert.equal(copies.length, 0); assert.equal(single.applicable, true); assert.match(single.verificationScope, /requires rehearsal/);
    const second = path.join(f.base, 'second.patch'); fs.writeFileSync(second, diff('value.txt', 'two', 'three'));
    const series = plan({ repo: f.repo, patches: [f.patch, second] });
    assert.equal(series.applicable, true); assert.equal(copies.length, baseline.filter(r => r.kind === 'file').length);
    assert(copies.every(([, to]) => String(to).includes(path.sep + 'workspace' + path.sep)));
    spy.mock.restore(); exact(inventory(f.repo), baseline);
  } finally { f.cleanup(); }
});

test('successful rehearsal drops only the verified disposable workspace; failures and evidence remain', () => {
  const f = fixture(); try {
    const c = config(f, [{ name: 'failure', kind: 'command', argv: ['node', '-e', 'process.exit(17)'] }]);
    createBackup(f);
    assert.throws(() => rehearse({ ...f, patches: [f.patch], config: c, approveCommands: true }), e => e.code === 'VALIDATION');
    const failed = fs.readdirSync(f.backupDir).find(n => n.startsWith('rehearsal-'));
    assert(fs.existsSync(path.join(f.backupDir, failed, 'workspace')));
    rehearse({ ...f, patches: [f.patch] });
    const receipt = unseal(path.join(f.backupDir, 'rehearsal.json')), run = path.join(f.backupDir, receipt.run);
    assert(!fs.existsSync(path.join(run, 'workspace'))); assert(fs.existsSync(path.join(run, 'patch-1.patch')));
    assert.match(fs.readFileSync(path.join(run, 'journal.jsonl'), 'utf8'), /RESTORED_WORKSPACE_REMOVED/);
    assert(fs.readdirSync(run).some(n => n.startsWith('recovery-'))); assert(fs.existsSync(path.join(f.backupDir, failed, 'workspace')));
    verifyBackup(f.backupDir);
  } finally { f.cleanup(); }
});

test('insufficient free space refuses every operation before target changes and remains recoverable', t => {
  const f = fixture(); const options = { ...f, patches: [f.patch], confirm: true };
  function refuse(fn) {
    const before = inventory(f.repo), mock = t.mock.method(fs, 'statfsSync', () => ({ bsize: 4096n, bavail: 0n }));
    try { assert.throws(fn, e => e.code === 'SPACE' && BigInt(e.details.requiredBytes) > 0n); }
    finally { mock.mock.restore(); }
    exact(inventory(f.repo), before);
  }
  try {
    refuse(() => plan(options)); refuse(() => createBackup(options)); assert(!fs.existsSync(f.backupDir));
    createBackup(options); refuse(() => rehearse(options)); assert(!fs.readdirSync(f.backupDir).some(n => n.startsWith('rehearsal-')));
    rehearse(options); refuse(() => apply(options)); assert(!fs.existsSync(path.join(f.backupDir, 'transaction.json')));
    apply(options); refuse(() => restore(options)); restore(options); exact(inventory(f.repo), verifyBackup(f.backupDir).entries);
  } finally { f.cleanup(); }
});

test('space estimates combine backup and checkout demands on the same volume', t => {
  const f = fixture(); try {
    const mock = t.mock.method(fs, 'statfsSync', () => ({ bsize: 1n, bavail: 200n * 1024n * 1024n }));
    const request = { path: f.repo, bytes: 80 * 1024 * 1024, purpose: 'test' };
    requireSpace([request]); assert.throws(() => requireSpace([request, { ...request, path: f.backupDir }]), e => e.code === 'SPACE');
    mock.mock.restore();
  } finally { f.cleanup(); }
});

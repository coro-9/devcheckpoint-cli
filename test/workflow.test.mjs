import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, diff, config, cli, root } from './helpers.mjs';
import { plan, createBackup, rehearse, apply, restore } from '../src/engine.mjs';
import { inventory, exact } from '../src/inventory.mjs';
import { verifyBackup } from '../src/snapshot.mjs';
import { unseal, ns, readJson } from '../src/common.mjs';

test('complete CLI lifecycle preserves dirty, staged, untracked and ignored work', () => {
  const f = fixture(); try {
    fs.writeFileSync(path.join(f.repo, 'keep.txt'), 'staged change\n'); f.g(['add', 'keep.txt']);
    fs.appendFileSync(path.join(f.repo, 'keep.txt'), 'unstaged addition\n');
    fs.writeFileSync(path.join(f.repo, 'untracked.txt'), 'unsaved local work'); fs.writeFileSync(path.join(f.repo, 'private.local'), 'synthetic-only');
    const before = inventory(f.repo), common = ['--repo', f.repo, '--backup-dir', f.backupDir];
    const p = cli(['plan', '--repo', f.repo, '--patch', f.patch]); assert.equal(p.exitCode, 0, p.stderr); assert.equal(JSON.parse(p.stdout).applicable, true); exact(inventory(f.repo), before);
    for (const args of [['backup', ...common], ['rehearse', ...common, '--patch', f.patch], ['apply', ...common, '--confirm'], ['restore', ...common, '--confirm']]) {
      const r = cli(args); assert.equal(r.exitCode, 0, r.stderr);
    }
    exact(inventory(f.repo), before); assert.equal(verifyBackup(f.backupDir).entries.length, before.length);
  } finally { f.cleanup(); }
});

test('dependent patches apply in order, preserve unrelated files, and retain whitespace warnings', () => {
  const f = fixture(); try {
    const second = path.join(f.base, 'second.patch'); fs.writeFileSync(second, diff('value.txt', 'two', 'three   '));
    const o = { ...f, patches: [f.patch, second] }; createBackup(o); const r = rehearse(o); assert.equal(r.status, 'REHEARSAL_PASS');
    const receipt = unseal(path.join(f.backupDir, 'rehearsal.json'));
    assert.match(fs.readFileSync(path.join(f.backupDir, receipt.run, 'patch-2-apply.stderr'), 'utf8'), /whitespace|trailing/i);
    apply({ ...o, confirm: true }); assert.equal(fs.readFileSync(path.join(f.repo, 'value.txt'), 'utf8'), 'three   \n');
    restore({ ...o, confirm: true }); assert.equal(fs.readFileSync(path.join(f.repo, 'value.txt'), 'utf8'), 'one\n');
  } finally { f.cleanup(); }
});

test('genuinely invalid Git patch does not qualify and owner stays untouched', () => {
  const f = fixture(); try {
    fs.writeFileSync(f.patch, diff('value.txt', 'wrong preimage', 'two')); const before = inventory(f.repo); createBackup(f);
    assert.throws(() => rehearse({ ...f, patches: [f.patch] }), e => e.code === 'GIT'); exact(inventory(f.repo), before);
    assert.equal(fs.existsSync(path.join(f.backupDir, 'rehearsal.json')), false);
  } finally { f.cleanup(); }
});

test('hash corruption, preimage drift, and post-adoption edits fail closed', () => {
  const f = fixture(); try {
    createBackup(f); rehearse({ ...f, patches: [f.patch] });
    fs.writeFileSync(path.join(f.repo, 'new-work.txt'), 'keep'); assert.throws(() => apply({ ...f, confirm: true }), e => e.code === 'DRIFT');
    fs.unlinkSync(path.join(f.repo, 'new-work.txt')); apply({ ...f, confirm: true });
    fs.writeFileSync(path.join(f.repo, 'value.txt'), 'owner edit after adoption\n');
    assert.throws(() => restore({ ...f, confirm: true }), e => e.code === 'DRIFT');
    assert.equal(fs.readFileSync(path.join(f.repo, 'value.txt'), 'utf8'), 'owner edit after adoption\n');
    const m = unseal(path.join(f.backupDir, 'snapshot.json')), object = path.join(f.backupDir, 'objects', m.entries.find(r => r.path === 'value.txt').sha256);
    fs.writeFileSync(object, 'corruption'); assert.throws(() => verifyBackup(f.backupDir), e => e.code === 'INTEGRITY');
  } finally { f.cleanup(); }
});

test('approval is required independently for commands and real application', () => {
  const f = fixture(); try {
    const c = config(f, [{ name: 'check', kind: 'command', argv: ['node', '-e', 'process.exit(0)'] }]);
    createBackup(f); assert.throws(() => rehearse({ ...f, patches: [f.patch], config: c }), e => e.code === 'APPROVAL');
    rehearse({ ...f, patches: [f.patch], config: c, approveCommands: true });
    assert.throws(() => apply(f), e => e.code === 'APPROVAL'); assert.throws(() => apply({ ...f, confirm: true }), e => e.code === 'APPROVAL');
  } finally { f.cleanup(); }
});

test('failed validation during adoption automatically restores exact baseline', () => {
  const f = fixture(); try {
    const script = `process.exit(process.cwd() === ${JSON.stringify(f.repo)} ? 17 : 0)`;
    const c = config(f, [{ name: 'controlled_failure', kind: 'command', argv: ['node', '-e', script] }]);
    const baseline = inventory(f.repo); createBackup(f); rehearse({ ...f, patches: [f.patch], config: c, approveCommands: true });
    assert.throws(() => apply({ ...f, confirm: true, approveCommands: true }), e => e.code === 'VALIDATION' && e.details.recovery === 'RESTORED');
    exact(inventory(f.repo), baseline);
    const tx = unseal(path.join(f.backupDir, 'transaction.json')); assert.equal(unseal(path.join(f.backupDir, tx.run, 'state.json')).phase, 'ROLLED_BACK');
  } finally { f.cleanup(); }
});

test('validation mutation cannot become a PASS or be silently erased', () => {
  const f = fixture(); try {
    const c = config(f, [{ name: 'unexpected_write', kind: 'command', argv: ['node', '-e', `if(process.cwd()===${JSON.stringify(f.repo)})require('fs').writeFileSync('keep.txt','new user-like edit')`] }]);
    createBackup(f); rehearse({ ...f, patches: [f.patch], config: c, approveCommands: true });
    assert.throws(() => apply({ ...f, confirm: true, approveCommands: true }), e => e.code === 'RECOVERY_REQUIRED');
    assert.equal(fs.readFileSync(path.join(f.repo, 'keep.txt'), 'utf8'), 'new user-like edit');
    assert.throws(() => restore({ ...f, confirm: true }), e => e.code === 'RECOVERY_REQUIRED');
  } finally { f.cleanup(); }
});

test('real terminated transaction is deliberately recoverable without discarding unknown edits', () => {
  const f = fixture(); try {
    const c = config(f, [{ name: 'interrupt', kind: 'command', argv: ['node', '-e', `if(process.cwd()===${JSON.stringify(f.repo)})process.kill(process.ppid,'SIGKILL')`] }]);
    const baseline = inventory(f.repo); createBackup(f); rehearse({ ...f, patches: [f.patch], config: c, approveCommands: true });
    const stopped = cli(['apply', '--repo', f.repo, '--backup-dir', f.backupDir, '--confirm', '--approve-commands']);
    assert.notEqual(stopped.exitCode, 0); assert.equal(fs.readFileSync(path.join(f.repo, 'value.txt'), 'utf8'), 'two\n');
    const r = cli(['restore', '--repo', f.repo, '--backup-dir', f.backupDir, '--confirm', '--recover-lock']); assert.equal(r.exitCode, 0, r.stderr);
    exact(inventory(f.repo), baseline);
  } finally { f.cleanup(); }
});

test('added and deleted regular files and directories round-trip', () => {
  const f = fixture(); try {
    fs.writeFileSync(f.patch, 'diff --git a/keep.txt b/keep.txt\ndeleted file mode 100644\n--- a/keep.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-preserved\ndiff --git a/new/item.txt b/new/item.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new/item.txt\n@@ -0,0 +1 @@\n+added\n');
    const baseline = inventory(f.repo); createBackup(f); rehearse({ ...f, patches: [f.patch] }); apply({ ...f, confirm: true });
    assert(fs.existsSync(path.join(f.repo, 'new/item.txt'))); restore({ ...f, confirm: true }); exact(inventory(f.repo), baseline);
  } finally { f.cleanup(); }
});

test('binary patch is rehearsed and restored by exact hashes', () => {
  const f = fixture(); try {
    const original = Buffer.from([0, 1, 2, 3, 255]); fs.writeFileSync(path.join(f.repo, 'binary.dat'), original); f.g(['add', 'binary.dat']); f.g(['commit', '--quiet', '-m', 'Synthetic binary']);
    fs.writeFileSync(path.join(f.repo, 'binary.dat'), Buffer.from([0, 9, 8, 7, 254])); fs.writeFileSync(f.patch, f.g(['diff', '--binary', '--', 'binary.dat'])); fs.writeFileSync(path.join(f.repo, 'binary.dat'), original);
    const baseline = inventory(f.repo); createBackup(f); rehearse({ ...f, patches: [f.patch] }); apply({ ...f, confirm: true }); restore({ ...f, confirm: true }); exact(inventory(f.repo), baseline);
  } finally { f.cleanup(); }
});

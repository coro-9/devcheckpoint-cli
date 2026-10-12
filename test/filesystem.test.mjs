import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './helpers.mjs';
import { createBackup, rehearse, apply, restore } from '../src/engine.mjs';
import { inventory, exact } from '../src/inventory.mjs';
import { verifyBackup, reconstruct } from '../src/snapshot.mjs';
import { ns } from '../src/common.mjs';

test('spaces, Unicode, long paths and actual Windows nul are copied by real entry identity', () => {
  const f = fixture(); try {
    const sub = path.join(f.repo, 'folder with spaces', 'مرحبا-世界', 'x'.repeat(100), 'y'.repeat(100)); fs.mkdirSync(ns(sub), { recursive: true });
    fs.writeFileSync(ns(path.join(sub, 'long.txt')), 'synthetic bytes');
    if (process.platform === 'win32') fs.writeFileSync(ns(path.join(f.repo, 'nul')), 'real file, not device');
    const before = inventory(f.repo); createBackup(f); const m = verifyBackup(f.backupDir);
    const workspace = path.join(f.base, 'reconstruction'); reconstruct(f.backupDir, m, workspace); exact(inventory(workspace), before);
    if (process.platform === 'win32') assert.equal(fs.readFileSync(ns(path.join(workspace, 'nul')), 'utf8'), 'real file, not device');
  } finally { f.cleanup(); }
});
test('external directory links are recorded without traversal and cannot be rehearsed', () => {
  const f = fixture(); try {
    const external = path.join(f.base, 'external'); fs.mkdirSync(external); fs.writeFileSync(path.join(external, 'private.txt'), 'synthetic outside');
    fs.symlinkSync(external, path.join(f.repo, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    createBackup(f); const m = verifyBackup(f.backupDir); assert(m.entries.some(r => r.path === 'linked' && r.kind === 'link'));
    assert(!m.entries.some(r => r.path.includes('private.txt'))); assert.throws(() => rehearse({ ...f, patches: [f.patch] }), e => e.code === 'UNSUPPORTED');
    assert.equal(fs.readFileSync(path.join(external, 'private.txt'), 'utf8'), 'synthetic outside');
  } finally { f.cleanup(); }
});
test('hard links fail closed instead of losing their filesystem semantics', () => {
  const f = fixture(); try { fs.linkSync(path.join(f.repo, 'value.txt'), path.join(f.repo, 'hardlink')); assert.throws(() => inventory(f.repo), e => e.code === 'UNSUPPORTED'); }
  finally { f.cleanup(); }
});
test('Windows alternate data streams are rejected explicitly', { skip: process.platform !== 'win32' }, () => {
  const f = fixture(); try { fs.writeFileSync(ns(path.join(f.repo, 'value.txt') + ':extra'), 'synthetic alternate stream'); assert.throws(() => createBackup(f), e => e.code === 'UNSUPPORTED'); }
  finally { f.cleanup(); }
});

test('Windows root-directory streams are not silently omitted', { skip: process.platform !== 'win32' }, () => {
  const f = fixture(); try { fs.writeFileSync(ns(f.repo + ':rootstream'), 'synthetic stream'); assert.throws(() => createBackup(f), e => e.code === 'UNSUPPORTED'); }
  finally { f.cleanup(); }
});

test('external Git filters cannot execute in preflight or backup', () => {
  const f = fixture(); try {
    const marker = path.join(f.base, 'must-not-exist'), script = path.join(f.base, 'filter.cjs');
    fs.writeFileSync(script, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe');`);
    f.g(['config', 'filter.trap.clean', `"${process.execPath.replaceAll('\\', '/')}" "${script.replaceAll('\\', '/')}"`]);
    fs.writeFileSync(path.join(f.repo, '.gitattributes'), 'value.txt filter=trap\n'); fs.writeFileSync(path.join(f.repo, 'value.txt'), 'dirty\n');
    assert.throws(() => createBackup(f), e => e.code === 'UNSUPPORTED'); assert.equal(fs.existsSync(marker), false);
  } finally { f.cleanup(); }
});

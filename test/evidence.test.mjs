import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, config, root } from './helpers.mjs';
import { testEvidence, validate } from '../src/validation.mjs';
import { indexRows } from '../src/inventory.mjs';
import { succeeded } from '../src/process.mjs';

const good = { version: 1, complete: true, total: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
test('evidence schema rejects missing, incomplete, zero, cancelled, failed, skipped and forged totals', () => {
  assert.deepEqual(testEvidence(good), good);
  for (const e of [{}, { ...good, complete: false }, { ...good, passed: 0, total: 0 }, { ...good, failed: 1 }, { ...good, cancelled: 1 }, { ...good, skipped: 1 }, { ...good, total: 3 }, { ...good, total: 2.5 }]) assert.throws(() => testEvidence(e));
});
test('exit code is authoritative; successful stderr is preserved, signals and spawn failures fail', () => {
  assert.equal(succeeded({ exitCode: 0, stderr: 'warning' }).stderr, 'warning');
  for (const r of [{ exitCode: 1 }, { exitCode: null, signal: 'SIGTERM' }, { exitCode: null, errorCode: 'ENOENT' }]) assert.throws(() => succeeded(r));
});
test('inventories reject duplicate keys, path traversal and missing parents', () => {
  const r = { path: 'file', kind: 'directory' };
  for (const rows of [[r, r], [r, { ...r, path: 'FILE' }], [{ ...r, path: '../file' }], [{ ...r, path: 'a/b' }]]) assert.throws(() => indexRows(rows));
});
test('real Node reporter distinguishes passing, failing, empty and incomplete test evidence', () => {
  const f = fixture(); try {
    for (const [name, source, pass] of [
      ['passing', "const {test}=require('node:test');test('one',()=>{});test('two',()=>{});", true],
      ['failing', "const {test}=require('node:test');test('bad',()=>{throw Error('synthetic')});", false],
      ['empty', '', false],
      ['missing', 'process.exit(0)', false]
    ]) {
      const file = path.join(f.base, name + '.cjs'); fs.writeFileSync(file, source); const run = path.join(f.base, name); fs.mkdirSync(run);
      const argv = name === 'missing' ? ['node', file] : ['node', '--test', '--test-reporter={reporter}', file];
      const fn = () => validate(f.repo, { version: 1, commands: [{ name: 'tests', kind: 'tests', argv }] }, run, true);
      if (pass) assert.equal(fn()[0].tests.total, 2); else assert.throws(fn, e => e.code === 'VALIDATION');
    }
  } finally { f.cleanup(); }
});

test('validation names cannot overwrite transaction or Git evidence', () => {
  const f = fixture(); try {
    const dir = path.join(f.base, 'run'); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'state.json'), 'sealed state'); fs.writeFileSync(path.join(dir, 'patch-1-apply.stderr'), 'original warning');
    validate(f.repo, { version: 1, commands: [
      { name: 'state', kind: 'command', argv: ['node', '-e', 'process.exit(0)'] },
      { name: 'patch-1-apply', kind: 'command', argv: ['node', '-e', 'process.exit(0)'] }
    ] }, dir, true);
    assert.equal(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'), 'sealed state');
    assert.equal(fs.readFileSync(path.join(dir, 'patch-1-apply.stderr'), 'utf8'), 'original warning');
  } finally { f.cleanup(); }
});

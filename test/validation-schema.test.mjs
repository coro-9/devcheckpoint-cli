import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkConfig, validate } from '../src/validation.mjs';

const command = extras => ({ name: 'bounded', kind: 'command', argv: ['node', '-e', 'process.exit(0)'], ...extras });
test('validation timeout accepts omission and inclusive integer bounds only', () => {
  for (const extras of [{}, { timeoutMs: 1 }, { timeoutMs: 120000 }, { timeoutMs: 3600000 }])
    assert.doesNotThrow(() => checkConfig({ version: 1, commands: [command(extras)] }));
  for (const timeoutMs of [0, null, false, true, '', '100', 1.5, -1, 3600001, NaN, Infinity, undefined])
    assert.throws(() => checkConfig({ version: 1, commands: [command({ timeoutMs })] }), { code: 'USAGE' });
});
test('validation command names require unique identifier strings', () => {
  for (const name of [123, null, false, {}, [], '', 'has space'])
    assert.throws(() => checkConfig({ version: 1, commands: [command({ name })] }), { code: 'USAGE' });
  assert.throws(() => checkConfig({ version: 1, commands: [command(), command()] }), { code: 'USAGE' });
  assert.doesNotThrow(() => checkConfig({ version: 1, commands: [command({ name: 'valid_1-2' })] }));
});
test('invalid timeout is rejected before validation evidence or child execution', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'devcheckpoint-schema-'));
  try {
    const marker = path.join(base, 'must-not-exist');
    const c = command({ timeoutMs: 0, argv: ['node', '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`] });
    assert.throws(() => validate(base, { version: 1, commands: [c] }, base, true), { code: 'USAGE' });
    assert.equal(fs.existsSync(marker), false); assert.equal(fs.existsSync(path.join(base, 'validation')), false);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
test('real finite synthetic process times out with retained failure evidence', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'devcheckpoint-timeout-'));
  try {
    // Even if termination is delayed, this child exits by itself after 1.5 seconds; no descendants.
    const c = command({ timeoutMs: 150, argv: ['node', '-e', 'setTimeout(() => process.exit(0), 1500)'] });
    assert.throws(() => validate(base, { version: 1, commands: [c] }, base, true), e => e.code === 'VALIDATION' && e.details.errorCode === 'ETIMEDOUT');
    const r = JSON.parse(fs.readFileSync(path.join(base, 'validation', 'bounded.json'), 'utf8'));
    assert.equal(r.errorCode, 'ETIMEDOUT'); assert.notEqual(r.exitCode, 0);
    assert.equal(fs.existsSync(path.join(base, 'validation', 'bounded.stderr')), true);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

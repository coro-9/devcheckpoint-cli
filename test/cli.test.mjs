import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { cli, fixture, root } from './helpers.mjs';
import { inventory, exact } from '../src/inventory.mjs';
import { doctor, requireNode, safeError } from '../src/environment.mjs';
import { CheckpointError } from '../src/common.mjs';

const expectedVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
test('help, version and environment doctor work outside Git without runtime writes', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'devcheckpoint-cli-'));
  try {
    const before = inventory(cwd);
    const help = cli(['--help'], { cwd }); assert.equal(help.exitCode, 0); assert.match(help.stdout, new RegExp(expectedVersion.replaceAll('.', '\\.')));
    const version = cli(['--version'], { cwd }); assert.equal(version.exitCode, 0); assert.equal(version.stdout.trim(), expectedVersion);
    const result = cli(['doctor'], { cwd }); assert.equal(result.exitCode, 0, result.stderr);
    const d = JSON.parse(result.stdout); assert.equal(d.status, 'PASS'); assert.equal(d.checks.some(c => c.name === 'repository'), false);
    exact(inventory(cwd), before);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});
test('doctor checks supplied synthetic layout without full content hashing or repository changes', () => {
  const f = fixture();
  try {
    const before = inventory(f.repo);
    const d = doctor({ repo: f.repo }); assert.equal(d.status, 'PASS'); assert.match(d.deferred.join(' '), /hashing/);
    exact(inventory(f.repo), before);
    fs.writeFileSync(path.join(f.repo, '.git', 'shallow'), 'unsupported');
    assert.equal(doctor({ repo: f.repo }).status, 'FAIL');
  } finally { f.cleanup(); }
});
test('CLI rejects inappropriate flags and reports expected input errors safely', () => {
  const f = fixture();
  try {
    for (const args of [['doctor', '--confirm'], ['doctor', '--backup-dir', f.backupDir], ['plan', '--verify'],
      ['status', '--backup-dir', f.backupDir, '--repo', f.repo], ['status', '--backup-dir', f.backupDir, '--recover-lock']]) {
      const r = cli(args); assert.equal(r.exitCode, 2); assert.equal(JSON.parse(r.stderr).code, 'USAGE');
    }
    const missing = cli(['backup', '--repo', path.join(f.base, 'missing'), '--backup-dir', f.backupDir]);
    assert.equal(missing.exitCode, 2); assert.match(JSON.parse(missing.stderr).message, /does not exist/);
    const nonrepo = cli(['backup', '--repo', f.base, '--backup-dir', f.backupDir]);
    assert.equal(nonrepo.exitCode, 4); assert.match(JSON.parse(nonrepo.stderr).message, /\.git/);
    const config = path.join(f.base, 'bad.json'); fs.writeFileSync(config, '{private malformed text');
    const malformed = cli(['plan', '--repo', f.repo, '--patch', f.patch, '--config', config]);
    assert.equal(malformed.exitCode, 2); assert.match(JSON.parse(malformed.stderr).message, /Malformed validation JSON/);
    assert.doesNotMatch(malformed.stderr, /private malformed text/);
    assert.equal(fs.existsSync(f.backupDir), false);
  } finally { f.cleanup(); }
});
test('documented Node minimum and safe recovery guidance are explicit', () => {
  for (const v of ['24.0.0', '25.1.0']) assert.doesNotThrow(() => requireNode(v));
  for (const v of ['22.0.0', '23.9.9', 'unknown']) assert.throws(() => requireNode(v), { code: 'UNSUPPORTED' });
  const privateError = new Error('secret-value'); privateError.code = 'ENOENT';
  assert.doesNotMatch(JSON.stringify(safeError(privateError)), /secret-value/);
  assert.match(safeError(new CheckpointError('SPACE', 'Insufficient space')).nextStep, /preserve/i);
  assert.match(safeError(new CheckpointError('RECOVERY_REQUIRED', 'Uncertain lifetime')).nextStep, /reconcile/);
});
test('doctor reports unavailable Git without leaking probe diagnostics', () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = '';
  const r = cli(['doctor'], { env }); assert.equal(r.exitCode, 4);
  const d = JSON.parse(r.stdout), git = d.checks.find(c => c.name === 'git');
  assert.equal(git.status, 'FAIL'); assert.match(git.message, /PATH/);
  assert.equal(Object.hasOwn(git, 'stderr'), false);
});

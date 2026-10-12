import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, requireThat, ns, exists, CheckpointError } from './common.mjs';
import { run, succeeded } from './process.mjs';

export const toolRoot = fileURLToPath(new URL('../', import.meta.url));
export function configuration(file) {
  return checkConfig(file ? readJson(file) : { version: 1, commands: [] });
}
export function checkConfig(c) {
  requireThat(c && c.version === 1 && Array.isArray(c.commands) && Object.keys(c).every(k => ['version', 'commands'].includes(k)), 'USAGE', 'Expected version:1 and commands array');
  const names = new Set();
  for (const command of c.commands) {
    requireThat(command && /^[a-zA-Z0-9_-]+$/.test(command.name) && !names.has(command.name) && ['command', 'tests'].includes(command.kind)
      && Array.isArray(command.argv) && command.argv.length > 0 && command.argv.every(a => typeof a === 'string' && !a.includes('\0'))
      && command.argv[0].length > 0 && (!command.timeoutMs || (Number.isInteger(command.timeoutMs) && command.timeoutMs > 0 && command.timeoutMs <= 3600000))
      && Object.keys(command).every(k => ['name', 'kind', 'argv', 'timeoutMs'].includes(k)), 'USAGE', 'Invalid or duplicate validation command');
    names.add(command.name);
  }
  return c;
}
export function testEvidence(e) {
  requireThat(e && e.version === 1 && e.complete === true, 'VALIDATION', 'Missing complete test evidence');
  for (const k of ['total', 'passed', 'failed', 'skipped', 'cancelled', 'todo']) requireThat(Number.isSafeInteger(e[k]) && e[k] >= 0, 'VALIDATION', 'Missing or invalid test counter');
  requireThat(e.total > 0 && e.passed === e.total && [e.failed, e.skipped, e.cancelled, e.todo].every(n => n === 0), 'VALIDATION', 'Tests failed, were incomplete, skipped, or empty');
  return e;
}
export function validate(repo, config, runDir, approved, progress = () => {}) {
  checkConfig(config);
  requireThat(config.commands.length === 0 || approved, 'APPROVAL', 'Review command argv and explicitly approve execution with --approve-commands');
  const results = [];
  const evidenceDir = path.join(runDir, 'validation');
  requireThat(!exists(evidenceDir), 'INTEGRITY', 'Validation evidence directory must be fresh');
  fs.mkdirSync(ns(evidenceDir));
  for (const c of config.commands) {
    progress('validation: ' + c.name);
    const evidence = path.join(evidenceDir, c.name + '.tests.json');
    requireThat(!exists(evidence), 'INTEGRITY', 'Test evidence must be fresh');
    const argv = c.argv.map(a => a.replaceAll('{tool}', toolRoot).replaceAll('{evidence}', evidence).replaceAll('{reporter}', new URL('./node-reporter.mjs', import.meta.url).href));
    if (argv[0] === 'node') argv[0] = process.execPath;
    progress('approved argv: ' + JSON.stringify(argv));
    const env = { ...process.env, DCP_EVIDENCE: evidence }; delete env.NODE_TEST_CONTEXT;
    const r = run(argv[0], argv.slice(1), { cwd: repo, env,
      log: path.join(evidenceDir, c.name), timeout: c.timeoutMs ?? 120000 });
    succeeded(r, 'VALIDATION');
    let tests;
    if (c.kind === 'tests') {
      requireThat(exists(evidence) && fs.lstatSync(ns(evidence)).isFile() && !fs.lstatSync(ns(evidence)).isSymbolicLink(), 'VALIDATION', 'Test command did not produce fresh evidence');
      try { tests = testEvidence(readJson(evidence)); } catch (e) { throw e instanceof CheckpointError ? e : new CheckpointError('VALIDATION', 'Malformed test evidence'); }
    }
    results.push({ name: c.name, exitCode: r.exitCode, tests, status: 'PASS' });
  }
  return results;
}

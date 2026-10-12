import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { run, succeeded, gitEnv } from '../src/process.mjs';
import { inventory, exact } from '../src/inventory.mjs';
import { ns, digest } from '../src/common.mjs';

// Everything is synthetic. No existing repository or profile is touched.
const tool = fileURLToPath(new URL('../', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devcheckpoint-demo-'));
const repo = path.join(root, 'example-app'); fs.mkdirSync(repo);
fs.writeFileSync(path.join(repo, 'app.mjs'), "export const greeting = 'hello';\n");
fs.writeFileSync(path.join(repo, 'app.test.mjs'), "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { greeting } from './app.mjs';\ntest('greeting is nonempty', () => assert(greeting.length > 0));\n");
fs.writeFileSync(path.join(repo, '.gitignore'), 'private.local\n');
const g = args => succeeded(run('git', ['-C', repo, ...args], { env: gitEnv() }));
g(['init', '--quiet']); g(['config', 'user.name', 'Example Developer']); g(['config', 'user.email', 'example@example.invalid']);
g(['add', '.']); g(['-c', 'core.autocrlf=false', 'commit', '--quiet', '-m', 'Synthetic example']);
fs.writeFileSync(path.join(repo, 'local-note.txt'), 'Untracked work must survive.\n');
fs.writeFileSync(path.join(repo, 'private.local'), 'Synthetic ignored bytes only.\n');
const patch = path.join(root, 'greeting.patch'); fs.writeFileSync(patch, "diff --git a/app.mjs b/app.mjs\n--- a/app.mjs\n+++ b/app.mjs\n@@ -1 +1 @@\n-export const greeting = 'hello';\n+export const greeting = 'welcome';\n");
const config = path.join(tool, 'examples/checks.json'), backup = path.join(root, 'recovery'), steps = [];
function cli(args, expected = 0) {
  const r = run(process.execPath, [path.join(tool, 'bin/devcheckpoint.mjs'), ...args], { timeout: 180000 });
  assert.equal(r.exitCode, expected, r.stderr);
  const entry = { command: args[0], exitCode: r.exitCode, result: JSON.parse(expected === 0 ? r.stdout : r.stderr.slice(r.stderr.indexOf('{'))) };
  steps.push(entry); console.log(`${args[0]}: ${entry.result.status}`); return entry;
}
const baseline = inventory(repo), common = ['--repo', repo, '--backup-dir', backup];
cli(['plan', '--repo', repo, '--patch', patch, '--config', config]); exact(inventory(repo), baseline);
cli(['backup', ...common]); cli(['rehearse', ...common, '--patch', patch, '--config', config, '--approve-commands']);
cli(['apply', ...common, '--confirm', '--approve-commands']); assert.match(fs.readFileSync(path.join(repo, 'app.mjs'), 'utf8'), /welcome/);
cli(['restore', ...common, '--confirm']); exact(inventory(repo), baseline);

// A reviewed synthetic validator succeeds in rehearsal but deliberately fails
// on the real synthetic path, demonstrating apply-time automatic restoration.
const failureConfig = path.join(root, 'failure-checks.json');
fs.writeFileSync(failureConfig, JSON.stringify({ version: 1, commands: [{ name: 'deliberate_failure', kind: 'command', argv: ['node', '-e', `process.exit(process.cwd() === ${JSON.stringify(repo)} ? 23 : 0)`] }] }));
const failedBackup = path.join(root, 'failure-recovery'), failureCommon = ['--repo', repo, '--backup-dir', failedBackup];
cli(['backup', ...failureCommon]); cli(['rehearse', ...failureCommon, '--patch', patch, '--config', failureConfig, '--approve-commands']);
const failure = cli(['apply', ...failureCommon, '--confirm', '--approve-commands'], 7); assert.equal(failure.result.details.recovery, 'RESTORED');
exact(inventory(repo), baseline);
const report = { status: 'EXAMPLE_PASS', steps: steps.map(s => ({ command: s.command, exitCode: s.exitCode, status: s.result.status })), exactFinalBytes: true, originalInventorySha256: digest(baseline), finalInventorySha256: digest(inventory(repo)) };
fs.writeFileSync(path.join(root, 'demo-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('Synthetic example and private evidence retained at: ' + root);

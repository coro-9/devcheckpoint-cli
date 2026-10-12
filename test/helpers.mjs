import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { run, succeeded, gitEnv } from '../src/process.mjs';
import { ns } from '../src/common.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'devcheckpoint-test-')), repo = path.join(base, 'example project');
  fs.mkdirSync(repo); fs.writeFileSync(path.join(repo, 'value.txt'), 'one\n'); fs.writeFileSync(path.join(repo, 'keep.txt'), 'preserved\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'private.local\n');
  const g = args => succeeded(run('git', ['-c', 'core.autocrlf=false', '-C', repo, ...args], { env: gitEnv() })).stdout;
  g(['init', '--quiet']); g(['config', 'user.name', 'Example Developer']); g(['config', 'user.email', 'example@example.invalid']);
  g(['add', '.']); g(['commit', '--quiet', '-m', 'Synthetic baseline']);
  const patch = path.join(base, 'change.patch');
  fs.writeFileSync(patch, diff('value.txt', 'one', 'two'));
  return { base, repo, patch, backupDir: path.join(base, 'snapshot'), g,
    cleanup() { if (path.dirname(base) !== os.tmpdir() || !path.basename(base).startsWith('devcheckpoint-test-')) throw Error('Invalid fixture root'); fs.rmSync(ns(base), { recursive: true, force: true }); } };
}
export const diff = (file, before, after) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-${before}\n+${after}\n`;
export function cli(args, options = {}) { return run(process.execPath, [path.join(root, 'bin/devcheckpoint.mjs'), ...args], { timeout: 120000, ...options }); }
export function config(f, commands) { const p = path.join(f.base, 'validation.json'); fs.writeFileSync(p, JSON.stringify({ version: 1, commands })); return p; }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
let checked = 0;
for (const dir of ['src', 'bin', 'test', 'examples', 'scripts']) {
  for (const f of fs.readdirSync(path.join(root, dir)).filter(n => n.endsWith('.mjs'))) {
    const r = spawnSync(process.execPath, ['--check', path.join(root, dir, f)], { encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, r.stderr); checked++;
  }
}
const p = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
assert.equal(p.license, 'MIT'); assert.equal(Object.keys(p.dependencies ?? {}).length, 0);
assert(fs.readFileSync(path.join(root, p.bin.devcheckpoint), 'utf8').startsWith('#!/usr/bin/env node'));
for (const file of ['README.md', 'ARCHITECTURE.md', 'SECURITY.md', 'LIMITATIONS.md', 'CONTRIBUTING.md', 'LICENSE', 'docs/README.ar.md', 'docs/codex.md']) assert(fs.statSync(path.join(root, file)).size > 100);
console.log(`CHECK_PASS: ${checked} JavaScript modules; executable entry, zero runtime dependencies and required documents verified.`);

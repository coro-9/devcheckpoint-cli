import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url)), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const dirs = ['bin', 'src', 'test', 'examples', 'docs', 'scripts'];
const files = ['package.json', '.gitignore', 'README.md', 'ARCHITECTURE.md', 'SECURITY.md', 'LIMITATIONS.md', 'CONTRIBUTING.md', 'LICENSE'];
function walk(relative) {
  for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
    const key = relative + '/' + name, stat = fs.lstatSync(path.join(root, key)); assert(!stat.isSymbolicLink());
    if (stat.isDirectory()) walk(key); else { assert(stat.isFile()); files.push(key); }
  }
}
dirs.forEach(walk); files.sort();
const entries = files.map(p => { const b = fs.readFileSync(path.join(root, p)); return { path: p, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') }; });
const out = path.join(root, 'artifacts'); fs.mkdirSync(out, { recursive: true });
const zip = path.join(out, `${pkg.name}-${pkg.version}.zip`); assert(!fs.existsSync(zip), 'Archive exists; choose a new version or move the reviewed archive before rebuilding');
assert.equal(process.platform, 'win32', 'ZIP helper currently requires Windows PowerShell; runtime portability is separate');
const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/package.ps1')],
  { input: JSON.stringify({ root, zip, prefix: `${pkg.name}-${pkg.version}`, entries }), encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
assert.equal(r.status, 0, r.stderr); const verification = JSON.parse(r.stdout);
assert.equal(verification.entries, entries.length); assert.equal(verification.verified, true);
const result = { version: pkg.version, files: entries, zipBytes: fs.statSync(zip).size, zipSha256: crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex'), readBackVerified: true };
fs.writeFileSync(path.join(out, 'PUBLIC_MANIFEST.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'ZIP_PASS', zip, files: entries.length, bytes: result.zipBytes, sha256: result.zipSha256 }, null, 2));

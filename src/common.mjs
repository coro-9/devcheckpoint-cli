import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class CheckpointError extends Error {
  constructor(code, message, details = {}) { super(message); this.code = code; this.details = details; }
}
export function requireThat(test, code, message) { if (!test) throw new CheckpointError(code, message); }
export const ns = p => path.toNamespacedPath(path.resolve(p));
export const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const digest = value => sha(json(value));
export const readJson = file => JSON.parse(fs.readFileSync(ns(file), 'utf8').replace(/^\uFEFF/, ''));
export const exists = file => { try { fs.lstatSync(ns(file)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function relativeKey(p) {
  requireThat(typeof p === 'string' && p.length > 0 && !/[\\:\x00-\x1f<>"|?*]/.test(p)
    && p.split('/').every(x => x && x !== '.' && x !== '..' && !/[. ]$/.test(x)), 'UNSUPPORTED', 'Unsupported relative path');
  return p;
}
export function inside(root, key) { return path.join(root, ...relativeKey(key).split('/')); }
export function noLinksInPath(target) {
  const full = path.resolve(target); let cur = path.parse(full).root;
  for (const part of full.slice(cur.length).split(path.sep).filter(Boolean)) {
    cur = path.join(cur, part);
    if (exists(cur)) requireThat(!fs.lstatSync(ns(cur)).isSymbolicLink(), 'UNSUPPORTED', 'Linked path components are not supported');
  }
  return full;
}
export function outside(repo, target) {
  const r = noLinksInPath(repo), t = noLinksInPath(target);
  const rel = path.relative(r, t);
  requireThat(rel && (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)), 'UNSUPPORTED', 'Recovery data must be outside the repository');
  const reverse = path.relative(t, r);
  requireThat(reverse === '..' || reverse.startsWith('..' + path.sep) || path.isAbsolute(reverse), 'UNSUPPORTED', 'Recovery directory cannot contain the repository');
  return t;
}
export function atomic(file, bytes) {
  bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  noLinksInPath(file);
  const temporary = file + '.pending-' + crypto.randomUUID();
  let fd;
  try {
    fd = fs.openSync(ns(temporary), 'wx', 0o600); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(ns(temporary), ns(file));
    requireThat(fs.readFileSync(ns(file)).equals(bytes), 'INTEGRITY', 'Atomic write read-back failed');
  } finally { if (fd !== undefined) fs.closeSync(fd); if (exists(temporary)) fs.unlinkSync(ns(temporary)); }
}
export function seal(file, value) { atomic(file, json(value)); atomic(file + '.sha256', sha(fs.readFileSync(ns(file))) + '\n'); }
export function unseal(file) {
  noLinksInPath(file); noLinksInPath(file + '.sha256');
  const bytes = fs.readFileSync(ns(file));
  requireThat(sha(bytes) === fs.readFileSync(ns(file + '.sha256'), 'utf8').trim(), 'INTEGRITY', 'Manifest digest mismatch');
  return JSON.parse(bytes);
}

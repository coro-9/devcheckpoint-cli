import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireThat, ns, noLinksInPath, relativeKey, inside, same } from './common.mjs';
import { checkWindowsEntries } from './windows.mjs';

const stamp = s => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.mode].join('|');
export function fileHash(file) {
  const initial = fs.lstatSync(ns(file), { bigint: true });
  requireThat(initial.isFile() && initial.nlink === 1n, 'UNSUPPORTED', 'Only ordinary files with one hard link are supported');
  const fd = fs.openSync(ns(file), 'r'), hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    requireThat(stamp(initial) === stamp(fs.fstatSync(fd, { bigint: true })), 'DRIFT', 'File replaced before hashing');
    let bytes = 0, n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) { hash.update(buffer.subarray(0, n)); bytes += n; }
    requireThat(BigInt(bytes) === initial.size && stamp(initial) === stamp(fs.fstatSync(fd, { bigint: true }))
      && stamp(initial) === stamp(fs.lstatSync(ns(file), { bigint: true })), 'DRIFT', 'File changed while hashing');
    return { bytes, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}
export function indexRows(rows) {
  requireThat(Array.isArray(rows), 'INTEGRITY', 'Invalid inventory');
  const result = new Map(), folded = new Set();
  for (const r of rows) {
    const key = relativeKey(r.path), fold = key.toLowerCase();
    requireThat(!result.has(key) && !folded.has(fold), 'INTEGRITY', 'Duplicate or case-colliding path');
    requireThat(['file', 'directory', 'link'].includes(r.kind), 'INTEGRITY', 'Unsupported inventory kind');
    if (r.kind === 'file') requireThat(Number.isSafeInteger(r.bytes) && r.bytes >= 0 && /^[a-f0-9]{64}$/.test(r.sha256)
      && Number.isInteger(r.mode) && r.mode >= 0 && r.mode <= 0o777, 'INTEGRITY', 'Invalid file record');
    if (r.kind === 'link') requireThat(typeof r.target === 'string' && !r.target.includes('\0'), 'INTEGRITY', 'Invalid link record');
    result.set(key, r); folded.add(fold);
  }
  for (const key of result.keys()) { const parent = path.posix.dirname(key); if (parent !== '.') requireThat(result.get(parent)?.kind === 'directory', 'INTEGRITY', 'Missing directory or traversal through link'); }
  return result;
}
export function inventory(root) {
  noLinksInPath(root);
  const rows = [], dirs = [], metadata = [{ path: ns(root), kind: 'directory' }];
  function walk(relative = '') {
    const dir = relative ? inside(root, relative) : root, before = fs.lstatSync(ns(dir), { bigint: true });
    requireThat(before.isDirectory() && !before.isSymbolicLink(), 'UNSUPPORTED', 'Not an ordinary directory');
    const names = fs.readdirSync(ns(dir)).sort(); dirs.push({ dir, names, stamp: stamp(before) });
    for (const name of names) {
      const key = relativeKey(relative ? relative + '/' + name : name), file = inside(root, key), stat = fs.lstatSync(ns(file));
      if (stat.isSymbolicLink()) rows.push({ path: key, kind: 'link', target: fs.readlinkSync(ns(file)) });
      else if (stat.isDirectory()) { rows.push({ path: key, kind: 'directory' }); walk(key); }
      else { requireThat(stat.isFile(), 'UNSUPPORTED', 'Sockets/devices/FIFOs are unsupported'); rows.push({ path: key, kind: 'file', ...fileHash(file), mode: stat.mode & 0o777 }); }
      metadata.push({ path: ns(file), kind: stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : 'file' });
    }
  }
  walk(); checkWindowsEntries(metadata);
  for (const d of dirs) requireThat(stamp(fs.lstatSync(ns(d.dir), { bigint: true })) === d.stamp && same(fs.readdirSync(ns(d.dir)).sort(), d.names), 'DRIFT', 'Directory changed during enumeration');
  rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0); indexRows(rows); return rows;
}
export function difference(a, b) {
  const am = indexRows(a), bm = indexRows(b);
  return [...new Set([...am.keys(), ...bm.keys()])].filter(p => !same(am.get(p), bm.get(p))).sort();
}
export function exact(a, b) { requireThat(difference(a, b).length === 0, 'DRIFT', 'Inventory mismatch; repository or backup has changed'); }
export function requireNoLinks(rows) { requireThat(!rows.some(r => r.kind === 'link'), 'UNSUPPORTED', 'Backup records links without following them; rehearsal/apply currently require a link-free repository'); }

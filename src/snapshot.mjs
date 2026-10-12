import fs from 'node:fs';
import path from 'node:path';
import { ns, inside, outside, requireThat, exists, seal, unseal, same, noLinksInPath, sha } from './common.mjs';
import { privateDirectory } from './process.mjs';
import { inventory, indexRows, exact, fileHash, requireNoLinks } from './inventory.mjs';
import { repository } from './repository.mjs';

export function putObjects(source, rows, objects) {
  fs.mkdirSync(ns(objects), { recursive: true, mode: 0o700 });
  for (const r of rows.filter(x => x.kind === 'file')) {
    const target = path.join(objects, r.sha256);
    if (!exists(target)) {
      fs.copyFileSync(ns(inside(source, r.path)), ns(target), fs.constants.COPYFILE_EXCL);
      fs.chmodSync(ns(target), 0o600);
      const fd = fs.openSync(ns(target), 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    requireThat(same(fileHash(target), { bytes: r.bytes, sha256: r.sha256 }), 'INTEGRITY', 'Snapshot object mismatch');
  }
}
export function backup(repo, destination) {
  const identity = repository(repo); repo = identity.root; destination = outside(repo, destination);
  requireThat(!exists(destination), 'USAGE', 'Backup destination must not exist');
  const rows = inventory(repo);
  privateDirectory(destination);
  putObjects(repo, rows, path.join(destination, 'objects'));
  exact(inventory(repo), rows);
  const after = repository(repo);
  requireThat(same(after, identity), 'DRIFT', 'Git state changed during backup');
  const manifest = { version: 1, kind: 'complete-content-snapshot', repo, head: identity.head,
    gitStatusSha256: sha(identity.statusSha256Input), entries: rows, createdAt: new Date().toISOString() };
  seal(path.join(destination, 'snapshot.json'), manifest);
  verifyBackup(destination);
  return { status: 'BACKUP_PASS', backup: destination, entries: rows.length, bytes: rows.reduce((n, r) => n + (r.bytes ?? 0), 0) };
}
export function verifyBackup(dir) {
  noLinksInPath(dir);
  const m = unseal(path.join(dir, 'snapshot.json'));
  requireThat(m.version === 1 && m.kind === 'complete-content-snapshot' && path.isAbsolute(m.repo), 'INTEGRITY', 'Unsupported snapshot schema');
  outside(m.repo, dir); indexRows(m.entries);
  const objects = path.join(dir, 'objects'); noLinksInPath(objects);
  const expected = [...new Set(m.entries.filter(r => r.kind === 'file').map(r => r.sha256))].sort();
  requireThat(same(fs.readdirSync(ns(objects)).sort(), expected), 'INTEGRITY', 'Snapshot object set mismatch');
  for (const r of m.entries.filter(r => r.kind === 'file')) requireThat(same(fileHash(path.join(objects, r.sha256)), { bytes: r.bytes, sha256: r.sha256 }), 'INTEGRITY', 'Snapshot bytes do not match manifest');
  return m;
}
export function reconstruct(dir, m, target) {
  requireNoLinks(m.entries); requireThat(!exists(target), 'USAGE', 'Reconstruction destination exists'); noLinksInPath(target);
  fs.mkdirSync(ns(target), { mode: 0o700 });
  for (const r of m.entries.filter(r => r.kind === 'directory').sort((a,b) => a.path.length - b.path.length)) fs.mkdirSync(ns(inside(target, r.path)));
  for (const r of m.entries.filter(r => r.kind === 'file')) {
    const dest = inside(target, r.path); fs.copyFileSync(ns(path.join(dir, 'objects', r.sha256)), ns(dest), fs.constants.COPYFILE_EXCL); fs.chmodSync(ns(dest), r.mode);
  }
  exact(inventory(target), m.entries);
}

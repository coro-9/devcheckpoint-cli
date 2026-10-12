import fs from 'node:fs';
import path from 'node:path';
import { ns, inside, outside, requireThat, exists, seal, unseal, same, noLinksInPath, sha } from './common.mjs';
import { privateDirectory } from './process.mjs';
import { inventory, indexRows, exact, fileHash, requireNoLinks } from './inventory.mjs';
import { repository } from './repository.mjs';
import { requireSpace, treeBytes, metadataBytes } from './space.mjs';

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
  requireSpace([{ path: destination, bytes: treeBytes(rows, true) + metadataBytes(rows), purpose: 'complete backup' }]);
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
export function readSnapshotMetadata(dir) {
  noLinksInPath(dir);
  const m = unseal(path.join(dir, 'snapshot.json'));
  requireThat(m.version === 1 && m.kind === 'complete-content-snapshot' && typeof m.repo === 'string' && path.isAbsolute(m.repo)
    && /^[a-f0-9]{40,64}$/.test(m.head) && /^[a-f0-9]{64}$/.test(m.gitStatusSha256)
    && typeof m.createdAt === 'string' && Number.isFinite(Date.parse(m.createdAt)), 'INTEGRITY', 'Unsupported snapshot schema');
  // Metadata inspection must not visit the recorded live repository.
  for (const [a, b] of [[m.repo, dir], [dir, m.repo]]) {
    const rel = path.relative(path.resolve(a), path.resolve(b));
    requireThat(rel && (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)), 'UNSUPPORTED', 'Recovery data must be outside the repository');
  }
  indexRows(m.entries);
  return m;
}
export function verifyBackup(dir, { inspectRepoPath = true } = {}) {
  const m = readSnapshotMetadata(dir);
  if (inspectRepoPath) outside(m.repo, dir);
  const objects = path.join(dir, 'objects'); noLinksInPath(objects);
  const expected = [...new Set(m.entries.filter(r => r.kind === 'file').map(r => r.sha256))].sort();
  requireThat(same(fs.readdirSync(ns(objects)).sort(), expected), 'INTEGRITY', 'Snapshot object set mismatch');
  for (const r of m.entries.filter(r => r.kind === 'file')) requireThat(same(fileHash(path.join(objects, r.sha256)), { bytes: r.bytes, sha256: r.sha256 }), 'INTEGRITY', 'Snapshot bytes do not match manifest');
  return m;
}
export function reconstruct(dir, m, target) {
  copyTree(m.entries, target, r => path.join(dir, 'objects', r.sha256));
}
// Plan needs one disposable copy, not an additional recovery object store.
export function copyWorkingTree(repo, rows, target) {
  copyTree(rows, target, r => inside(repo, r.path));
  exact(inventory(repo), rows);
}
function copyTree(rows, target, source) {
  requireNoLinks(rows); requireThat(!exists(target), 'USAGE', 'Reconstruction destination exists'); noLinksInPath(target);
  requireSpace([{ path: target, bytes: treeBytes(rows), purpose: 'disposable reconstruction' }]);
  fs.mkdirSync(ns(target), { mode: 0o700 });
  for (const r of rows.filter(r => r.kind === 'directory').sort((a,b) => a.path.length - b.path.length)) fs.mkdirSync(ns(inside(target, r.path)));
  for (const r of rows.filter(r => r.kind === 'file')) {
    const dest = inside(target, r.path); fs.copyFileSync(ns(source(r)), ns(dest), fs.constants.COPYFILE_EXCL); fs.chmodSync(ns(dest), r.mode);
  }
  exact(inventory(target), rows);
}

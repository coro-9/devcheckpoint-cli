import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ns, sha, json, requireThat, readJson, exists, noLinksInPath, seal } from './common.mjs';
import { privateDirectory } from './process.mjs';

export function journal(dir, event, details = {}) {
  const file = path.join(dir, 'journal.jsonl'); noLinksInPath(file);
  const fd = fs.openSync(ns(file), 'a', 0o600);
  try { fs.writeFileSync(fd, json({ at: new Date().toISOString(), event, ...details }).replace(/\n\s*/g, '') + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
export function state(dir, value) { seal(path.join(dir, 'state.json'), value); journal(dir, value.phase); }
export function locked(repo, recover, fn) {
  const locks = path.join(os.tmpdir(), 'devcheckpoint-locks');
  noLinksInPath(locks); if (!exists(locks)) privateDirectory(locks);
  const file = path.join(locks, sha(path.resolve(repo).toLowerCase()) + '.json'); noLinksInPath(file);
  if (exists(file) && recover) {
    const old = readJson(file);
    requireThat(Number.isInteger(old.pid) && old.pid > 0, 'LOCKED', 'Invalid lock; manual reconciliation required');
    let alive = true;
    try { process.kill(old.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
    requireThat(!alive, 'LOCKED', 'Lock owner still exists or its identity is uncertain');
    fs.unlinkSync(ns(file));
  }
  let fd;
  try { fd = fs.openSync(ns(file), 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') requireThat(false, 'LOCKED', 'Another operation or interrupted transaction holds the lock; inspect it before --recover-lock'); throw e; }
  try { fs.writeFileSync(fd, json({ pid: process.pid, repo, at: new Date().toISOString() })); fs.fsyncSync(fd); return fn(); }
  finally { fs.closeSync(fd); fs.unlinkSync(ns(file)); }
}

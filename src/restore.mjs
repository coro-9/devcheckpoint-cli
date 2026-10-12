import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireThat, ns, same, inside, noLinksInPath, seal } from './common.mjs';
import { inventory, indexRows, difference, exact, requireNoLinks } from './inventory.mjs';
import { putObjects } from './snapshot.mjs';
import { journal } from './journal.mjs';

// Recovery only accepts bytes already observed/approved in this transaction.
// Unknown edits are never overwritten, even on a path touched by a patch.
export function restoreKnown(root, snapshotDir, baseline, allowedStates, runDir) {
  requireNoLinks(baseline);
  const current = inventory(root), actual = indexRows(current), old = indexRows(baseline);
  const states = [baseline, ...allowedStates].map(indexRows);
  const all = new Set([...actual.keys(), ...states.flatMap(s => [...s.keys()])]);
  for (const p of all) requireThat(states.some(s => same(s.get(p), actual.get(p))), 'RECOVERY_REQUIRED', 'Unknown repository drift; preserve it and reconcile before restore');
  const changed = difference(current, baseline);
  const recoveryDir = path.join(runDir, 'recovery-' + crypto.randomUUID());
  fs.mkdirSync(ns(recoveryDir));
  putObjects(root, current.filter(r => r.kind === 'file' && changed.includes(r.path)), path.join(recoveryDir, 'objects'));
  seal(path.join(recoveryDir, 'pre-restore.json'), { entries: current, changed });
  exact(inventory(root), current); journal(runDir, 'RESTORE_STARTED', { changed: changed.length });
  // Remove only verified changed entries, leaf first. Never recursive-delete an owner directory.
  for (const p of changed.sort((a,b) => b.length - a.length)) {
    const a = actual.get(p), b = old.get(p); if (!a || (a.kind === 'directory' && b?.kind === 'directory')) continue;
    const target = inside(root, p); noLinksInPath(target);
    if (a.kind === 'directory') fs.rmdirSync(ns(target)); else fs.unlinkSync(ns(target));
  }
  for (const p of changed.sort((a,b) => a.length - b.length)) {
    const r = old.get(p); if (!r) continue;
    const target = inside(root, p); noLinksInPath(target);
    if (r.kind === 'directory') { if (!fs.existsSync(ns(target))) fs.mkdirSync(ns(target)); }
    else { fs.copyFileSync(ns(path.join(snapshotDir, 'objects', r.sha256)), ns(target), fs.constants.COPYFILE_EXCL); fs.chmodSync(ns(target), r.mode); }
  }
  exact(inventory(root), baseline); journal(runDir, 'RESTORE_VERIFIED');
  return { status: 'RESTORED', changed: changed.length };
}

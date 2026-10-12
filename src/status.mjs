import fs from 'node:fs';
import path from 'node:path';
import { ns, exists, noLinksInPath, requireThat, unseal, digest, sha, same } from './common.mjs';
import { readSnapshotMetadata, verifyBackup } from './snapshot.mjs';
import { receipt } from './engine.mjs';
import { indexRows, inventory, difference } from './inventory.mjs';
import { repository } from './repository.mjs';
import { testEvidence } from './validation.mjs';

const phases = ['APPLYING', 'VALIDATING', 'APPLIED', 'ROLLED_BACK', 'RECOVERY_REQUIRED', 'RESTORED'];
const events = [...phases, 'REHEARSAL_STARTED', 'PATCH_INTENT', 'PATCH_VERIFIED', 'RESTORE_STARTED', 'RESTORE_VERIFIED', 'RESTORED_WORKSPACE_REMOVED', 'REHEARSAL_PASS', 'REHEARSAL_FAILED'];
const runPattern = /^(?:rehearsal|apply)-[a-f0-9-]+$/;
function results(rows, config) {
  requireThat(Array.isArray(rows) && rows.length === config.commands.length, 'INTEGRITY', 'Incomplete recorded validation results');
  return rows.map((r, i) => {
    requireThat(r.name === config.commands[i].name && r.status === 'PASS' && r.exitCode === 0, 'INTEGRITY', 'Invalid recorded validation result');
    if (config.commands[i].kind === 'tests') testEvidence(r.tests);
    else requireThat(r.tests === undefined, 'INTEGRITY', 'Unexpected test attribution');
    return { name: r.name, status: r.status, ...(r.tests ? { tests: r.tests } : {}) };
  });
}
export function inspectStatus(options) {
  requireThat(!options.repo || options.verify, 'USAGE', '--repo on status requires --verify');
  const dir = noLinksInPath(path.resolve(options.backupDir));
  const observed = new Map();
  const observe = file => { noLinksInPath(file); requireThat(fs.lstatSync(ns(file)).isFile(), 'INTEGRITY', 'Metadata must be an ordinary file'); observed.set(file, sha(fs.readFileSync(ns(file)))); };
  const sealed = file => { observe(file); observe(file + '.sha256'); return unseal(file); };
  const listing = folder => { noLinksInPath(folder); return fs.readdirSync(ns(folder)).sort(); };
  const top = listing(dir);
  let pendingMetadata = top.some(n => n.includes('.pending-'));
  observe(path.join(dir, 'snapshot.json')); observe(path.join(dir, 'snapshot.json.sha256'));
  const m = options.verify ? verifyBackup(dir, { inspectRepoPath: false }) : readSnapshotMetadata(dir);
  const hasReceipt = exists(path.join(dir, 'rehearsal.json'));
  requireThat(hasReceipt === exists(path.join(dir, 'rehearsal.json.sha256')), 'INTEGRITY', 'Incomplete rehearsal seal');
  let r, tx, latest;
  if (hasReceipt) {
    sealed(path.join(dir, 'rehearsal.json')); r = receipt(dir, m);
    const changed = difference(m.entries, r.stages.at(-1));
    requireThat(Array.isArray(r.expectedPaths) && new Set(r.expectedPaths).size === r.expectedPaths.length
      && r.expectedPaths.every(p => typeof p === 'string') && changed.every(p => r.expectedPaths.includes(p) || r.stages.at(-1).find(row => row.path === p)?.kind === 'directory'), 'INTEGRITY', 'Inconsistent rehearsal change summary');
    results(r.results, r.config);
    for (const p of r.patches) observe(path.join(dir, r.run, p.name));
  }
  const hasTx = exists(path.join(dir, 'transaction.json'));
  requireThat(hasTx === exists(path.join(dir, 'transaction.json.sha256')), 'INTEGRITY', 'Incomplete transaction seal');
  if (hasTx) {
    requireThat(r, 'INTEGRITY', 'Transaction is missing its rehearsal');
    tx = sealed(path.join(dir, 'transaction.json'));
    requireThat(tx.version === 1 && tx.repo === m.repo && tx.snapshotSha256 === digest(m) && tx.phase === 'APPLYING'
      && /^apply-[a-f0-9-]+$/.test(tx.run), 'INTEGRITY', 'Transaction identity mismatch');
    latest = sealed(path.join(dir, tx.run, 'state.json'));
    requireThat(latest.version === 1 && latest.repo === tx.repo && latest.run === tx.run && latest.snapshotSha256 === tx.snapshotSha256
      && phases.includes(latest.phase), 'INTEGRITY', 'Invalid transaction state');
    if (latest.phase === 'APPLIED') results(latest.results, r.config);
  }
  const runs = [];
  for (const name of top.filter(n => /^(?:rehearsal|apply)-/.test(n))) {
    requireThat(runPattern.test(name), 'INTEGRITY', 'Malformed run directory');
    const runDir = path.join(dir, name), names = listing(runDir), journalFile = path.join(runDir, 'journal.jsonl');
    pendingMetadata ||= names.some(n => n.includes('.pending-'));
    let entries = [];
    if (exists(journalFile)) {
      observe(journalFile);
      const text = fs.readFileSync(ns(journalFile), 'utf8');
      requireThat(text.endsWith('\n'), 'INTEGRITY', 'Incomplete journal record');
      entries = text.trimEnd().split('\n').map(line => JSON.parse(line));
      requireThat(entries.every(e => e && typeof e.at === 'string' && Number.isFinite(Date.parse(e.at)) && events.includes(e.event)), 'INTEGRITY', 'Invalid journal');
    }
    let phase = entries.at(-1)?.event ?? 'INCOMPLETE';
    if (name === tx?.run) {
      requireThat(phase === latest.phase, 'INTEGRITY', 'State and journal disagree; interrupted update requires reconciliation');
      phase = latest.phase;
    } else requireThat(!name.startsWith('apply-'), 'INTEGRITY', 'Orphan transaction directory');
    if (name === r?.run) requireThat(phase === 'REHEARSAL_PASS', 'INTEGRITY', 'Rehearsal receipt and journal disagree');
    if (phase === 'REHEARSAL_PASS') requireThat(name === r?.run, 'INTEGRITY', 'Successful journal without a receipt');
    for (const recovery of names.filter(n => n.startsWith('recovery-'))) {
      requireThat(/^recovery-[a-f0-9-]+$/.test(recovery), 'INTEGRITY', 'Malformed recovery directory');
      const file = path.join(runDir, recovery, 'pre-restore.json');
      if (!exists(file) && !exists(file + '.sha256')) { phase = 'INCOMPLETE_RECOVERY'; continue; }
      const pre = sealed(file); indexRows(pre.entries);
      requireThat(Array.isArray(pre.changed) && same([...pre.changed].sort(), difference(pre.entries, m.entries)), 'INTEGRITY', 'Invalid recovery metadata');
    }
    requireThat(same(names, listing(runDir)), 'DRIFT', 'Checkpoint metadata changed during inspection');
    runs.push({ evidence: name, recordedState: phase, journalRecords: entries.length });
  }
  if (r) requireThat(runs.some(x => x.evidence === r.run), 'INTEGRITY', 'Missing rehearsal evidence');
  if (tx) requireThat(runs.some(x => x.evidence === tx.run), 'INTEGRITY', 'Missing transaction evidence');
  const incomplete = pendingMetadata || runs.some(x => !['REHEARSAL_PASS', 'REHEARSAL_FAILED', 'APPLIED', 'RESTORED', 'ROLLED_BACK'].includes(x.recordedState));
  const failed = runs.some(x => ['REHEARSAL_FAILED', 'ROLLED_BACK'].includes(x.recordedState));
  let checkout = { verification: 'NOT_INSPECTED' };
  if (options.repo) {
    const repo = path.resolve(options.repo);
    requireThat(repo === m.repo, 'INTEGRITY', 'Explicit repository does not match the snapshot identity');
    const id = repository(repo), rows = inventory(repo);
    requireThat(id.head === m.head, 'DRIFT', 'Repository HEAD differs from the snapshot');
    const expected = latest?.phase === 'APPLIED' ? r.stages.at(-1) : m.entries;
    if (!incomplete) {
      requireThat(difference(rows, expected).length === 0, 'DRIFT', 'Current checkout differs from its recorded baseline/postimage');
      if (expected === m.entries) requireThat(sha(id.statusSha256Input) === m.gitStatusSha256, 'DRIFT', 'Repository Git status differs from baseline');
      checkout = { verification: 'EXACT_MATCH', comparedWith: latest?.phase === 'APPLIED' ? 'postimage' : 'baseline' };
    } else {
      checkout = { verification: 'INCOMPLETE_TRANSACTION', matchesKnownWholeState: [m.entries, ...(r?.stages ?? [])].some(s => difference(rows, s).length === 0) };
    }
  }
  for (const [file, hash] of observed) requireThat(sha(fs.readFileSync(ns(file))) === hash, 'DRIFT', 'Checkpoint metadata changed during inspection');
  requireThat(same(top, listing(dir)), 'DRIFT', 'Checkpoint directory changed during inspection');
  return { status: 'STATUS', recordedState: incomplete ? 'INCOMPLETE' : latest?.phase ?? (r ? 'REHEARSED' : failed ? 'REHEARSAL_FAILED' : 'BACKUP_ONLY'),
    verification: options.verify ? 'FULL_BACKUP_VERIFIED' : 'METADATA_ONLY',
    snapshot: { entries: m.entries.length, bytes: m.entries.reduce((n, row) => n + (row.bytes ?? 0), 0), createdAt: m.createdAt, head: m.head },
    ...(r ? { rehearsal: { changedFiles: r.expectedPaths.length, validationScope: r.validationScope, results: results(r.results, r.config) } } : {}),
    ...(latest?.phase === 'APPLIED' ? { appliedResults: results(latest.results, r.config) } : {}), runs, checkout,
    limitations: ['Recorded state is not authorization or proof that restoration is safe.', ...(options.verify ? [] : ['Content objects have not been rehashed.']), 'No locks are acquired; stop writers for a stable inspection.', ...(incomplete || failed ? ['Failure or incomplete evidence exists; inspect privately before any new operation.'] : [])] };
}

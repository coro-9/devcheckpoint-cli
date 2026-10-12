import fs from 'node:fs';
import path from 'node:path';
import { ns, exists, noLinksInPath, requireThat, CheckpointError } from './common.mjs';

export const reserveBytes = 64 * 1024 * 1024;
// Conservative file-length estimate plus per-entry metadata/allocation allowance.
// Free space is a momentary check, not a reservation or a command-output bound.
export function treeBytes(rows, unique = false) {
  const seen = new Set(); let bytes = rows.length * 4096;
  for (const r of rows) if (r.kind === 'file' && (!unique || !seen.has(r.sha256))) { bytes += r.bytes; seen.add(r.sha256); }
  requireThat(Number.isSafeInteger(bytes), 'SPACE', 'Disk estimate exceeds supported integer range');
  return bytes;
}
export function patchBytes(patches) {
  return patches.reduce((n, p) => n + fs.statSync(ns(p)).size + 4096, 0);
}
export function metadataBytes(rows, stages = 1) { return Buffer.byteLength(JSON.stringify(rows)) * (stages + 4) + reserveBytes; }

export function requireSpace(requests) {
  const volumes = new Map();
  for (const request of requests) {
    requireThat(Number.isSafeInteger(request.bytes) && request.bytes >= 0, 'SPACE', 'Invalid disk estimate');
    let existing = noLinksInPath(request.path);
    while (!exists(existing)) { const parent = path.dirname(existing); requireThat(parent !== existing, 'SPACE', 'No existing parent for disk-space check'); existing = parent; }
    if (!fs.lstatSync(ns(existing)).isDirectory()) existing = path.dirname(existing);
    let stat, volume;
    try { stat = fs.statfsSync(ns(existing), { bigint: true }); volume = fs.statSync(ns(existing)).dev; }
    catch { throw new CheckpointError('SPACE', 'Cannot establish available disk space; no expensive operation started'); }
    requireThat(stat.bsize > 0n && stat.bavail >= 0n, 'SPACE', 'Invalid available-space result');
    const available = stat.bavail * stat.bsize, prior = volumes.get(volume);
    volumes.set(volume, { path: existing, available: prior && prior.available < available ? prior.available : available,
      required: (prior?.required ?? 0n) + BigInt(request.bytes), purposes: [...(prior?.purposes ?? []), request.purpose] });
  }
  for (const v of volumes.values()) {
    const required = v.required + BigInt(reserveBytes);
    if (v.available < required) throw new CheckpointError('SPACE', 'Insufficient free disk space; operation refused before its file writes',
      { volumePath: v.path, requiredBytes: required.toString(), availableBytes: v.available.toString(), purposes: v.purposes });
  }
}

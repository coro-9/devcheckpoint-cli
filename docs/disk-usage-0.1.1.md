# Disk usage polish — 0.1.1

## Changes

- One-patch `plan` uses read-only Git applicability checking, copied-patch hash verification and unchanged-owner inventory/Git checks. It creates only the small private patch/diagnostic files. It explicitly reports that exact postimages still require rehearsal.
- Ordered multi-patch planning still applies the sequence in a complete disposable working copy. It no longer builds an additional temporary snapshot object store. The copy and original tree are checked against the complete inventory.
- A successful rehearsal removes its disposable workspace only after restoration and exact byte verification. The complete snapshot, receipt, copied patches, logs, journal and recovery objects remain. Failed workspaces remain too.
- Free-space checks precede backup, reconstruction, rehearsal, apply and restore writes. Demands sharing a volume are combined. Insufficient or unverifiable space fails closed with exit code 10. Estimates include conservative headroom; they do not reserve capacity or predict arbitrary command output.
- ZIP manifests are version-named so a new build leaves the 0.1.0 ZIP and its manifest intact.

There are no new dependencies, hard links, shared mutable files, cache services or changes to the snapshot/receipt format. The mandatory rehearsal and owner-adoption gates remain.

## Measured comparison

The same synthetic Git repository was used for both versions: **33 regular files, 8,421,113 file bytes**, including an 8 MiB ignored payload, untracked content and a dirty tracked file. Complete source-entry hashes matched between measurements. The baseline was the previously verified 0.1.0 distribution; the comparison used the new implementation.

Measurements sum actual regular-file lengths. They are **not NTFS allocated-cluster counts or volume-free-space deltas**. Plan was measured immediately before its successful temporary-directory cleanup; retained rehearsal storage was measured after success. Runtime overhead and filesystem allocation can differ on other projects.

| Operation | 0.1.0 bytes | 0.1.1 bytes | Saved |
| --- | ---: | ---: | ---: |
| Single-patch plan temporary files | 16,852,200 | 1,212 | 16,850,988 (99.99%) |
| Ordered two-patch plan temporary files | 16,854,062 | 8,425,097 | 8,428,965 (50.01%) |
| Retained snapshot + successful rehearsal | 16,869,969 | 8,448,923 | 8,421,046 (49.92%) |
| Complete verified backup alone | 8,429,229 | 8,429,229 | 0 — deliberately unchanged |

The plan figures measure temporary storage, not retained storage: both versions clean up successful plans. The rehearsal saving is retained space. Existing historical snapshots or failure evidence are never automatically pruned.

## Unavoidable overhead and limits

The complete recovery snapshot remains necessary. Rehearsal and ordered patch planning still need a full independent working copy while running. Postimage/recovery bytes, copied patches, journals, manifests and private command logs remain necessary evidence. Unknown command writes and interrupted operations retain the original fail-closed behavior.

Space estimates include per-entry metadata allowance, up to 32 MiB of output per validation command and additional volume headroom. Rehearsal budgets an extra tree's size for growth/recovery; unusually large expanding patches or validators may exceed estimates. Availability can change after a check. Runtime errors never become PASS; a failed recovery requires reconciliation rather than deletion of evidence to free space.

## Validation

Four focused regressions supplement the original suite: no-copy single plan/one-copy ordered plan; successful-workspace cleanup with failed-workspace/evidence preservation; simulated insufficient capacity across all five commands followed by successful recovery; and combined demand on one volume. Free-space fault injection substitutes the filesystem capacity result—it does not fill a real disk.

Reproduce with `npm test`, `npm run check`, and `npm run example`. The existing workflow tests continue to exercise authorized apply, failed validation, exact restore, real process interruption, drift rejection, Windows paths/streams, link boundaries and test-evidence integrity.

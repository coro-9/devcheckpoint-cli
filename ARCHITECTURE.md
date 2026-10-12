# Architecture

The CLI is an explicit state machine over ordinary Git and filesystem operations. There is no service, database, model, account or proprietary runtime.

```text
plan (owner read-only; one patch: Git check; ordered series: one disposable copy)
  -> backup (complete inventory + content objects + sealed manifest)
  -> rehearse (reconstruct -> ordered patches -> validation -> exact restoration)
  -> apply [human confirmation] (same preimage -> same patches -> same hashes -> validation)
  -> restore [human confirmation] (known bytes only -> original baseline)
```

## Modules

| Module | Responsibility |
| --- | --- |
| `bin/devcheckpoint.mjs` | Flags, explicit approvals, progress, stable exit codes |
| `common.mjs` | Path validation, atomic read-back writes, manifest digests |
| `inventory.mjs`, `windows.*` | Exact entry identities, bounded-buffer hashing, drift detection, Windows unsupported-metadata gates |
| `repository.mjs`, `process.mjs` | Canonical Git options, repository support boundary, argv execution, private output capture |
| `snapshot.mjs` | Complete content snapshot, immutable hash-addressed objects, reconstruction |
| `space.mjs` | Conservative pre-operation estimates, available-space checks grouped by volume |
| `validation.mjs`, `node-reporter.mjs` | Approved commands and explicit test evidence |
| `journal.mjs` | Cooperative repository lock, durable events and state |
| `restore.mjs` | Known-state, per-entry restoration with preserved attempted bytes |
| `engine.mjs` | Ordered workflow and recovery decisions |

## Snapshot identity

Every directory entry has a relative path constructed from its actual parent and entry name. The inventory rejects duplicates, case collisions, malformed paths, unsupported types and hard links. Files record size, full SHA-256 and basic mode. Links record literal targets; targets are never traversed. Root and child Windows metadata are checked for unsupported streams/EFS/reparse features. Root traversal never follows a link.

Files are read in 1 MiB chunks with file identity/stat checks before, during and after hashing. Directory identity and listings are checked again. A second inventory after copying detects ordinary concurrent changes. This is not a filesystem-level point-in-time snapshot: writers must be stopped.

The snapshot stores every regular file, including `.git`, modified files, ignored files and untracked files, in `objects/<sha256>`. Equal contents share an object. It stores directory and link metadata in `snapshot.json`. Objects and manifests are read back and verified. SHA-256 sidecars detect accidental corruption; they are not signed authentication.

## Patch and preservation gates

Git runs with optional locks off, long paths on, autocrlf off, fsmonitor off and untracked cache off. Global/system Git configuration and inherited `GIT_*` overrides are excluded. Unsafe local filters/external configuration and unsupported layouts are rejected. Repository-local ignore/attribute rules still matter; no shell commands are constructed from paths.

`git apply --numstat -z` identifies patch paths. Link/submodule/rename/copy patches and protected/device-named targets are rejected. Each ordered patch uses `--check`, then apply with warnings retained. Exit code, signal and spawn error determine process success. Whole-tree comparison checks that only declared patch paths/new parent directories changed and `.git` stayed identical.

Rehearsal seals every intermediate whole-tree postimage and command configuration. Owner adoption requires the exact snapshot preimage and compares every step to its rehearsed postimage. No test success can override a hash mismatch.

A single-patch plan uses only `git apply --check`, with copied-patch hash and unchanged-owner inventory checks. It reports that limited scope; complete postimage, validation and restoration checks remain mandatory in rehearsal. Multi-patch plans copy the complete working tree once and verify it directly, avoiding a redundant temporary snapshot object store. A successful rehearsal's workspace is removed only after exact baseline restoration and another inventory verification. Its durable evidence and recovery objects remain; failed workspaces are not cleaned up.

## Validation and recovery

Project commands receive their own external evidence directory. They cannot accidentally collide with runner journal or Git log filenames. Fresh test evidence is mandatory for test commands; arbitrary command exit zero does not imply tests ran. Trusted adapters remain responsible for honest evidence. Approved commands are not sandboxed or proven network-free.

Before owner writes, a sealed transaction identity and applying state are written. After a normal failure, each entry must match an approved baseline/intermediate state before recovery may write. Unexpected content is preserved and recovery stops. Known changed contents are copied to recovery objects before restoration. Only changed entries are removed/restored, individually; directory removal is nonrecursive and must find an empty directory. No reset, clean or destructive mirroring is used.

If interrupted during adoption between verified patches, deliberate restore can recognize known intermediate content. If interrupted during a file copy or midway through restore, partial/unrecognized bytes can require manual reconciliation. Recovery is fail-closed, not unconditionally crash-resumable. See LIMITATIONS.md.

## Public/private separation

The distributable contains source, synthetic tests, examples and documentation. User snapshots, raw logs, journals, lock files and private configurations are runtime data outside the public project. The tool has no telemetry or publishing path.

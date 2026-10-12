# Supported boundary and limitations

This MVP intentionally refuses unsupported conditions instead of silently producing an incomplete backup or claiming successful adoption.

## Qualified locally

Windows, Node.js 24 and Git for Windows versions are recorded in `docs/verification.md`. All functional tests use disposable synthetic repositories. Linux/macOS have not been executed in this delivery. No claim of universal filesystem, Git-version or build-system compatibility is made.

## Repositories and filesystems

- Requires an existing Git commit and a self-contained `.git` directory. No bare repos, linked worktrees, submodules, sparse/shallow/partial clones or alternate object stores.
- Ordinary local disk only; network shares, cloud placeholders, filesystem snapshots and concurrent writers are outside scope.
- Backup is complete **content and entry-identity** coverage: file bytes, basic modes, directories, literal link targets and Git metadata. It does not preserve timestamps, ownership, POSIX ACLs/xattrs, Windows ACLs, compression settings, file IDs or arbitrary OS metadata. It is not advertised as a system-image backup.
- Windows ADS (including directory streams), EFS and unrecognized reparse metadata are rejected. Hard links, case-colliding paths, control characters, trailing dots/spaces and special files are rejected.
- Actual Windows reserved-name files such as `nul` are read/copied via extended-length paths and actual entry identities. Patches targeting device-named files are not supported; such files can be preserved unchanged.
- Link targets are stored without reading outside the tree. Link-containing snapshots can be verified but not reconstructed/rehearsed/applied by this version; no automatic link recreation or link restoration is advertised.
- Regular-file add/change/delete text and binary patches are supported. Rename/copy, symlink/submodule and file/directory type-transition patches are outside the supported set. Use explicit independent regular-file patches where appropriate.

## Commands and evidence

- Validation must leave the checkout unchanged. Configure output outside it. Commands that modify Git metadata, create build artifacts inside the tree, or install dependencies block PASS.
- Commands must terminate and leave no background children. Timeout or uncertain process lifetime stops automatic recovery. The tool does not kill arbitrary process trees.
- This is not a command security boundary. Explicit approval is required even in rehearsal; network access is not disabled.
- argv is passed directly, not to a shell. On Windows, `.cmd` wrappers such as `npm.cmd` require an explicitly reviewed command interpreter or invoking the actual executable/script. Prefer direct Node/build-tool executables. Shell metacharacters are not automatically interpreted.
- Node test reporter qualification is for explicit `node:test` tests with default process isolation. Empty test files, skipped/todo/cancelled tests, nonzero exits, incomplete summaries and mismatched body counts cannot qualify. A deliberately dishonest custom adapter can still lie; project validators are trusted code.
- With no test command configured, only patch/preservation checks qualify. No product-level correctness claim is made.
- Captured command output is bounded at 16 MiB and command duration defaults to two minutes. Exceeding a bound is failure, not truncated PASS. Maximum configured timeout is one hour.

## Restore and interruption

- One snapshot supports one sealed rehearsal and one adoption transaction. Reuse it to restore that transaction; create a new snapshot for subsequent work.
- Restore refuses any later owner edits, new files or unknown partial contents. It never infers ownership from a matching filename alone.
- Known failed-attempt bytes are preserved before per-entry restoration. No recursive owner-directory deletion or wholesale overwrite is performed.
- Interruption between completed patch steps is recoverable through a deliberate restore if all entries match approved states. Interrupted file writes, interrupted restore, torn state/sidecar writes, full disks or external modifications can require manual reconciliation. Original snapshot objects remain available. Never edit manifests merely to force a match.
- Filesystem checks and cooperative locks are not atomic filesystem transactions. Power-loss durability beyond available file fsync/rename guarantees is not promised.

## Publication

The code is independently authored and has no third-party runtime dependencies. MIT applies to new project code, not to users' repositories, Git, Node.js, or inspected historical material. The working name needs final registry/trademark review before publication; no name reservation or legal clearance is claimed. Nothing is published automatically.

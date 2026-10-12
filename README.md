# DevCheckpoint

**Verify a snapshot. Rehearse a patch. Apply deliberately. Refuse destructive recovery.**

DevCheckpoint is a small, dependency-free Node.js CLI for local Git repositories. It preserves current working files—including staged, modified, untracked and ignored content—then checks a proposed patch series in a disposable reconstruction before allowing an explicitly confirmed application.

It works independently of coding agents, accounts and APIs. Codex or another agent can invoke the same CLI through a shell. It does not modify Codex itself.

## Status and support

Version 0.1 is a conservative MVP. Verified environments and actual test results are recorded in [verification.md](docs/verification.md). Windows is the initial supported target. Linux/macOS portability is intended but **not qualified** by this delivery.

Supported transactions: self-contained, non-bare Git repositories with an existing commit; ordered text/binary patches adding, modifying or deleting regular files. Repositories must be idle. No linked worktrees, submodules, external Git object stores, hard links, alternate streams, EFS, or special files. Link objects can be backed up as metadata without traversal, but rehearsal/apply refuse repositories containing links. See [LIMITATIONS.md](LIMITATIONS.md).

## Local installation

Requires Node.js 24 or newer, Git, and (on Windows) Windows PowerShell and `icacls` on PATH. No runtime npm dependencies or installation step is needed:

```sh
node bin/devcheckpoint.mjs --help
npm test
npm run check
npm run example
```

Optionally install the reviewed local directory as a CLI:

```sh
npm install --global --ignore-scripts .
devcheckpoint --help
```

This is a local-source installation example, not an instruction to fetch a similarly named registry package. The working name is not a claim of npm-name or trademark availability.

## One complete workflow

Run from the unpacked tool directory. Stop editors that write files, watchers, builds and background jobs in the target repository first. Put patches, configuration and snapshots outside that repository.

```sh
node bin/devcheckpoint.mjs plan --repo "C:\Projects\example-app" --patch "C:\Changes\01.patch" --patch "C:\Changes\02.patch" --config "C:\Changes\checks.json"
node bin/devcheckpoint.mjs backup --repo "C:\Projects\example-app" --backup-dir "C:\Recovery\example-before-change"
node bin/devcheckpoint.mjs rehearse --repo "C:\Projects\example-app" --backup-dir "C:\Recovery\example-before-change" --patch "C:\Changes\01.patch" --patch "C:\Changes\02.patch" --config "C:\Changes\checks.json" --approve-commands
```

Read the plan and private rehearsal evidence. Only after the human approves real-checkout adoption:

```sh
node bin/devcheckpoint.mjs apply --repo "C:\Projects\example-app" --backup-dir "C:\Recovery\example-before-change" --confirm --approve-commands
```

Apply uses the **same copied patches, command configuration and exact per-stage hashes** sealed by rehearsal. It does not accept replacement patches. Each snapshot supports one rehearsal receipt and one adoption transaction. Start with a new snapshot for a different change.

To undo that adoption deliberately:

```sh
node bin/devcheckpoint.mjs restore --repo "C:\Projects\example-app" --backup-dir "C:\Recovery\example-before-change" --confirm
```

Restore refuses later edits, including edits to a file the patch changed. Preserve and reconcile those edits yourself; there is no force-overwrite flag. Restore is transaction-scoped, not a general disaster-recovery overwrite command for arbitrary lost directories.

## Validation configuration

See [examples/checks.json](examples/checks.json). Commands are argv arrays, executed without a shell. Names are unique, simple identifiers. `node` selects the current Node executable. `{tool}`, `{reporter}`, and `{evidence}` expand to the tool directory, the Node reporter's file URL, and a fresh external test-evidence path.

```json
{
  "version": 1,
  "commands": [
    { "name": "syntax", "kind": "command", "argv": ["node", "--check", "app.mjs"] },
    { "name": "unit", "kind": "tests", "argv": ["node", "--test", "--test-reporter={reporter}", "app.test.mjs"], "timeoutMs": 120000 }
  ]
}
```

Commands must leave repository content and Git metadata unchanged. Configure builds to write to external temporary output, or use read-only checking commands. A command that modifies the checkout blocks PASS. Unknown writes also block automatic restoration.

`--approve-commands` is explicit approval to execute the reviewed commands **with your privileges and network access**. Rehearsal changes the working directory; it is not a sandbox. There is no automatic dependency installation or network restriction. Never approve untrusted commands. Use only terminating commands, not servers/watchers or commands leaving child processes behind.

Test commands require fresh machine-readable evidence. The included Node reporter reconciles actual test terminal events with the runner summary and refuses empty, failed, skipped, cancelled, todo or incomplete runs. Other test frameworks can write the documented [evidence contract](docs/test-evidence.md). Plain command success is reported only as command success, never as a test-suite PASS. With no test commands configured, the report explicitly says patch verification only.

## Recovery and output

The CLI prints concise JSON results; progress goes to stderr. Raw Git warnings and command output are retained in the private snapshot, not printed. Journals, receipts and SHA-256 manifests are local. They may contain sensitive filenames and command output; do not publish them.

If a command fails normally and all current entries are known transaction states, DevCheckpoint preserves changed bytes in recovery objects and restores the exact baseline. If a process times out, an unknown edit appears, or an interrupted restore leaves ambiguous state, it stops for reconciliation. A cooperative lock prevents concurrent DevCheckpoint operations. After verifying all writers have stopped, `restore --confirm --recover-lock` can clear a lock only when its recorded PID no longer exists. It never terminates that PID.

Exit codes: `0` success, `1` unexpected failure, `2` usage, `3` approval missing, `4` unsupported input, `5` integrity/drift, `6` Git/process failure, `7` validation failure (possibly restored), `8` recovery/reconciliation required, `9` lock held. Inspect the result's recovery field; a nonzero exit never means adoption passed.

## Review and contribute

- [Architecture](ARCHITECTURE.md), [security](SECURITY.md), [limitations](LIMITATIONS.md)
- [Arabic guide](docs/README.ar.md), [Codex instructions](docs/codex.md)
- [Synthetic demo](examples/demo.mjs), [contributing](CONTRIBUTING.md)

All project code is newly authored generic implementation under MIT. The design applies established snapshot, transaction, hashing and rollback techniques; it does not claim to invent them. No private application source, credentials, native assets or historical campaign data are included.

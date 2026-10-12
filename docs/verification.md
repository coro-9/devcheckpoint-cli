# Verification record

The 0.1.0 baseline below is retained. The focused 0.1.1 changes and measured storage comparison are documented in [disk-usage-0.1.1.md](disk-usage-0.1.1.md); current automated results are in [test-results.json](test-results.json).

## 0.1.2 bounded usability release

Locally executed on Windows / Node v24.13.0, Git 2.55.0.windows.5, Windows PowerShell 5.1.26100.9444. The complete suite passed **39/39 tests**, with zero failures, skipped, cancelled or todo tests. TAP summary counters agree with 39 successful test records and process exit 0. This includes the existing 25 tests (all four storage regressions) and 14 focused CLI, timeout and read-only status tests. Syntax checks passed for 26 modules. Package dry-run and the complete synthetic example passed, including intentional apply validation failure and exact baseline recovery.

The new tests cover strict supplied timeouts and string names, a finite real timeout, help/version/doctor outside Git, safe input errors, Node requirement checks, metadata-only status without object/live-checkout reads, explicit deep verification, lifecycle states, drift, corrupt/missing seals, pending/incomplete evidence and rejection of a linked patch path before content reads. The copied-patch reader was strengthened after a bounded source review found its link check occurred too late. One initial status test failed because the test itself supplied a repository during metadata-only inspection; its input was corrected. Raw local failures remain private.

Windows CI is configured with pinned official actions, but **hosted CI has not run**. The release archive and extracted execution receive a separate local delivery record after sealing; these source-suite results alone do not claim an extracted or hosted run. No Linux/macOS qualification or publication is claimed.

## 0.1.1 focused update

The complete suite passed **25/25 tests**, with zero failed, skipped, cancelled or todo tests and process exit 0. This includes all 21 original tests and four focused storage regressions. TAP totals agree with 25 successful test records. Syntax/package-entry checks passed for 21 JavaScript modules. The original 0.1.0 ZIP hash remains unchanged.

The storage comparison used the same synthetic repository and matched every baseline entry hash. Single-patch plan temporary file bytes fell by 99.99%; ordered-plan temporary bytes by 50.01%; retained snapshot/rehearsal bytes by 49.92%. The complete backup remained byte-size identical. These are file-length measurements, not allocated-cluster or free-volume measurements. Full figures, measurement scope, retained evidence and capacity-check limitations are in the linked storage note.

## 0.1.0 baseline

Executed locally on **2026-10-12**. This record describes observed results, not planned checks.

| Environment | Observed version |
| --- | --- |
| OS | Windows 11, 64-bit, build 10.0.26200 |
| Node.js | v24.13.0 |
| Git | 2.55.0.windows.5 |
| Filesystem | Local NTFS; extended-length paths and actual reserved-name files exercised |
| Windows metadata | Windows PowerShell with documented Win32 stream enumeration |

## Results

- `npm test`: **21 tests passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**. Actual process exit 0; TAP totals and 21 individual successful test records agree.
- `npm run check`: syntax checks for 19 JavaScript modules, executable entry, zero runtime dependencies and required documents passed.
- `npm run example`: full CLI plan, snapshot, rehearsal, authorized apply, deliberate restore, a second apply with intentionally failed validation, and automatic restoration passed. Initial and final full-inventory hashes matched.
- `npm pack --dry-run --json`: package entry and inclusion check passed; no registry publication performed.
- Public source inspection found no private project source, machine-specific owner paths, credentials or genuine private fixtures. Public ZIP generation uses an explicit allowlist and reads every ZIP entry back to compare its path, size and SHA-256.

## Regression coverage

1. Complete snapshot and exact transaction restore, including dirty/staged/untracked/ignored files.
2. Dependent ordered patches and preserved successful Git whitespace warnings.
3. Failed Git patch cannot qualify or modify the owner fixture.
4. Corrupted backup objects, preimage drift and edits after adoption are rejected.
5. Command execution and real application require separate explicit approval.
6. Apply-time validator failure restores the exact baseline.
7. Unexpected validator writes block PASS and are retained for reconciliation.
8. A real terminated synthetic apply process recovers through deliberate restore and stale-lock handling.
9. Regular-file additions/deletions and new directories round-trip.
10. Binary patch postimages and exact restoration.
11. Missing/incomplete/zero/failed/cancelled/skipped and inconsistent test evidence.
12. Real Node passing/failing/empty test runs and missing evidence.
13. Duplicate/colliding/malformed inventory paths and missing parents.
14. Validation command names cannot overwrite journal or Git evidence.
15. Spaces, Unicode, paths over traditional Windows length limits and a real file named `nul`.
16. External links recorded without traversal; rehearsal rejected.
17. Hard links, file ADS and root-directory ADS rejected.
18. External Git filters rejected before preflight/backup can execute them.

Several cases contain multiple assertions and scenarios; the executed Node test count is 21, not the numbered coverage list length.

## Review and development failures

A separate read-only source review identified Git-filter execution, missing root stream inspection and evidence-name collision risks. All received fixes and targeted regressions. The reviewer did not independently execute the tests or certify the product.

Initial development runs exposed PowerShell JSON-array handling, Windows read-only-handle fsync, Windows reporter file-URL handling, empty-file test counting, and PowerShell directory stream enumeration behavior. They were corrected and the full suite rerun. Raw failed-run logs remain in the local development `.local` directory and are deliberately excluded from the public archive. No historical private campaign files were imported.

## Reproduction

From an unpacked source directory with the prerequisites installed:

```sh
npm test
npm run check
npm run example
npm pack --dry-run --json
npm run zip
```

`example` creates and retains only a fresh synthetic repository and evidence under the system temporary directory. `zip` writes a new local archive under `artifacts/` and refuses to overwrite an existing archive. It currently requires Windows PowerShell. Linux/macOS, adversarial concurrent writers and arbitrary interruption during restoration are not qualified. Read LIMITATIONS.md before using real repositories.

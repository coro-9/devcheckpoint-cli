# Verification record

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

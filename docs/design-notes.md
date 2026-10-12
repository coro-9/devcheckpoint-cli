# Design notes and provenance

This project was independently implemented from general engineering lessons observed in a private, Windows-based adoption workflow. No historical implementation, private fixtures, source snapshots, account data or application-specific launch logic was imported.

Useful established techniques retained:

- A complete inventory before and after copying, rather than assuming a copy command succeeded.
- One canonical set of Git flags for baseline and comparison.
- Exit-code interpretation separate from warning capture.
- Ordered rehearsal and postimage hashes before real application.
- Preservation checks covering untracked and ignored content too.
- Explicit journal states and recovery that refuses unknown edits.

New generic implementation:

- Five-command CLI with explicit command/adoption approvals.
- SHA-256 content objects and portable relative entry records.
- Configurable argv-based validators and a test-evidence contract.
- Node event-based reporter rather than parsing one project's console output.
- Conservative unsupported-layout/filesystem gates.
- Synthetic examples and regressions independent of any owner's machine.

Deliberately not generalized: application-specific native UI automation, model/provider qualification, account/profile recovery, service shutdown, licensing rules, historical hash constants, source-file allowlists and proprietary environment configuration.

References consulted for semantics, not copied implementation:

- [Git apply](https://git-scm.com/docs/git-apply): patch checks, numstat and exit semantics.
- [Node test runner](https://nodejs.org/api/test.html): reporter events and summaries. Actual behavior was tested on the version in verification.md.
- [Windows FindFirstStreamW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-findfirststreamw): file and directory data-stream enumeration.
- [Codex repository instructions](https://developers.openai.com/codex/guides/agents-md): optional agent usage guidance.

The working name is provisional. A preliminary search found an unrelated internal Go package also named `devcheckpoint`; no trademark clearance or npm-name reservation is claimed. Review naming again before public publication. The local CLI and ZIP require no registry ownership.

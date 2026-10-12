# Contributing

Use Node.js 24+ and Git. Run `npm test`, `npm run check`, and `npm run example` before proposing changes. No dependency install is required.

Tests must operate only in temporary synthetic repositories. Never use a contributor's real checkout, profile or backup as a fixture. Keep test outputs under `.local/` or the system temporary directory; do not commit raw private logs.

Safety changes need a regression that exercises the actual failure. Test both acceptance of valid work and rejection of malformed input. Never weaken a gate to make a test pass. Preserve explicit support limitations; expanding filesystem or platform support requires actual execution evidence.

Review priorities: path identities, full inventories, fresh test evidence, approval boundaries, drift preservation, process exit handling, and recoverable failures. Keep the CLI small and avoid dependencies without a concrete need.

Contributions must be yours to license under MIT. Do not submit proprietary source, private snapshots, credentials, real provider responses or copied third-party code without compatible licensing and attribution.

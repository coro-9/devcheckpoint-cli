# Changelog

## 0.1.2

- Strict validation command names and optional integer timeouts (1–3600000 ms); omitted timeouts retain the 120000 ms default.
- Package-derived `--version`, read-only prerequisite/layout `doctor`, and actionable CLI errors with stable exit codes.
- Read-only checkpoint `status`, with explicit deep backup verification and optional live-checkout drift inspection. Existing checkpoint formats remain unchanged.
- Copied rehearsal patches are checked for linked paths before reading their bytes.
- Windows/Node 24 CI with pinned official actions, synthetic execution and archive smoke checks. Hosted execution is not yet verified.
- Expanded Windows/Arabic onboarding, safe patch preparation, optional Codex instructions and troubleshooting.
- Public archive allowlist includes reviewed CI and this changelog; no runtime dependencies added.

## 0.1.1

- Single-patch planning avoids a full repository copy; ordered planning uses one independent copy.
- Verified successful rehearsal workspaces are removed; backups, journals and failure evidence remain.
- Conservative disk-space checks precede expensive operations and target writes; exit code 10 identifies unavailable or insufficient capacity.

## 0.1.0

- Initial local CLI: verified Git snapshots, ordered patch planning/rehearsal, explicitly approved application and drift-aware restoration.
- Exact content manifests, private transaction evidence and machine-readable Node test validation.

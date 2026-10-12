# Security and privacy

DevCheckpoint is a local safety utility, not a sandbox or adversarial backup system.

- Run only against repositories you own and understand. Stop every other writer.
- Backups contain **all files**, including ignored secrets and `.git` configuration. Treat them as confidential. Do not put them in cloud-sync/public folders.
- New snapshot directories use owner-only permissions on POSIX and an explicit current-Windows-user ACL with inheritance removed on Windows. ACL setup failure stops backup. Administrator/root access remains possible. Contents are not encrypted.
- Validation requires explicit approval. Commands inherit the user's environment and privileges, may access any readable local file, and may use the network. Do not put credentials in argv or config; do not approve hostile code.
- No automatic dependency installation, login, model request, upload, remote creation or publishing exists in this CLI.
- Raw output is saved privately and never automatically printed. A user-supplied command can emit secrets; review and redact logs before sharing. Filenames, paths and command arrays in local plans may also be sensitive.
- Symbolic links are not traversed by inventory. Rehearsal/apply reject them. Git filters and external repository configurations are refused before status inspection.
- Hash sidecars are accidental-corruption detection, not signatures. A same-user attacker able to rewrite both content and manifests can defeat them. Do not use untrusted snapshots or receipts.
- Locks coordinate this tool only. The tool cannot stop an editor, antivirus, service or another agent from writing. No race-free guarantee is made against malicious concurrent filesystem replacement.
- A backup is not a substitute for independent, tested disaster recovery. Keep a second recovery copy for valuable work.

For a security report, do not post snapshots, private paths, credentials or raw logs. Share a minimal synthetic reproduction privately with the repository maintainer. No dedicated private security-reporting endpoint is currently announced. Agree on a private channel with the maintainer before disclosing sensitive details; do not use public issues for secrets or exploit details.

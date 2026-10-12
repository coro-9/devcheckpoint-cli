# Test evidence contract

A `kind: "tests"` command must exit zero and write a new JSON document to the path supplied in `DCP_EVIDENCE` (also available as `{evidence}` in argv). The path starts absent for each invocation and is outside the checkout.

```json
{
  "version": 1,
  "complete": true,
  "total": 2,
  "passed": 2,
  "failed": 0,
  "cancelled": 0,
  "skipped": 0,
  "todo": 0
}
```

Counters must be nonnegative safe integers, total must be positive, passed must equal total, and failed/cancelled/skipped/todo must all be zero. Missing files, malformed JSON, symlink evidence, stale preexisting evidence, absent counters and incomplete runs fail closed.

The included `src/node-reporter.mjs` consumes supported Node test-runner events, requires a final summary and actual file-level summaries, and reconciles terminal test events with summary counts. It excludes implicit file-only passes so an empty source file cannot qualify as one test. Use `--test-reporter={reporter}`; the placeholder supplies the file URL required for Windows ESM imports.

For another test framework, write a small adapter around its supported machine-readable report. It must verify completion and reconcile actual test cases before producing this document. DevCheckpoint does not prove an arbitrary adapter is truthful, and does not parse arbitrary console decorations.

Use `kind: "command"` for typechecking or read-only builds. Its zero exit is recorded as command success, not as evidence that tests ran. Review the displayed command before granting `--approve-commands`.

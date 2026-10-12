# Using DevCheckpoint with Codex or another coding agent

DevCheckpoint is an ordinary local CLI. It does not extend or modify Codex internals and requires no OpenAI account, API key, subscription or SDK. Any agent capable of executing local commands can use it, subject to that environment's permissions.

Example request:

> Use the reviewed local DevCheckpoint CLI to plan the ordered patches against my repository. Do not alter my checkout. Show the commands and unsupported conditions first. After I approve the validation commands, make an external snapshot and rehearse. Show the exact result and recovery evidence. Stop for my explicit approval before apply or restore. Do not infer approval from a passing rehearsal.

Suggested repository instruction, which you may merge manually into your existing `AGENTS.md`:

```text
For a requested DevCheckpoint adoption:
1. Inspect the repository and proposed patches using plan.
   Keep the target preimage unchanged; obtain patches from a separate development copy.
2. Show the actual configured argv and request approval before executing it.
3. Create a private external backup and complete a successful rehearsal.
4. Report exact results, unsupported conditions and remaining risks.
5. Wait for explicit user authorization before apply --confirm or restore --confirm.
6. Do not invent approvals, suppress warnings, bypass drift checks, or publish recovery data.
7. If recovery requires reconciliation, preserve the evidence and stop.
8. Use status for read-only recorded evidence; use --verify explicitly for a full
   backup check and --repo only when live-checkout inspection is requested.
```

`AGENTS.md` is a documented Codex instruction mechanism: [official OpenAI guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Codex reads applicable instructions before work; nearer project instructions can override broader guidance. Merge this optional snippet only through your own review. The CLI never edits repository or global instructions. These instructions do not grant permission by themselves. No skill installation, global instruction change, MCP server or special Codex runtime is required.

Flags represent authorization already obtained from the human; an agent must not add them simply to bypass a refusal. A project command may access the network or files outside the rehearsal. The CLI does not override Codex sandbox settings or make those commands harmless.

# manual runs

Manual-run records are not placeholders for automated tests.

Use a manual-run file to record what an agent actually exercised by hand from the mapped Gherkin feature file or files.

## closure rule

A bead is not complete until its manual run exists.

If the bead adds or changes a user-facing surface, the manual run must explicitly exercise that changed surface itself. That means:

- run the built CLI command, docs flow, MCP tool, or other user-facing entrypoint
- record the exact commands or steps used
- record the observed result

These do **not** satisfy the manual-run requirement by themselves:

- `vitest`
- `npm run standards`
- typecheck, lint, or build commands
- reading code or snapshots without exercising the built surface

## expected contents

Each manual-run file should include:

- task id
- source plan reference
- mapped Gherkin feature file or files
- scope
- step-by-step actions taken
- user-surface exercise section when a user-facing surface exists
- result and any notable observations

## path

Use:

```text
specs/manual-runs/<task-id>/<yyyy-mm-dd>-<agent>.md
```

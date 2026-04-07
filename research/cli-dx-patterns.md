# CLI DX patterns worth stealing

Checked on 2026-04-06.

## The patterns that feel right for this product

### Keep the top-level verbs small

Commander is a good fit because it is strict by default, has predictable help output, and works well for multi-command CLIs. That matters here because accessibility tooling gets hard to trust when the interface feels loose.

My strong bias: keep the first public surface to a handful of verbs.

- `doctor`
- `init`
- `run`
- `story`
- `mcp`

Anything more than that too early turns into taxonomy instead of usability.

### Support both human and machine output from day one

Pa11y gets this right. It has human-readable output, JSON, CSV, HTML, and clear exit codes. a11lied should copy the principle, not the exact surface.

The minimum useful shape is:

- readable default output for local runs
- `--json` for scripts and agents
- structured exit codes

### Interactive prompts should be optional, not required

`@clack/prompts` is a good fit for guided setup because it is small, clean, and handles cancellation sanely. The key is to keep prompts as a convenience layer only.

That means:

- prompt in TTY mode
- never prompt in CI
- always offer a flag-based path

### Exit codes need to say what kind of failure happened

Pa11y uses a simple scheme that is easy to reason about: success, technical failure, or findings. a11lied should keep that same clarity.

Recommended first-pass exit codes:

- `0`: command succeeded and no failing findings crossed the threshold
- `1`: command failed because of config, runtime, or transport issues
- `2`: command ran successfully but found failing accessibility assertions
- `3`: environment is unsupported or setup is incomplete for the requested target

### The `doctor` command is not optional

Because Guidepup setup is OS-sensitive, `doctor` should be the first command that feels complete. It needs to answer:

- what targets this machine can run
- what is missing
- what command to run next

### Help text should teach the workflow

Not generic one-line blurbs. Real examples.

Good command help for this product should answer:

- what target this command runs against
- whether it can work in CI
- what the common example looks like
- what exit codes mean

## Sources

- Commander README: https://github.com/tj/commander.js
- Clack prompts README: https://github.com/bombshell-dev/clack/tree/main/packages/prompts
- Pa11y README and exit code model: https://github.com/pa11y/pa11y

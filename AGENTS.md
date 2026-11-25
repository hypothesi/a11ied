# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

Maintainer release workflow reference: `internal-docs/maintainer-release-checklist.md`

Dependency policy and approved exceptions: `internal-docs/dependency-licenses.md`

## internal-docs

`internal-docs/` is only for maintainer documentation that stays accurate as long as the
code it describes: architecture, policies, and maintenance or release procedures.

- Do not write plans, research findings, audits, investigation notes, comparisons, or
  run records into `internal-docs/`, even temporarily.
- Do not commit them anywhere else in the repository either.
- Put task plans and findings in beads (`bd create`, `bd update <id> --append-notes`).
  Put scratch files outside the repository.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**

```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**

- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**Default workflow:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Hand off** - Provide context for next session

**Sync policy:**

- Do **not** run `bd dolt push`, `git push`, or other remote sync commands unless the user explicitly asks for that in the current task.
- Local commits are allowed when requested, but remote pushes are opt-in.

 <!-- END BEADS INTEGRATION -->

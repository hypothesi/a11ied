# Screen-reader CLI reorganisation (retained for humans and agents): implementation plan (2026-11-09)

Source: `internal-docs/capabilities-review-and-target-design.md` finding 5 (screen reader infrastructure). Clarification 2026-11-09: the screen-reader CLI is retained for both human and agent programmatic control — the fix is organisation, not removal.

## Summary

Keep the `a1 sr` command surface (and its MCP + TS equivalents) as a first-class, human-usable and agent-scriptable feature. Reorganise today's flat ~40-command cloud into six task groups with one registry driving CLI help, MCP tools, and the queued TS API — same verbs, no drift. The review loop (N5) uses the same verbs internally, but interactive SR work remains fully available outside a review.

## Objectives and scope

In scope:

- The SR CLI (`packages/cli/src/commands/drive*.ts`), `packages/guidepup`, `core/src/driver/*`, the SR MCP tools, and `a11ied/test` + `a11ied/vitest`.
- One verb registry (P2-15, kept) with groupings, help text, and payload schemas.
- Help restructuring (`a1 sr --help` lists groups; `help-all` unchanged in coverage).
- Queued TS API (`queuedScreenReader`) as a thin adapter over the same verbs — kept, not collapsed away.

Out of scope:

- New SR verbs or new reader targets.
- Session semantics (single active session, broker for real readers stays).
- The `review.*` facade internals (N5) — it consumes these verbs.

## Requirements

### Functional

- FR-1: `a1 sr` verbs are grouped: **session** (`start open stop status`), **navigate** (`next previous goto top bottom read read-all elements`), **interact** (`press type activate interact focus perform`), **assert** (`expect wait checkpoint`), **inspect** (`transcript screenshot walk tail`), **bulk** (`batch`).
- FR-2: Every verb works identically via CLI (`a1 sr next ...`), MCP (`sr_*` tools generated from the registry), and `queuedScreenReader` (method per verb). Exit codes 0/4/3 are identical on all three.
- FR-3: Human output (text) and agent output (`--json`) come from one renderer per verb; `help-all` prints group help from the registry.
- FR-4: A registry-parity test fails if a verb exists in one surface but not the others, or if group membership is missing.

### Non-functional

- NFR-1: The 800-char-per-tool description budget (P2-15) applies to the generated MCP tools, not to hand-written prose.
- NFR-2: No verb is removed; `sr_action` remains as a forwarding alias for one release if the MCP tools split.

## Design

- One registry module (`packages/guidepup/src/command-registry.ts`, extended) holds `{ verb, group, payloadSchema, summary, cliPath }` for every SR verb. CLI registers from it; `mcp-server` generates `sr_navigate`/`sr_act`/`sr_assert` + `sr_session` from it; `queuedScreenReader` methods map 1:1.
- The merged skill (P2-14, kept) documents the six groups once, with one human recipe and one agent/script recipe per group (batch JSONL + `--json` + exit codes).
- `doctor`/`setup` stay the readiness gate; `sr tail` streaming is documented under inspect, not as a separate product.

## Implementation steps

1. Extract group + metadata into the registry; generate MCP descriptions/tools from it (P2-15, kept).
2. Reorganise `a1 sr --help` into the six groups; keep every existing subcommand working.
3. Retarget `queuedScreenReader` and vitest matchers onto the registry verbs (behaviour unchanged).
4. Update the merged skill + docs from the registry; add the parity test.

## Testing

- Parity: CLI verb set == MCP tool verb set == queued-method set (automated).
- Exit codes: `expect`/`goto`/`wait` return 4 on mismatch on all three surfaces.
- Manual: a human drives a virtual session from the group help with no docs; an agent scripts the same flow via MCP with no CLI.

## Risks

- Reorganisation churn for existing scripts: mitigated by keeping every verb invocation working unchanged (help/group change only).
- Generated descriptions less idiomatic than hand text: mitigated by per-verb `summary` fields in the registry (reviewed once, rendered everywhere).

## Acceptance criteria

- Full SR control (start → navigate → interact → assert → inspect → stop) is available to humans (CLI) and agents (MCP/TS) from one registry.
- No verb lost or renamed; parity green.
- Standards and tests pass.

## Sequencing

Do before N3 (templates name the final tool/verb names) and N5 (review.observe builds on these verbs). Independent of N1/N2.

# Unified file governance (concurrency refactoring): implementation plan (2026-11-09)

Source: concurrency review 2026-11-09. Supersedes `a11ied-p1-13a-artifact-atomicity-plan.md`, `a11ied-p1-13b-lock-budget-plan.md`, and `a11ied-p1-13c-transactional-claims-plan.md` as the parent plan; those remain as step details under Phase 2–4.

## Summary

Replace the current patchwork — one lock + atomic-write module (`packages/core/src/files/atomic-json.ts`) plus ~15 raw `writeFile`/`appendFile` call sites that bypass it — with a single governed persistence layer. Every durable write in the product goes through one module that owns locking, atomicity, freshness, and contention policy. Callers declare intent (`put`, `append line`, `register artifact`, `commit transaction`); they never call `proper-lockfile`, `rename`, or `fs.promises.writeFile` directly.

This plan is a refactoring, not a behavior change: `run.json`, `evidence.jsonl`, and `artifacts/` keep their schemas and paths. The only observable change is that concurrent agents stop corrupting, tearing, or losing writes to each other.

## Objectives and scope

In scope:

- One persistence module (`packages/core/src/files/`, evolved from `atomic-json.ts`) exposing the five primitives below.
- Migration of every production write site to those primitives (inventory table below).
- A single lock configuration (budget, stale timeout, ordering) applied everywhere.
- A lint/test gate that bans raw `writeFile`/`appendFile` outside the persistence module.
- Multi-process concurrency tests in CI.

Out of scope:

- Sharding evidence to per-agent files (a parallel structural alternative; the transaction in Phase 3 makes it unnecessary, revisit only if profiling shows lock contention dominates).
- Schema changes to `AuditRun`, `EvidenceRecord`, or artifact content (see P1-8 for the separate lightweight-evidence work; this plan is compatible with it).
- Changing single-agent behavior, CLI/MCP surface, or report content.

## Assumptions

- Local filesystem only (proper-lockfile); no NFS deployment target.
- The existing `waitingFiles` in-process FIFO is correct and should be kept as the first queue before the cross-process lock.
- Callers that need a directory to appear to change in one step (report bundles) already use staging + rename via `report/publication.ts`; generalize that pattern, don't invent a new one.

## Requirements

### Functional

- FR-1: All production writes go through the persistence module. No `writeFile`, `appendFile`, or `rename`-based write remains in `packages/core/src`, `packages/cli/src`, `packages/mcp-server/src`, `packages/guidepup/src` outside `files/`.
- FR-2: Every multi-file invariant (artifacts + registration + evidence + check transition) commits in one run transaction. A crash mid-transaction leaves the run at the previous revision.
- FR-3: Artifact bytes are content-addressed or attempt-scoped and written atomically, so two processes can never produce a torn or mixed artifact.
- FR-4: Lock contention queues (budget >= 10s) instead of failing after ~600ms; the error when the budget is exceeded names the path and the holder timeout.
- FR-5: Old runs (current schemas) validate unchanged after the migration.

### Non-functional

- NFR-1: One lock configuration object; call sites cannot pass per-call timeouts/retries.
- NFR-2: One atomic-write implementation; file mode, fsync, and temp-file naming are defined once.
- NFR-3: The migration is reviewable per file: each PR moves call sites to the primitives and adds a concurrency test.
- NFR-4: No new dependencies (license policy unchanged).

## Design: the unified layer

Rename/extend `atomic-json.ts` into `packages/core/src/files/store.ts` (keep `atomic-json.ts` as a re-export shim for one release) with five public primitives. Nothing else in the codebase touches `proper-lockfile` or temp-file naming.

```ts
// 1. Primitive atomic write (text/bytes/json). Unique tmp + fsync + rename.
//    Replaces writeTextAtomic/writeBytesAtomic/writeJsonAtomic and every raw writeFile.
writeAtomic(path: string, value: string | Uint8Array | unknown, opts?: { json?: boolean; overwrite?: boolean }): Promise<void>

// 2. The single lock. proper-lockfile + waitingFiles FIFO + one config
//    (retries/backoff/stale). All other primitives and transactions build on this.
withPathLock<T>(path: string, fn: () => Promise<T>): Promise<T>

// 3. Single-file read-modify-write. Locks, reads, transforms, validates, writes atomically.
withLockedFile<T>(path: string, schema: z.ZodType, change: (current: T) => T | Promise<T>): Promise<T>
   // replaces updateAuditRun, updateInventoryAtomic, writeInventoryAtomic, clearEvidence

// 4. Append one line atomically (O_APPEND discipline + lock). Replaces evidence append.
appendLine(path: string, line: string): Promise<void>

// 5. Multi-file transaction over one run directory (run.json + evidence.jsonl + artifacts).
//    Lock order is fixed: run file first, then evidence file. Slow I/O (browser, SR)
//    happens outside; only validate+write happens inside.
withRunTransaction<T>(runFile: string, fn: (tx: RunTx) => Promise<T>): Promise<T>
   // tx: { readRun, registerArtifacts(paths), appendEvidence(record), evaluate(checkId, outcome) }

withDirectoryCommit<T>(outDir: string, fn: (stage: string) => Promise<T>): Promise<T>
   // write into stage/, then rename into place. Generalizes report/publication.ts staging.
```

Artifact writing is not a sixth primitive: it is `writeAtomic` with an attempt-scoped path (`artifacts/<checkId>-a<attempt>-<kind>.*`) whose path is then registered in the transaction (Phase 3). One helper, `attemptArtifactPath(checkId, attempt, kind)`, owns the naming.

Lock ordering and budget live in one `LOCK_CONFIG` constant; `withPathLock` is the only function that calls `lock()`.

## Migration inventory (every production writer)

| Caller today                                                                         | What it does                                       | Becomes                                                               |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------- |
| `files/atomic-json.ts`                                                               | lock + atomic writes                               | `files/store.ts` (canonical home)                                     |
| `audit/run-store.ts:updateAuditRun`                                                  | RMW on `run.json`                                  | `withLockedFile(runFile, auditRunSchema, change)`                     |
| `audit/run-inventory.ts`, `discovery/inventory.ts`                                   | RMW on inventory/run                               | `withLockedFile`                                                      |
| `evidence/store.ts:recordEvidence/readEvidence/clearEvidence`                        | validate-then-append under lock                    | validation moved inside `appendLine` lock; `withLockedFile` for clear |
| `audit/probe/probe-artifacts.ts`, `probe-observe.ts`                                 | raw `writeFile` artifacts                          | `writeAtomic` + attempt-scoped path (13a)                             |
| `audit/probe/probe-run.ts:runClaim`                                                  | write->register->write->record->evaluate (4 locks) | one `withRunTransaction` for register+record+evaluate (13c)           |
| `report/runtime.ts:writeJsonFile/writeRenderedReports`, `report/finding-evidence.ts` | raw report writes                                  | `writeAtomic` inside `withDirectoryCommit`                            |
| `report/publication.ts`                                                              | journal lock + staging                             | reuse `withDirectoryCommit`; keep journal as a `withLockedFile`       |
| `driver/transcript.ts`, `session-lock.ts`, `driver/session-utils.ts`                 | transcript/session writes                          | `writeAtomic` / `withLockedFile`                                      |
| `cli/lib/write-output-file.ts`, `discovery/crawl.ts`                                 | CLI/discovery file writes                          | `writeAtomic` (CLI output may opt out of fsync via opts)              |
| `guidepup/desktop-lease.ts`, `guidepup/screenshot.ts`                                | lease/screenshot writes                            | `writeAtomic` (lease keeps its `link` overwrite semantics via opts)   |

Test files and `packages/wcag-data` sync scripts keep raw `writeFile` — the ban covers production code only.

## Implementation steps (phased, each shippable)

1. Phase 1 — extract the layer: create `files/store.ts` (five primitives + `LOCK_CONFIG` + `attemptArtifactPath`), keep `atomic-json.ts` as a shim. Add the grep gate (see Testing).
2. Phase 2 — atomicity sweep (13a): probe artifacts + observe screenshot + report runtime + transcript + CLI output -> `writeAtomic`; attempt-scoped artifact names; delete the double write.
3. Phase 3 — transactions (13b + 13c): raise the lock budget inside `withPathLock`; move evidence validation inside the evidence lock; introduce `withRunTransaction` and convert `runClaim` (record+evaluate in one transaction). Lock order documented on `withPathLock`.
4. Phase 4 — directory commits: `publication.ts` staging generalized to `withDirectoryCommit`; report bundle writes move inside it.
5. Phase 5 — gate + docs: ban raw writes in production code, document the five primitives in `AGENTS.md` and the `files/` README, remove the shim in the next major.

## Testing

- Gate: `grep -r "writeFile\|appendFile" packages/*/src --include=*.ts` outside `files/` returns only tests; the same check runs in CI.
- Contention: 8 processes concurrently claim/record/evaluate on one run fixture; exactly one claim per check; no torn artifact; final `run.json` revision equals the number of committed transactions.
- Same-check conflict: two concurrent records for one check -> one append, one `audit-evidence-conflict`.
- Crash: kill a writer mid-transaction; run reopens at the previous revision; stale lock (> `stale` timeout) is broken and the waiter proceeds.
- Stale fingerprint mid-transaction: competing fingerprint change is rejected with `audit-revision-conflict`, not silently lost.
- Regression: `npm run standards` and `npm test` green (existing `run-store`/`store`/`publication` tests move with their callers).

## Risks

- Holding the run lock during validation serializes records: mitigate by keeping the critical section to validate+write only (all browser/SR I/O stays outside); measure hold time in the contention test (< 1s budget).
- A longer lock budget masks a true deadlock as a hang: mitigated by naming the path and timeout in the error.
- The shim period leaves two import paths: mitigated by making the gate accept both until Phase 5, then removing the shim.

## Acceptance criteria

- Zero raw production writes outside `files/` (gate green).
- One lock implementation; no caller passes lock options.
- Concurrent agents cannot corrupt `run.json`, `evidence.jsonl`, or any artifact; conflicts surface as explicit errors, not lost updates.
- Standards and tests pass.

## Sequencing

Parent of 13a/13b/13c: land Phase 1 first, then Phases 2–4 in any order (each is independently shippable). Compatible with P1-12 (single artifact write) and P1-8 (lightweight evidence); rebase those plans onto `writeAtomic`/`withRunTransaction` instead of calling `writeBytesAtomic` directly.

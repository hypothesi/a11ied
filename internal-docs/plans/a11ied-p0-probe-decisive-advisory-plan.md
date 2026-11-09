# Decisive vs advisory probes: implementation plan (2026-11-09)

Source recommendation: `internal-docs/audit-performance-quality-review.md` P0-2.

## Summary

Split the 55 probes in `judge.ts` into two classes. Decisive probes return only `passed`/`failed`/`inapplicable` with a reproducible object and may auto-record. Advisory probes return `cantTell` with a concrete next tool call and must not auto-record. This stops heuristic guesses from being recorded as verified verdicts.

## Objectives and scope

In scope:

- Reclassify every entry in `probes-perceivable.ts`, `probes-operable.ts`, `probes-understandable.ts`.
- Change the `Probe` type in `probe-types.ts` to a discriminated result (`DecisiveJudgement` vs `AdvisoryJudgement` with `nextAction`).
- Only decisive judgements may be written by `runAuditProbes`; advisory results stay `queued` with a `needsReview` reason and a suggested command.
- Update `judge.ts` (`hasProbe`, `judgeCriterion`) and `probe-run.ts` (`drainClaims`, `blockUnavailableCheck`).

Out of scope:

- Making advisory criteria decisive by adding heuristics.
- Changing verdicts for criteria already decisive.
- The browser-fact defects (handled by P0-3 and P1-11).

## Assumptions

- Criteria 1.4.5, 1.4.11, 1.4.13, 2.1.4, 2.5.1, 3.1.2, 3.2.2, 4.1.3 and their peers that only emit `needsReview` are advisory today; the plan confirms the list by scanning probe bodies for `needsReview` as the sole non-pass path.
- `cantTell` remains unresolved in `run-status.ts`; advisory probes therefore never complete the audit on their own.

## Requirements

### Functional

- FR-1: Each probe declares its class in its module map (`decisiveProbes` vs `advisoryProbes`).
- FR-2: Advisory judgements carry `nextAction`: a shell/MCP command string plus the capability it needs (e.g. `tree --role img`, `sr_action elements kind=heading`, `a1 wcag 2.5.1`).
- FR-3: `runAuditProbes` records only decisive outcomes; advisory claims are returned to `queued` with the next action in the status issue.
- FR-4: `judgeCriterion` never returns a decisive `passed` when the probe saw an ambiguous signal (it returns advisory `cantTell` instead).

### Non-functional

- NFR-1: Reclassification must be reviewable: one table in the plan PR listing all 55 criteria and their class with a one-line justification.
- NFR-2: No regression in decisive coverage; total auto-recorded checks must not silently drop.

## Design

- Types: `Judgement = DecisiveJudgement | AdvisoryJudgement`, where decisive has `outcome: passed|failed|inapplicable` and advisory has `outcome: cantTell` plus `nextAction: { command, capability }`.
- `judge.ts`: `hasProbe` splits into `hasDecisiveProbe` / `hasAdvisoryProbe`. `judgeCriterion` returns the advisory result untouched.
- `probe-run.ts`: `drainClaims` skips advisory-only criteria (leaves them queued); `runClaim` is only invoked for decisive probes.
- Status issues: advisory results appear as `audit-check-needs-review` with the next action, sorted ahead of generic blocked items.
- Skills: document that advisory criteria require the named command; the agent must not record a `cantTell` from a probe paragraph.

## Implementation steps

1. Audit all 55 probes; produce the decisive/advisory table (review doc Appendix as starting point).
2. `probe-types.ts`: add the discriminated types and `advisory()` constructor.
3. Move probes between maps; convert paragraph-only `needsReview` returns to advisory with `nextAction`.
4. `judge.ts`, `probe-run.ts`: enforce the split; stop auto-recording advisory verdicts.
5. `run-status.ts`: surface advisory next actions as actionable issues.
6. Update the skill text that currently describes probe verdicts as decisions.

## Testing

- Unit: per-criterion class assertions (decisive criteria never produce `cantTell`; advisory criteria always carry `nextAction`).
- Integration: fixture site; `audit probe` auto-records only decisive criteria and leaves advisory criteria queued with the right next command.
- Snapshot: status issue list for the fixture shows advisory next actions verbatim.

## Risks

- Large drop in auto-recorded coverage may look like a regression: mitigate with the explicit table and a report count of "decisive vs advisory pending".
- Agents may paste the advisory `nextAction` blindly: the command is a suggestion; the procedure still governs judgment.

## Acceptance criteria

- No advisory heuristic is recorded as `passed`/`failed`.
- Every advisory result names a concrete next command.
- `npm run standards` and `npm test` pass; probe tests updated.

## Sequencing

Depends on P0-1 (scanner closure) and P0-3 (probe fixes) for the final classification. Independent of the coordinator changes (P1).

# Desktop audit implementation evidence

This document records implementation and verification for the
[desktop audit plan](a11ied-agent-led-desktop-audit-plan.md).
Beads owns work status. An empty evidence entry means the requirement has not
been proved. Source tests and virtual-reader tests do not prove real reader behavior.

| Bead             | Requirement                                    | Implementation evidence                                                                    |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `a11lied-j24.1`  | Correct criterion outcomes                     | Scanner and procedure outcomes remain separate; see the receipt below.                     |
| `a11lied-j24.2`  | Executable WCAG procedures                     | Catalog, capability, and coverage-gap checks pass; see the receipt below.                  |
| `a11lied-j24.3`  | Durable runs and scoped obligations            | State, journey, identity, and concurrency checks pass; see the receipt below.              |
| `a11lied-j24.4`  | Evidence provenance                            | Evidence awaits implementation review.                                                     |
| `a11lied-j24.5`  | Reader target binding                          | Evidence awaits implementation review.                                                     |
| `a11lied-j24.6`  | Shared observed session                        | Evidence awaits implementation review.                                                     |
| `a11lied-j24.7`  | Accurate capabilities and bounded observations | Evidence awaits implementation review.                                                     |
| `a11lied-j24.8`  | Resumable assessment lifecycle                 | Evidence awaits implementation review.                                                     |
| `a11lied-j24.9`  | State and journey discovery                    | Evidence awaits implementation review.                                                     |
| `a11lied-j24.10` | Interaction and visual probes                  | Evidence awaits implementation review.                                                     |
| `a11lied-j24.11` | Judgment and unresolved work                   | Evidence awaits implementation review.                                                     |
| `a11lied-j24.12` | Recovery and action policy                     | Evidence awaits implementation review.                                                     |
| `a11lied-j24.13` | Native desktop assessments                     | Evidence awaits implementation review.                                                     |
| `a11lied-j24.14` | Behavioral findings and honest reports         | Evidence awaits implementation review.                                                     |
| `a11lied-j24.15` | CLI and MCP parity                             | Evidence awaits implementation review.                                                     |
| `a11lied-j24.16` | Runtime-loop skills                            | Evidence awaits implementation review.                                                     |
| `a11lied-j24.17` | Installed setup diagnostics                    | Independently reviewed doctor/config/packed CLI/MCP/skills checks pass; see receipt below. |
| `a11lied-j24.18` | Desktop evaluation corpus                      | Evidence awaits implementation review.                                                     |
| `a11lied-j24.19` | Installed real-platform proof                  | Evidence awaits real VoiceOver, NVDA, and full-site audit receipts.                        |
| `a11lied-j24.20` | Documentation and marketing                    | Evidence awaits verified product behavior.                                                 |
| `a11lied-j24.21` | axe-core license decision                      | Maintainer-approved exception recorded in the dependency policy.                           |
| `a11lied-xj9`    | Dependency security advisories                 | Patched dependency tree has zero reported npm vulnerabilities.                             |
| `a11lied-j24.22` | Existing dependency exceptions                 | Maintainer-approved FFmpeg, Sharp/libvips, and Lightning CSS exceptions are documented.    |
| `a11lied-j24.23` | Durable checkpoint-scoped waits                | Reviewed CLI/MCP and lifecycle regressions pass; see the receipt below.                    |
| `a11lied-j24.24` | Reachable recovery owners                      | Startup, ephemeral, metadata, and public-library cleanup retries pass; see receipt below.  |
| `a11lied-j24.25` | Independent CLI click regressions              | Split checks retain their assertions and timeouts; all 724 tests pass.                     |

## Criterion outcome receipt

[The strategy mapping](../../packages/wcag-data/src/test-methods/strategy.ts)
requires assessment beyond scanner mappings.
[The shared rollup](../../packages/core/src/audit/criteria-rollup.ts#L67)
keeps incomplete scanner work pending and prevents scanner-only criterion passes.
[Evidence coverage](../../packages/core/src/evidence/criteria.ts)
requires every listed procedure separately from the recorded outcome.
CLI, reports, and criterion EARL assertions use the same outcome calculation.

Verification on 2026-10-01: workspace standards, WCAG artifact validation, prose,
and 124 affected tests passed. An independent agent reviewed the implementation;
the resulting findings were fixed and reviewed again. Playwright verified the
test-methods page at localhost:4325.

The saved Fireside draft was rebuilt under
`.a11ied/audits/20261001T1523Z-createdbyfireside-com/criterion-correction/`.
It has 24 scanned pages, zero completed page assessments, zero criterion passes,
40 failures, and 1,280 not-tested entries. This is saved-artifact verification,
not a fresh complete site audit. Legacy stored metadata still needs normalization.

## Executable procedure receipt

[Procedure contracts](../../packages/contracts/src/schemas/wcag.ts) define versioned
applicability, scope, capabilities, actions, evidence, outcome guidance, recovery,
limitations, and sources. [The curated catalog](../../packages/wcag-data/data/curated/desktop-procedures.json)
covers all 55 WCAG 2.2 A/AA criteria and all 50 WCAG 2.1 A/AA criteria.
[Generation](../../packages/wcag-data/src/test-methods/procedures.ts) retains useful
named checks and replaces generic reviews with criterion-specific procedures.
AAA gaps remain explicit and cannot be fulfilled by old imported procedure IDs.
[CLI guidance](../../packages/cli/src/renderers/wcag-testing.ts) exposes the steps;
the existing CLI and MCP JSON queries return the same catalog.

Verification on 2026-10-01: standards, WCAG validation, prose, and all 590 tests
across 98 files passed after the final build. The independent review found no
remaining blockers and passed 19 affected tests across five files. Built CLI
checks for `wcag 2.2.1` and `wcag criteria --summary --json` confirmed readable
guidance, 55 defined procedures, and 31 explicit WCAG 2.2 coverage gaps.
The full-suite receipt is `/private/tmp/a11ied-desktop-final-procedure-tests.log`.

## Durable run receipt

[Run contracts](../../packages/contracts/src/schemas/audit-run.ts)
persist target, profile, environments, states, ordered journeys, action policy,
and scoped obligations. Component and element obligations require a pointer.
[State transitions](../../packages/core/src/audit/run-state.ts)
invalidate changed scope and derive coverage independently of page flags.
[The store](../../packages/core/src/audit/run-store.ts)
validates safe run IDs and immutable identity, and rejects obsolete revisions.
[Atomic writes](../../packages/core/src/files/atomic-json.ts)
use unique private files and serialize read-modify-write operations.
[Inventory migration](../../packages/core/src/audit/run-inventory.ts)
preserves concurrent updates and imports no assessment evidence from page flags.

Verification on 2026-10-01: workspace standards passed. The final independent
review passed 19 tests across run-store, run-integrity, discovery runtime, and
public-api-docs. The added regression rejects invalid duplicate journey requests.
The built CLI program suite passed all eight cases after the packaging fix.
The CLI declares its external lock dependency directly.

Scope limit: completion remains a stored flag until the derived lifecycle in
`a11lied-j24.8` is implemented. It is not used as proof of coverage here.

## Evidence integrity progress

[The evidence boundary](../../packages/core/src/evidence/validation.ts) checks run,
procedure, environment, state, action ranges, and registered artifacts.
[Artifact validation](../../packages/core/src/evidence/artifacts.ts) checks hashes,
capture chronology, scoped APG observations, and documented typed keypresses.
[The report loader](../../packages/core/src/report/loaded-audits.ts) reads current
judgments instead of saved scan judgments. Assessment integrity errors block final
reports even when a page has an explained authentication failure.
[APG row identities](../../packages/core/src/apg/row-key.ts) distinguish colliding
table rows across recording, pending checks, probe results, and applicability hints.

Verification on 2026-10-01: standards, builds, and example typechecking passed.
All 36 affected tests across seven files passed with local Chromium access.
The independent source review cleared both report readiness and APG identity findings.
The focused receipt is `/private/tmp/a11ied-continuation2-focused-tests.log`.
The preceding full run passed 602 tests and failed six tests; the focused run covers
all six corrected failures. No final full-suite receipt is claimed for these edits.

Playwright checked the saved Fireside draft and an explicitly labeled presentation
fixture. The fixture displays recorded passes as unverified, without a passed badge.
This verifies report presentation, not an accessibility judgment about Fireside.

Scope limit: real-reader evidence remains rejected until target and session receipts
are implemented in T-05 and T-06. The evidence bead remains open.

## Dependency receipts

[The license policy](../dependency-licenses.md) records the approved axe-core
exception. The release checklist links the policy and requires the license check.
The exception does not permit other MPL dependencies.

The lock dependency is MIT-licensed and pinned to 4.1.2 in core and CLI.
The dependency security update patches affected transitive packages and overrides
tsup's esbuild to 0.28.2. Workspace builds and built CLI tests passed.
`npm audit --json` reported zero vulnerabilities on 2026-10-01.

## Dependency decision receipt

The maintainer explicitly approved the existing FFmpeg, Sharp/libvips, and Lightning
CSS dependency families in `a11lied-j24.22`.
[The dependency policy](../dependency-licenses.md) records their locked versions,
licenses, paths, uses, and redistribution requirements.
[The release checklist](../maintainer-release-checklist.md) requires checking those
exceptions before publication. Independent review confirmed the lockfile matches
and cleared the version, package-set, distribution, and corresponding-source
guardrails. This records approval; it does not prove compliance of a future binary
release.

## Installed setup receipt

`a11lied-j24.17` uses the shared
[doctor request schema](../../packages/contracts/src/schemas/core.ts) for CLI and MCP.
[Doctor checks](../../packages/core/src/doctor/runtime.ts) distinguish scans, reader
sessions, audits, and requested recording. Corrupt dependencies require reinstallation;
recording errors retain their own diagnostics.
[Version reporting](../../packages/core/src/doctor/versions.ts) identifies OS reader
versions and Guidepup manifests without presenting installation as compatibility proof.
[The support guide](../../packages/docs/src/pages/guides/screen-reader.astro) records
available pairings and their verification limits.

[The tracked MCP configuration](../../mcp.example.json) separates executable and
arguments. [The CLI build](../../packages/cli/tsup.config.ts) includes both skills.
[The installation test](../../packages/cli/src/testing/packed-install.test.ts) packs
eight runtime workspaces, installs them outside the repository, launches CLI and MCP,
byte-compares every skill/resource/script, and checks broker and virtual-page entries.

Independent source review cleared the implementation. Workspace standards and prose
checks passed. The final focused run passed 47 tests across eight files, including
doctor, isolated installation, and checkpoint-wait regressions. Playwright checked
the source-checkout instructions, doctor examples, and support guide in the current
Astro checkout at localhost:4325. No real reader was started during these checks.

## Reader lifecycle receipt

[The ownership wrapper](../../packages/guidepup/src/leased-reader.ts) checks the
desktop lease before input and retains ownership until native shutdown is confirmed.
[The adapter queue](../../packages/guidepup/src/adapters.ts) serializes complete
logical actions and prevents earlier startup requests from surviving a later stop.
[The context queue](../../packages/core/src/driver/context-queue.ts) rejects actions
submitted during shutdown.
[The wait implementation](../../packages/core/src/driver/broker-wait.ts) releases the
action queue between observations and cancels pending waits when the session closes.

The final lifecycle verification passed 75 tests across 11 files, and workspace
standards passed. Independent review cleared the shutdown, compound-action, restart,
and startup-cancellation changes. These results do not complete `a11lied-j24.5`:
fresh process/window/document/reader-cursor binding and startup target ordering still
need implementation and real-platform verification.

## Final review boundary

The final implementation review and a separate review of this evidence document
remain required by `a11lied-j24.19`. No product completion claim is recorded here.

## Checkpoint wait receipt

`a11lied-j24.23` is complete. Checkpoint-scoped waits reuse the last matching
checkpoint and retain announcements captured between CLI commands. Unscoped waits
match only announcements observed after waiting starts. Missing checkpoints fail
explicitly. Contracts, library requests, CLI options, MCP inputs, and support
references expose the same behavior.

Independent review cleared the source changes. The built CLI/MCP and lifecycle
regression run passed 76 tests across ten files. The receipt is
`/private/tmp/a11ied-cleanup-verified-tests.log`. Workspace standards passed in
`/private/tmp/a11ied-cleanup-standards.log`. No native reader was started.

## Recovery owner review

Explicit-stop cleanup now finishes recording before releasing reader ownership.
Failed shutdown keeps the broker endpoint reachable and blocks further input.
The public library retains failed stop attempts for retry. Independent review
cleared those changes. The following receipt covers startup and ephemeral cleanup
as well. Target and reader cursor binding in `a11lied-j24.5` remains incomplete.

## Retained recovery owner receipt

[Session initialization](../../packages/core/src/driver/session-context.ts) keeps a
stopping context when recorder or reader cleanup is unconfirmed.
[The in-process registry](../../packages/core/src/driver/runtime-internal.ts) retains
startup, metadata, and library-disposal owners and finalizes successful retries.
[Native ephemeral actions](../../packages/core/src/driver/runtime-ephemeral.ts) use
detached brokers and send input to the session they started.
[The CLI mode selector](../../packages/cli/src/lib/execute.ts) keeps both explicit
and automatic native startup outside the one-shot CLI process.

[Broker startup](../../packages/core/src/driver/broker.ts) binds its endpoint before
acquiring native resources. [Startup polling](../../packages/core/src/driver/broker-client.ts)
waits through pending initialization and reports terminal startup errors.
[Recovery metadata](../../packages/core/src/driver/session-utils.ts) never overwrites
another owner's record. CLI and MCP stop can address the recovery session ID even
when metadata could not be published.

[Failure serialization](../../packages/core/src/driver/broker-errors.ts) preserves
original failure reasons with bounds on graph traversal, count, and text length.
[Stop responses](../../packages/core/src/driver/broker-handlers.ts) distinguish
unconfirmed shutdown from artifact failures after resource shutdown was confirmed.
[Recording completion](../../packages/core/src/driver/recording-command.ts) treats
confirmed spawn failure as terminal without claiming live-child errors are safe.

Verification on 2026-10-02: standards passed after the final source changes. The
recovery regression run passed 81 tests across ten files, including CLI, MCP,
sockets, public disposal, metadata ownership, and mocked native boundaries.
Independent source review cleared the repaired recovery paths.
Receipts: `/private/tmp/a11ied-recovery-final-standards.log` and
`/private/tmp/a11ied-recovery-verified-tests.log`. The final stop-response regression
run passed 31 tests across four files; its receipt is
`/private/tmp/a11ied-recovery-final-focused-tests.log`.
The earlier full suite passed 717 tests and timed out on one combined CLI scan
check; its isolated file passed all seven tests. T-25 split the independent click
checks without raising their timeout. After the repair and transcript changes,
`npm run test -- --maxWorkers=4` passed all 724 tests across 118 files. The retained
receipt is `/private/tmp/a11ied-transcript-window-full-tests.log`.
Playwright verified the rendered CLI/MCP references and reader support guide.
Snapshots are retained in `/private/tmp/a11ied-docs-recovery-cli-snapshot.yml`,
`/private/tmp/a11ied-docs-recovery-mcp-snapshot.yml`, and
`/private/tmp/a11ied-docs-recovery-guide-snapshot.yml`.
No native reader, desktop input, or screen recording was used. These checks do
not prove full real-reader target binding or installed desktop audit completion.

## Transcript paging receipt

The [shared transcript action](../../packages/core/src/driver/context-action.ts#L69)
selects entries before broker responses are serialized.
CLI and MCP requests use that selection once; the library uses the same action path.
The [request schema](../../packages/contracts/src/schemas/driver-transcript.ts#L6)
validates the bounds. [Entry limiting](../../packages/core/src/driver/transcript-recorder.ts#L91)
defaults index paging to 200 entries, and an explicit limit counts checkpoints as
well as phrases. Invalid bounds and cursors ahead of the retained history are rejected.
[Selected snapshots](../../packages/core/src/driver/transcript-recorder.ts#L190)
omit duplicate raw speech logs and include only their selected checkpoints.
Returned arrays do not expose the recorder's retained array; the
[isolation regression](../../packages/core/src/driver/transcript-window.test.ts#L119)
checks an unbounded selection too.

Session indexes survive selection. Window metadata reports total, selected, returned,
and omitted entries, whether the full history is included, whether more selected
entries remain, and the next index. JSON and Markdown exports preserve that disclosure.
[The public library](../../packages/core/src/driver/screen-reader.ts#L168)
returns window metadata through `state(selection)` and entries through
`transcript(selection)`. [CLI export](../../packages/cli/src/commands/drive-transcript.ts#L47)
and [MCP export](../../packages/mcp-server/src/tools/sr-transcript.ts#L110) preserve
the metadata. Calls without selection retain access to the full transcript.

Verification on 2026-10-02: the first focused run passed 66 tests across ten files.
After the array-isolation repair, the final library run passed 19 tests across three
files. Final standards passed, including builds and example typechecks. The full
suite passed 724 tests across 118 files with four workers. Receipts:

- `/private/tmp/a11ied-transcript-window-focused-tests.log`
- `/private/tmp/a11ied-transcript-window-final-focused-tests.log`
- `/private/tmp/a11ied-transcript-window-final-standards.log`
- `/private/tmp/a11ied-transcript-window-full-tests.log`

Playwright verified the rendered guide and CLI/MCP references. Retained snapshots:

- `/private/tmp/a11ied-docs-transcript-guide-snapshot.yml`
- `/private/tmp/a11ied-docs-transcript-cli-snapshot.yml`
- `/private/tmp/a11ied-docs-transcript-mcp-snapshot.yml`

Independent source review cleared the paging and test split. T-07 remains open for
separate target, keyboard-focus, and reader-cursor observations. Its T-05 dependency
still needs trustworthy native target binding. None of these checks started a native
reader, typed into the desktop, recorded the screen, or proved a complete native audit.

## Initial assessment coordinator receipt

T-08 remains open. This slice implements shared lifecycle operations and public
package exports; it does not establish a complete installed native audit.

[Start, next, status, resume, and finalize](../../packages/core/src/audit/run-lifecycle.ts#L18)
use the existing durable run store.
[Locked updates](../../packages/core/src/audit/run-store.ts#L163) support async
evidence validation. [Catalog obligations](../../packages/core/src/audit/run-obligations.ts#L8)
include all levels through the selected profile, explicit procedure gaps, states,
site checks, and ordered journey checks. Generic fallback procedures for catalog
gaps cannot become executable work.

[A persisted active claim](../../packages/contracts/src/schemas/audit-run.ts#L134)
survives automatic state or journey invalidation. The coordinator cannot claim a
second check until the first claim is completed or explicitly recovered.
[Result transitions](../../packages/core/src/audit/run-state.ts#L197) require saved,
verified evidence with matching outcomes and current-attempt capture times.
Repeated attempts cannot reuse earlier proof. Conflicting or obsolete records
cannot satisfy completion. Identical state observations retain their original
timestamp; site invalidation affects only the relevant environments.

[Validated coverage](../../packages/core/src/audit/run-status.ts#L248) replaces the
old helper that counted stored evaluated flags. It checks canonical obligation
identity, ordered state references, current artifacts, and discovery scope.
[Scoped progress](../../packages/core/src/audit/run-status.ts#L155) derives state,
page, and journey coverage from required checks. Journeys include their constituent
state and site checks. Catalog gaps, blocked processes, and mixed environments
cannot produce a complete scope. Saved page or journey completion flags do not
establish assessment coverage.

[Discovery validation](../../packages/core/src/audit/run-scope.ts#L109) keeps missing
or corrupt inventories visible as unresolved issues while preserving partial
status. URL normalization applies to discovery document identity. Observed route
identity retains hashes; redirect aliases require the matched inventory and the
requested hash. Canonical hints and shared layouts do not substitute for coverage.

Independent source review cleared all reported concurrency, identity, recovery,
scope, and redirect defects. Final focused verification on 2026-10-02 passed 43
tests across six files. Standards passed lint, formatting, typechecks, builds,
and example typechecks. Built-package inspection verified nine public assessment
operations. Playwright MCP verified the rendered API reference, its ToC entry,
operation descriptions, native limitations, and absence of horizontal overflow.
Receipts:

- `/private/tmp/a11ied-coordinator-final-focused-tests.log`
- `/private/tmp/a11ied-coordinator-final-standards.log`
- `/private/tmp/a11ied-coordinator-public-exports.log`
- `/private/tmp/a11ied-coordinator-api-snapshot.yml`
- `/private/tmp/a11ied-coordinator-api-rendered.json`

The full suite finished with 770 passing tests and three failures across 124 files.
The retained log is `/private/tmp/a11ied-coordinator-full-tests.log`. The CLI text
timeout is tracked in `a11lied-j24.26`; the virtual reader lifecycle and native
fixture boundary failures are tracked in `a11lied-j24.27`. A passing full-suite
receipt after those repairs is still required. These persistence and browser-documentation
checks do not start a native reader, send desktop input, or prove complete
WCAG coverage. T-05/T-04 native session/action/speech receipts, live-session integration, CLI/MCP
orchestration, and installed desktop verification remain unfinished.

## Reader observations and heading navigation receipt

T-07 remains open. The implemented slice makes observation failures visible and
keeps keyboard focus, parsed speech, and reader cursor identity separate.
[Observation contracts](../../packages/contracts/src/schemas/driver-focus.ts#L56),
[native collection](../../packages/guidepup/src/native-observations.ts#L56), and
[CLI rendering](../../packages/cli/src/renderers/drive-details.ts#L8) report
unavailable or unsupported observations with reasons. Native target binding is
unavailable; native reader cursor identity is unsupported.

[AX property collection](../../packages/guidepup/src/ax-properties-mac.ts#L70)
preserves process and malformed-record failures.
[Mandatory speech reads](../../packages/guidepup/src/adapter-shared.ts#L117)
propagate failures instead of returning empty observations.
[Native current-item reads](../../packages/guidepup/src/adapters.ts#L136) omit
position tokens; parsed text cannot establish cursor identity.

[VoiceOver heading navigation](../../packages/guidepup/src/real-steps.ts#L131)
moves before checking the destination, counts that move inside the search limit,
and reports an unconfirmed destination when the limit is reached.
[Speech parsing](../../packages/guidepup/src/current-item.ts#L133) reads the level
only from a recognized final role chunk. Names and unrecognized or localized role
chunks cannot establish a heading level. Duplicate announcements do not prove the
end of navigation.

Final focused verification on 2026-10-02 passed 59 tests across eight files after
the ambiguous-role guards and test grouping repair. Standards passed lint,
formatting, typechecks, builds, and example typechecks. Receipts:

- `/private/tmp/a11ied-observation-final-focused-tests.log`
- `/private/tmp/a11ied-observation-final-standards.log`
- `/private/tmp/a11ied-docs-observation-guide-snapshot.yml`

The documentation snapshot verifies the rendered local screen-reader guide.
Reader tests use mocked native boundaries or virtual documents. These checks did
not start a native reader, send desktop input, record a screen, or prove a complete
native audit. T-05 and T-04 still require trustworthy native session/action/speech receipts.

## Independent CLI click regression receipt

`a11lied-j24.25` separates [dialog scanning](../../packages/cli/src/testing/handlers-axe-scan-options.test.ts#L121)
from [missing click-target rejection](../../packages/cli/src/testing/handlers-axe-scan-options.test.ts#L140).
The [registered checks](../../packages/cli/src/testing/handlers-axe-scan-options.test.ts#L153)
retain the original assertions and 60-second timeout per test. Production behavior
and runtime timeouts are unchanged. The combined check previously approached its
timeout when run alone and timed out under full-suite load.

After the split, `npm run test -- --maxWorkers=4` passed 724 tests across 118 files;
`/private/tmp/a11ied-transcript-window-full-tests.log` retains the result. Final
standards and lint passed. Independent source review cleared the split; separate
proof review checks this receipt before closure.

## Audit text and driver regression receipt

`a11lied-j24.26` separates the failing-page, passing-page, and verbose CLI
commands in [the audit text tests](../../packages/cli/src/testing/handlers-audit.test.ts#L141).
All original assertions and the 60-second per-test limit remain. Independent
source review cleared the final verbose-command separation. The focused CLI
receipt passed eight tests in one file.

`a11lied-j24.27` enforces a single owner for the shared JSDOM document in
[the virtual host](../../packages/guidepup/src/virtual-dom.ts#L120). Its lifecycle
queue serializes attachment, startup, stopping, and disposal. Failed
uninitialized loading releases ownership; a loaded reader whose stop fails keeps
ownership for an explicit retry. Cleanup checks ownership again after awaiting
stop. The [runtime](../../packages/guidepup/src/virtual-runtime.ts#L122) propagates
stop failures. The existing browser virtual engine uses separate documents.

[Ownership regressions](../../packages/guidepup/src/virtual-dom.test.ts#L1) cover
competing starts, attachments, overlapping shutdown, loader failures, stop retries,
and ownership transfer. Driver regressions cover persistent and ephemeral
conflicts. [URL persistence fixtures](../../packages/core/src/driver/context-start.test.ts#L30)
use an explicit virtual session for URL persistence.
[Startup fixtures](../../packages/core/src/driver/context-start.test.ts#L30)
retain controlled native startup and focus ordering checks. They do not open or focus a native browser to
verify virtual URL persistence. Independent source review cleared these repairs.
The focused driver receipt passed 47 tests across five files.

Receipts:

- `/private/tmp/a11ied-driver-regression-final-cli-tests.log`
- `/private/tmp/a11ied-driver-regression-final-driver-tests.log`
- `/private/tmp/a11ied-driver-regression-final-standards.log`
- `/private/tmp/a11ied-driver-regression-guide-rendered.json`
- `/private/tmp/a11ied-driver-regression-api-rendered.json`

Separate proof review and a fresh passing full-suite receipt remain required
before closing either regression bead. These checks establish lifecycle and
fixture behavior; they provide no native reader or completed site-audit receipt.

## Shared browser document and simulated reader receipt

T-06 remains open. [Browser observations](../../packages/core/src/browser/current-page.ts#L55)
reject closed pages, target/source mismatches, replacement setup, and main-document
navigation during a read, including a same-URL reload. The shared loader records
inline source identity and clears it on navigation. Reads accept only that source
for an existing inline page; supplied replacement HTML is rejected.

[The shared loaders](../../packages/core/src/browser/shared-browser.ts#L204)
retain the page throughout a callback and apply storage and UI setup once.
The headed loader supports sign-in within that callback. [Report collection](../../packages/core/src/audit/runtime.ts#L205)
uses one document for axe, tree, title, and rendered HTML, with an outer document
change guard. Collection errors propagate instead of loading a different document.
The URL-only axe result cache was removed.

[Per-page axe ownership](../../packages/core/src/axe/scan.ts#L143) rejects a
competing scan before injection. The axe bundle executes through Playwright's
evaluation boundary, so a caller's strict CSP need not change.

[The borrowed reader owner](../../packages/core/src/driver/virtual-page-owner.ts#L113)
uses a page-specific token and the existing command queue. Startup rejects a changed
initial document before instrumentation. All reader actions and lifecycle calls
check ownership. Stop failures retain cleanup ownership for retry; an uninitialized
or destroyed document can release it. Repeated or stale disposal cannot stop a
new owner's reader. The caller's page stays open.

[Browser reader injection and recovery](../../packages/core/src/driver/virtual-playwright-host.ts#L65)
use the evaluation boundary and install no permanent init script on a borrowed
page. [Session startup](../../packages/core/src/driver/session-context.ts#L247),
attachment, and initial state capture share a document guard. Browser snapshots collect speech and cursor in one guarded
evaluation. Passive reads can recover after reload. Recovery failures propagate;
interrupted input and find actions reject instead of replaying.
[The library reader](../../packages/core/src/driver/screen-reader-node.ts#L220)
accepts a page only for the in-process virtual browser engine. Broker, native,
inline replacement, and JSDOM combinations reject before page mutation.

[Current-page regressions](../../packages/core/src/browser/current-page.test.ts#L1)
and [reader ownership regressions](../../packages/core/src/driver/virtual-page-owner.test.ts#L1)
exercise retained cookies/session storage, fresh same-URL scans, one report visit,
current reader names, screenshots from that page, target/source/setup rejection,
same-URL reloads, competing scans, strict CSP, failed startup, cleanup retry,
stale handles, destroyed documents, failed recovery, snapshot parity, and navigation
during find. The focused run passed 34 tests across five files. Final standards passed lint, formatting, typechecks,
builds, and example typechecks. Built CLI entry points expose the shared loaders,
report builder, and scanner; the test entry point exposes the reader.

Playwright MCP verified the rendered API example uses createdbyfireside.com,
includes page-bound reader usage and native limitations, has a ToC entry, and
has no horizontal overflow.

Receipts:

- `/private/tmp/a11ied-current-page-final-focused-tests.log`
- `/private/tmp/a11ied-shared-page-final-standards.log`
- `/private/tmp/a11ied-shared-page-public-exports.json`
- `/private/tmp/a11ied-current-page-api-snapshot.yml`
- `/private/tmp/a11ied-current-page-api-rendered.json`

The shared browser path and simulated reader do not establish native document or
cursor binding. T-05 native receipts, CLI/MCP integration, live sign-in and target
verification, a passing full suite, and installed audit proof remain unfinished.
Independent source review cleared this slice. Separate proof clearance and a fresh
full-suite result remain required.

## Browser activation and independent-call isolation receipt

The first fresh full-suite run passed 783 tests and failed 11 across 127 files.
The failures exposed activation and fixture isolation defects; that run does not
qualify as a passing release receipt.

`a11lied-j24.28` uses [one bound activation handle](../../packages/core/src/driver/virtual-playwright-host.ts#L108).
The browser clicks the actual virtual cursor node with a bounded timeout and
explicit navigation waiting. It never resolves a replacement selector or replays
input. A retained Document handle distinguishes document replacement from hash
navigation. New-document initialization precedes a consistent reader snapshot;
Same-document activation and repeated startup preserve cursor and speech history. Temporary handles
are disposed after failed preparation as well as after input.

[Runtime readiness](../../packages/guidepup/src/virtual-runtime.ts#L135) distinguishes
an injected bundle from an initialized reader. The browser preflight starts an
uninitialized runtime after deferred navigation. A replaced container clears
the old reader cache before startup. Browser activation uses mouse movement,
scrolling, and Playwright actionability checks, as disclosed in the API guide;
these simulated checks are not native screen reader receipts.

[Activation checks](../../packages/core/src/driver/virtual-browser-activation.test.ts#L41)
cover one click across document navigation, duplicate button labels, hash-state
retention, dialog interactions, detached targets, and an absent cursor.
[Owned-page recovery](../../packages/core/src/driver/virtual-browser-recovery.test.ts#L17)
covers a deferred application navigation with an injected but uninitialized
reader. Existing interrupted-find and guarded-snapshot checks remain passing.

`a11lied-j24.29` restores mocks before actual fixture teardown in cleanup, startup,
action, wait, and transcript checks. [Recovery fixtures](../../packages/core/src/driver/context-recovery.test.ts#L49)
are tracked before subsequent setup. Metadata ownership uses a second metadata
record without starting an irrelevant competing reader. The focused fixture
receipt passed 45 tests across six files, retaining production cleanup and
recovery assertions.

`a11lied-j24.30` keeps browser startup pooling and creates a fresh page/context
for each independent [browser callback](../../packages/core/src/browser/shared-browser.ts#L121).
Explicit caller pages still retain current authentication and UI.
[Isolation checks](../../packages/core/src/browser/shared-browser-isolation.test.ts#L17)
cover earlier callback navigation, same-URL document mutation, cookies, and
session storage. The affected browser and reader run passed 46 tests across nine
files. Final standards passed. Playwright MCP verified the rendered limitation
text, Fireside example, contents link, and absence of horizontal overflow.

Receipts:

- `/private/tmp/a11ied-shared-page-full-tests.log` (failed baseline)
- `/private/tmp/a11ied-fixture-cleanup-focused-tests.log`
- `/private/tmp/a11ied-navigation-initial-tests.log` (13 tests, including CLI navigation)
- `/private/tmp/a11ied-browser-proof-focused-tests.log`
- `/private/tmp/a11ied-browser-proof-standards.log`
- `/private/tmp/a11ied-browser-final-api-rendered.json`

The frozen-source full suite passed 801 tests across 130 files in 427.47 seconds.
Receipt: `/private/tmp/a11ied-browser-proof-full-tests.log` (exit code 0).
Independent source review cleared these regression repairs. Separate proof review
cleared the limited shared-page slice and `.26` through `.30`; the required fresh
full-suite gate has passed. Native binding and complete CLI/MCP audit integration
remain unfinished.

## Assessment lifecycle command receipt

T-15 exposes a coordinator slice through CLI and MCP. It does not drive the UI,
build the final report, or establish native audit completion.

[Shared requests](../../packages/contracts/src/schemas/audit-assessment.ts) validate
start, state, journey, queue, next, status, resume, evaluate, block, and finalize.
[The shared adapter](../../packages/core/src/audit/assessment-command.ts#L226)
delegates to the existing coordinator. Status collections default to 20 entries
and cap at 100. Mutation identities and revisions are returned independently of
pagination. Selected state context follows the check's ordered state IDs; site
checks collect states in the check environment.

[CLI commands](../../packages/cli/src/commands/audit-assessment.ts#L296) and
[the MCP tool](../../packages/mcp-server/src/tools/audit-assessment.ts) share those
requests and operations. Start accepts a run ID and action policy. CLI rejects
simultaneous URL/app targets. [The stdin guard](../../packages/cli/src/commands/audit-assessment.ts#L50)
rejects two inputs that would both consume stdin; the parity tests do not exercise
that rejection branch.
[Text output](../../packages/cli/src/renderers/assessment.ts#L143) exposes recovery
issues, saved identities, coverage, and quoted commands for additional pages.
The CLI and MCP references disclose the agent's responsibility to execute each
procedure and supply evidence and judgment.

The following repairs are tracked separately from full T-15 acceptance:

1. `.31`: [queue validation](../../packages/core/src/audit/run-state.ts#L176)
   resolves the real catalog procedure, exact version, allowed scope, and APG row
   before writing. [Shared scope validation](../../packages/core/src/evidence/validation.ts#L160)
   permits additive widget checks without replacing required state obligations.
2. `.32`: [claim validation](../../packages/core/src/audit/assessment-command.ts#L241)
   rejects changed run revisions, including retries that retain the check ID.
3. `.33`: [the text renderer](../../packages/cli/src/renderers/assessment.ts#L70)
   quotes run paths for POSIX shells or PowerShell and includes the CLI executable
   in paging commands. Normal output includes blocked and missing-work issues.
4. `.34`: [input parity checks](../../packages/mcp-server/src/audit-assessment-input.test.ts#L138)
   exercise custom IDs, action policy, environment stdin with a policy file, and
   recovery output.
5. `.35`: [selected-context regressions](../../packages/core/src/audit/assessment-command.test.ts#L209)
   cover registration beyond the first page, ordered journey context, and fixture
   widget evidence recording/evaluation with separate required state checks.
6. `.36`: [evidence obligation enumeration](../../packages/core/src/evidence/validation.ts#L30)
   unions independently derived catalog obligations with saved checks before
   criterion rollup. Derived obligations take precedence over stale saved scope.
   [Regressions](../../packages/core/src/evidence/criteria.test.ts#L12) record verified
   widget evidence with no queued required state check and require the whole
   criterion to remain pending. A stale saved journey cannot hide current scope.

The `.36` regression failed before the shared fix: the pending procedure list
was empty despite an unsaved required `wcag_4_1_1` state obligation. Receipt:
`/private/tmp/a11ied-unsaved-obligations-red.log`.

Final standards and formatting passed after the journey precedence correction.
The expanded focused run passed 77 tests across 14 files after `.37`. The frozen-source full suite passed 819 tests across 134 files in 391.67 seconds (exit code 0). Receipt paths:

1. `/private/tmp/a11ied-lifecycle-format.log`
2. `/private/tmp/a11ied-lifecycle-final-standards.log`
3. `/private/tmp/a11ied-lifecycle-final-focused-tests.log`
4. `/private/tmp/a11ied-lifecycle-final-full-tests.log`
5. `/private/tmp/a11ied-lifecycle-cli-rendered.json`
6. `/private/tmp/a11ied-lifecycle-mcp-rendered.json`

Playwright MCP inspected both rendered CLI and MCP reference sections, their
contents links, and horizontal overflow. These browser receipts prove reference
presentation only. Independent source review and separate proof review cleared `.31` through
`.37`. Those seven repair beads are closed. Native, live-site, installed, report-build,
and full T-15 acceptance remain unproved.

### Saved check identity repair

`.37` adds [computed identity validation](../../packages/core/src/audit/run-store.ts#L77)
on saved-run reads and before updates are written. The guard compares each
check's own identity tuple; it does not replace valid stale history with current
catalog scope. Journey identities intentionally omit their state sequence.

[Integrity regressions](../../packages/core/src/audit/run-recovery.test.ts#L179)
reject a substituted ID before persistence, preserve the whole run and revision,
and stop externally altered files before read, status, or next can return a
claim. The externally altered file remains byte-for-byte unchanged.

[The APG fixture](../../packages/core/src/apg/outcomes.test.ts#L46) recomputes its
identity after changing to an element/pattern-row check. The active claim and
evidence provenance use that identity. The documented Space action and scoped
widget observation assertions remain intact.

The saved-identity regressions failed before the guard because both read and
write promises resolved instead of rejecting. Receipt:
`/private/tmp/a11ied-saved-identity-red.log`.
Final formatting, standards, and prose passed after this fix.
The expanded focused run passed 77 tests across 14 files; it includes all
seven repairs and the APG evidence regressions. The frozen-source full suite passed 819 tests across 134 files in 391.67 seconds (exit code 0). Receipt: `/private/tmp/a11ied-lifecycle-final-full-tests.log`.

## T-14 report integration: evidence and coverage slice

T-14 / `a11lied-j24.14` remains in progress. Bundle publication manifests and
interruption recovery are not implemented by this slice. These changes do not
establish native reader cursor identity or a completed live site audit.

The [coordinator snapshot](../../packages/core/src/audit/run-lifecycle.ts#L46)
captures status, validated records, and scoped inventory under the existing run
lock. [Snapshot construction](../../packages/core/src/audit/run-status.ts#L254)
uses the same records for accepted coverage. The report binds this inventory to
the exact registered inventory path before using coordinator metadata. Missing
or corrupt assessment data can still produce a draft containing saved scanner
results, with an explicit unavailable-assessment warning; final builds reject
that data, and an inventory mismatch is rejected even for a draft.

[Report evidence loading](../../packages/core/src/report/loaded-audits.ts#L143)
uses snapshot records rather than reading evidence again. A judgment affects
outcomes only when an evaluated check references it and the shared evidence
acceptance check succeeds. Page association uses the coordinator's normalized
document matcher, including discovery redirect aliases. Coordinated subjects
are loaded independently of legacy scanner status, so a discovered page can
have behavioral findings without a saved scan.

[Primary behavioral findings](../../packages/core/src/report/aggregate.ts#L83)
use verified, accepted failures. Structured finding details preserve the supplied
title, user impact, remediation, and severity. Missing severity stays unknown;
missing remediation is stated as missing. The same optional finding object is
accepted by criterion and APG CLI/MCP recording. An unknown scanner impact also
stays unknown instead of becoming a minor finding. CLI failure decisions use
primary findings and treat unknown severity as a failure at every threshold.

[Evidence export](../../packages/core/src/report/finding-evidence.ts#L125)
copies artifacts into the report bundle only after checking run-directory
containment and the captured digest. Finding context retains ordered states,
state setup, journey, environment, collection source, actor, and environment
limitations. Recorded action steps come from the bounded action trace. HTML
escapes this content and links to the copied files. PDF rendering gives those
links a file URL base; links target the local bundle location and are not proven
portable after moving or distributing the PDF separately.

[EARL criterion assertions](../../packages/core/src/audit/earl.ts#L97) use the
same rollup even without a saved scan. Recorded assertions retain structured
finding information and distinguish collection source from actor kind.
HTML/PDF include the coordinator's specific outstanding requirements in a
details view. Existing outcome SVGs, collapsed criterion tables, hierarchical
navigation, sticky headings, and wrapping remain in use.

Page and report completion check the rollup's actual pending flag. A failed
outcome remains visible while missing scanner or procedure coverage prevents
completion. The isolated regression supplies one failed, pending criterion;
removing the pending gate made it incorrectly report an audited page.
Red receipt: `/private/tmp/a11ied-report-completion-red.log`. The guard was
restored before final verification.

Focused verification passed 51 tests across 11 files, including report recovery,
no-scan behavioral findings, discovery aliases, structured remediation, unknown
severity, CLI exit codes, and emitted PDF artifact URLs. Receipt:
`/private/tmp/a11ied-report-behavior-tests.log`. The strengthened, isolated
completion regression separately passed with the other eight snapshot checks:
`/private/tmp/a11ied-report-completion-test.log`. These are browser, filesystem,
and contract checks. They are not native VoiceOver/NVDA or installed-product proof.

Independent source review cleared this slice after the pending/failed repair.
The reviewer confirmed that the isolated completion regression cannot pass
because of unrelated untested criteria.

Standards passed on this slice, including formatting, type checks, builds, and
example type checks. Receipt:
`/private/tmp/a11ied-report-behavior-standards-fixed.log`.
Prose checks passed with no findings:
`/private/tmp/a11ied-report-behavior-prose-fixed.log`.
The draft CLI regression checks both the missing scan warning and the explicit
coordinator coverage warning. Its two tests passed:
`/private/tmp/a11ied-report-draft-warning-test-fixed.log`.

The saved Fireside inventory was rendered with one CLI report build command.
The draft contains 24 scanned pages and zero completed assessments. This is
saved-data report verification, not a fresh site audit. Build receipt:
`/private/tmp/a11ied-report-behavior-fireside-build.log`.
Playwright MCP inspected the HTML on localhost. Page links appear under the
"Page assessments" ToC entry. ToC links stay in the same tab; external links
use `target="_blank"` and `rel="noopener noreferrer"`. The 24 criterion tables
are collapsed. Their summaries contain SVG outcome counts. Long links wrap,
there is no horizontal overflow at the inspected viewport, and section and
page headings are sticky. Screenshots:

- `.playwright-mcp/a11ied-report-behavior-html-top.png`
- `.playwright-mcp/a11ied-report-behavior-html-outcomes.png`

PDF pages 1 and 3 were rendered with Poppler and visually inspected. Page 1
shows the incomplete assessment and coverage warning. Page 3 shows separate
remediation list items. The PDF is tagged and contains a heading outline.
Screenshots:

- `/private/tmp/a11ied-report-behavior-pdf-page-1.png`
- `/private/tmp/a11ied-report-behavior-pdf-page-3.png`

The final full suite passed: 849 tests across 138 files in 292.73 seconds,
exit code 0. Receipt: `/private/tmp/a11ied-publication-final-full-tests.log`.
Independent source review and separate proof review cleared this bounded slice.

## T-14 publication and interruption recovery

This slice implements report bundle staging, manifests, and recovery. T-14 /
`a11lied-j24.14` remains open for broader report acceptance, including native
application targets. These receipts do not establish a completed website audit,
native reader identity, or installed-product behavior.

[Report generation](../../packages/core/src/report/runtime.ts#L263) reuses one
captured assessment context and protects the inventory, page results, run file,
and verified raw artifact paths before publication. Both symlink entries and
their real targets are checked. Invalid saved evidence remains diagnostic in a
draft instead of preventing available scanner output.

[Publication](../../packages/core/src/report/publication.ts#L267) uses the
existing filesystem lock and atomic JSON writer. It writes a building journal
before generating files, records the stage directory identity, and verifies
the manifest before changing the journal to ready. The complete staged
directory replaces the published directory through two same-filesystem renames.
The journal restores or promotes whole directories after interruption. The
output directory may be absent between the renames until recovery finishes.

[Bundle verification](../../packages/core/src/report/bundle-integrity.ts#L99)
requires a regular directory, the expected generation, contained regular files,
and matching SHA-256 hashes. Directory identities use exact bigint device and
inode values. Recovery preserves unexpected directory replacements. Output
directories containing the current working directory or audit inputs are
rejected. Existing unrelated files and old artifacts survive publication;
omitted report formats are removed from the new generation.

[Artifact writes](../../packages/core/src/files/atomic-json.ts#L103) use the same
atomic replacement mechanism for binary evidence. A copied artifact symlink is
replaced rather than followed. PDF rendering writes into staging while using
the final document path for artifact URLs. This proves local bundle links;
portability after moving the PDF separately remains unproved.

The manifest records generated paths, hashes, formats, optional assessment
revision, report status, and assessment completion as separate values. A
successful publication does not establish complete assessment coverage.

Focused verification passed 48 tests across six files. It covered interrupted
generation, every directory-swap boundary, corrupt stages, unrelated files,
omitted formats, concurrent builds, symlink and directory substitutions, current
working-directory protection, verified raw evidence inputs, invalid saved
evidence, PDF artifact URLs, and shared atomic-write consumers. Receipt:
`/private/tmp/a11ied-publication-final-focused-tests.log`.

Independent source review cleared this bounded publication/report slice.
Final standards passed, including formatting, type checks, builds, and example
type checks. Receipt: `/private/tmp/a11ied-publication-final-standards.log`.
Prose checks passed with no findings:
`/private/tmp/a11ied-publication-final-prose.log`.

The saved Fireside draft was regenerated with one CLI command into
`/private/tmp/a11ied-publication-fireside-draft`. The command returned exit code
4 for findings after publishing HTML, PDF, JSON, EARL, and the manifest. It
reported 24 discovered and scanned pages, zero completed assessments, 40 failed
criteria, nine inconclusive criteria, and 1,271 not tested criteria. The manifest
records `assessmentComplete: false` and `reportStatus: "draft"`. The legacy
inventory has no coordinated assessment, so its optional revision is absent.
Receipts:

- `/private/tmp/a11ied-publication-fireside-build.log`
- `/private/tmp/a11ied-publication-fireside-hashes.log`

The independent `shasum` values match all four generated file digests in the
manifest. Playwright MCP inspected the regenerated HTML: nested page navigation,
same-tab ToC links, safe external links, 24 collapsed tables, SVG outcome counts,
wrapping links, sticky headings, and no viewport overflow. Screenshot:
`.playwright-mcp/a11ied-publication-report-top.png`.
The updated report command reference was also inspected through Playwright MCP:
`.playwright-mcp/a11ied-publication-docs.png`.

The regenerated PDF is tagged, contains a heading outline, and has 117 A4 pages.
Poppler renders of pages 1 and 3 were visually inspected for the assessment
warning and separated remediation items. Screenshots:

- `/private/tmp/a11ied-publication-pdf-page-1.png`
- `/private/tmp/a11ied-publication-pdf-page-3.png`

The final full suite passed: 849 tests across 138 files in 292.73 seconds,
exit code 0. Receipt: `/private/tmp/a11ied-publication-final-full-tests.log`.
Independent source review and separate proof review cleared this bounded slice
and repair beads `.38` through `.43`. Parent T-14 remains open.

### Publication review repair beads

| Bead             | Verified repair                                     | Source and regression                                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a11lied-j24.38` | Replace artifact links without writing through them | [Atomic bytes](../../packages/core/src/files/atomic-json.ts#L103); [artifact sentinel regression](../../packages/core/src/report/assessment-report.test.ts#L154)                                                                    |
| `a11lied-j24.39` | Retain exact stage ownership during recovery        | [Directory identity](../../packages/core/src/report/bundle-integrity.ts#L64); [owned stage](../../packages/core/src/report/publication.ts#L35); [substitution regressions](../../packages/core/src/report/publication.test.ts#L322) |
| `a11lied-j24.40` | Protect inventory entries and their real targets    | [Canonical containment](../../packages/core/src/report/publication.ts#L143); [inventory link regression](../../packages/core/src/report/input-protection.test.ts#L53)                                                               |
| `a11lied-j24.41` | Protect verified raw evidence inputs                | [Snapshot artifact paths](../../packages/core/src/report/runtime.ts#L267); [registered artifact regression](../../packages/core/src/report/input-protection.test.ts#L79)                                                            |
| `a11lied-j24.42` | Keep invalid saved evidence diagnostic in drafts    | [Verified input filter](../../packages/core/src/report/runtime.ts#L276); [invalid path regression](../../packages/core/src/report/input-protection.test.ts#L101)                                                                    |
| `a11lied-j24.43` | Refuse replacement of the current working directory | [Working directory containment](../../packages/core/src/report/publication.ts#L164); [refusal regression](../../packages/core/src/report/publication.test.ts#L313)                                                                  |

## Inventory-linked startup receipt

Bead `a11lied-j24.44` repairs the discovery-to-assessment startup path within T-15.
[Lifecycle startup](../../packages/core/src/audit/run-lifecycle.ts#L23) reuses
[existing inventory migration](../../packages/core/src/audit/run-inventory.ts#L114).
It retains the inventory run ID, checks target/scope/profile/path before creation,
normalizes policy input, and links the coordinator atomically. Matching interrupted
startup can reuse its coordinator; unrelated ownership or policy fails without
replacing saved data. Profile key order does not change identity.

[The shared path resolver](../../packages/core/src/files/atomic-json.ts#L14) follows
physical aliases and stops at an unavailable filesystem root. Existing publication
path checks reuse it. [Run mutation](../../packages/core/src/audit/run-store.ts#L178),
[inventory writes](../../packages/core/src/discovery/inventory.ts#L145), and
[snapshot reads](../../packages/core/src/audit/run-lifecycle.ts#L51) use the same
physical file for locks and data. Inventory and report identity checks compare
physical paths rather than rejecting equivalent aliases.

[Startup regressions](../../packages/core/src/audit/run-inventory-start.test.ts)
cover identity conflicts, preserved ownership, concurrent matching recovery,
reordered profile/policy keys, and file/directory aliases. Alias tests mutate both
inventory and coordinator through caller paths and verify the physical state and
links survive. [The root regression](../../packages/core/src/files/atomic-json.test.ts)
rejects unavailable-root recursion.

[CLI/MCP parity](../../packages/mcp-server/src/audit-inventory-start.test.ts) starts
separate discovery fixtures and builds JSON drafts with the same run ID, revision,
incomplete coverage, and linked inventory. No inventory JSON edits are needed.
This is metadata and report-contract proof, not a browser or native reader audit.

The original regression failed on the random coordinator identity:
`/private/tmp/a11ied-inventory-start-red.log`. Expanded focused verification passed
71 tests across 11 files after the source corrections:
`/private/tmp/a11ied-inventory-start-focused.log`. Independent source review cleared
the complete bounded repair, including its alias and lock consumers.

## Coordinator skill instruction receipt

Bead `a11lied-j24.45` repairs instructions within T-16.
[The full audit skill](../../packages/skills/full-site-audit/SKILL.md#L98) teaches
claiming one procedure, performing its actions, capturing current observations,
recording provenance, evaluating evidence, and inspecting coverage before continuing.
It reuses user decisions and runtime paths. It requires observed states and ordered
journeys, preserves interruption blockers, and rejects completion from scanner
success, an empty queue, or blanket `cantTell` records.

[The supporting resource](../../packages/skills/full-site-audit/resources/run-state-and-decisions.md#L77)
explains explicit run evidence paths, artifact envelopes and timestamps, actor/source
identity, physical observations, and structural validation limits.
[The development skill](../../packages/skills/a11ied/SKILL.md#L19) keeps component
scope and separates scanner results from behavioral judgments.
[Its cheat sheet](../../packages/skills/a11ied/resources/command-cheat-sheet.md)
uses coordinator commands and task-specific diagnostics. Both skills stop only
sessions owned by the task. Metadata retains both registered skills with desktop
scope and current invocation prompts.

[The full-site guide](../../packages/docs/src/pages/guides/full-site-audit.astro)
and [installation guide](../../packages/docs/src/pages/guides/agent-skill.astro)
describe runtime-owned progress and explicit coverage. They disclose simulated
reader limits and the inventory requirement that still prevents native app bundle
publication. This instruction repair does not implement that missing feature.

Independent host continuation used isolated simulated metadata without native
reader, live site, network, or browser actions:
`/private/tmp/a11ied-skill-forward-hh6BMm/evaluation-final-summary.json` and
`action-receipts.json` and `evaluation-summary.json` in the same directory. It retained discovery identity,
registered state, claimed a check, read status offsets 0/20/40, preserved the
interrupted attempt as blocked, and published HTML/JSON/EARL drafts. Finalization
rejected 51 unresolved obligations. Partial finalization retained an active run.
Repeated publication retained revision 5 and verified all three manifest hashes.
The report showed zero assessed obligations and 55 criteria not tested.

The reviewer found session ownership wording and a malformed table; both were
corrected. It also requested a concrete scanner envelope command, which is included.
Its blocker-refinement runtime finding is tracked and repaired by `.46` below.
Both Skill Creator validators pass; retained output is
`/private/tmp/a11ied-skills-validators.log`. Prose passed in
`/private/tmp/a11ied-skills-final-prose.log`. Browser MCP inspected the rendered
workflow and installation guide with no horizontal overflow; receipts are
`/private/tmp/a11ied-skills-full-site-rendered.txt` and
`/private/tmp/a11ied-skills-agent-rendered.txt`.

## Interrupted blocker refinement receipt

Bead `a11lied-j24.46` permits a blocked check's reason to be refined without retrying
its procedure. [The transition table](../../packages/core/src/audit/run-state.ts#L220)
allows blocked-to-blocked. The shared transition retains check identity, attempts,
outcome, and evidence; it updates the reason/time through the existing locked store.
An evaluated check still cannot transition to blocked.

[The core regression](../../packages/core/src/audit/run-blocker.test.ts) claims a
fixture check, recovers interruption, refines its reason, and verifies preserved
metadata and absent active claim. It failed before the fix and passed afterward:
`/private/tmp/a11ied-blocker-red.log` and `/private/tmp/a11ied-blocker-green.log`.
[CLI/MCP recovery parity](../../packages/mcp-server/src/audit-assessment-parity.test.ts#L130)
refines a saved blocker through each public surface before explicitly retrying.
No UI action is sent and no new attempt is created by reason refinement.

Independent `.46` source review cleared the transition boundary. The host continuation
then refined its preserved check through the built CLI, kept attempts at 1 and its
attempt timestamp unchanged, and regenerated the preview with the exact blocker.
Run and report both retained active/incomplete revision 6 with 51 unresolved checks.
Receipt: `/private/tmp/a11ied-skill-forward-hh6BMm/refined-block-evaluation-summary.json`.

## Attempt-generation replay receipt

Bead `a11lied-j24.47` repairs retry proof identity within T-08/T-12/T-15.
[Required attempt generation](../../packages/contracts/src/schemas/evidence.ts#L58)
is present in evidence provenance and non-image artifact envelopes.
[Scope validation](../../packages/core/src/evidence/validation.ts#L171) requires the
provenance generation to equal the current check's `attempts`.
[Artifact validation](../../packages/core/src/evidence/artifacts.ts#L172) requires
non-image envelope generation to match that provenance. Required companion artifacts
and the saved evidence record prevent old proof from satisfying another attempt.
Raw PNG bytes do not contain this identity and do not independently prove a fresh
capture. Structural validation still cannot prove truth or correct WCAG judgment.

[Run persistence](../../packages/core/src/audit/run-store.ts#L178) retains a check's
latest saved update time across clock rollback.
[Attempt startup](../../packages/core/src/audit/run-state.ts#L230) advances beyond
both the prior attempt and update boundaries. Direct running transitions preserve
the old update time until startup rather than overwriting it first. Lifecycle paths
retain attempt counters through state changes, journey updates, blockers, and resume.

[Clock regressions](../../packages/core/src/audit/run-blocker.test.ts) exercise both
coordinator and direct retries after blocker refinement under a backward clock.
They require the retry timestamp to follow the prior terminal update. Original
clock regression failed before the fix and passed afterward:
`/private/tmp/a11ied-clock-retry-red.log` and
`/private/tmp/a11ied-clock-retry-green.log`.

[Replay regressions](../../packages/core/src/audit/run-attempt-evidence.test.ts)
record actual fixture proof, roll the clock back before blocking, retry the check,
advance the clock again, and reject the old evidence. They also reject a non-image
envelope from another attempt even after its content hash is recomputed.
The replay test initially evaluated old proof instead of rejecting it:
`/private/tmp/a11ied-attempt-generation-red.log`. The corrected test passed in
`/private/tmp/a11ied-attempt-generation-green.log`; expanded final checks include
both replay and envelope cases. These are controlled metadata/artifact fixtures,
not native reader proof.

[Skill evidence guidance](../../packages/skills/full-site-audit/resources/run-state-and-decisions.md#L93)
and CLI/MCP/API references disclose the required generation and raw-image boundary.
Existing saved provenance without generation must be reassessed; it is never
silently relabeled as a current attempt. Browser MCP inspected the rendered CLI
assessment section with no horizontal overflow:
`/private/tmp/a11ied-attempt-cli-rendered.txt`.

Independent source review cleared `.47` after the direct-transition correction.
Final focused checks passed 108 tests across 17 files, including API evidence,
CLI/MCP lifecycle, report publication, both retry paths, and packed installation:
`/private/tmp/a11ied-attempt-final-focused.log`. Standards passed in
`/private/tmp/a11ied-attempt-final-standards.log`; prose passed in
`/private/tmp/a11ied-attempt-final-prose.log`. Broader T-15/T-16 native and live-site
acceptance remains open.

The rebuilt final full suite passed 866 tests across 143 files in 332.49 seconds:
`/private/tmp/a11ied-attempt-final-full-tests.log`. Final lint also passed:
`/private/tmp/a11ied-attempt-final-lint.log`. These checks cover the frozen source
for repairs `.44` through `.47`; they do not establish native target binding or
a completed live-site audit.

## Journey traversal coverage receipt

Bead `a11lied-j24.48` repairs unfinished traversal within T-08/T-09.
[Scope issues](../../packages/core/src/audit/run-scope.ts#L207) require every
registered journey to be completed. [Journey progress](../../packages/core/src/audit/run-status.ts#L191)
uses the same gate alongside validated checks and environment identity. Report
generation and finalization consume that shared assessment status.

[State registration](../../packages/core/src/audit/run-state.ts#L124) revokes
completed traversal when a constituent state changes. [Journey registration](../../packages/core/src/audit/run-state.ts#L156)
also resets an incoming completed label when the ordered steps change. Save the
steps, traverse them, then register completion. The shared invalidation helper
preserves blocked journeys and their reasons. Identical observations retain
completion; checks retain attempt history, evidence, and active claims until
explicit recovery.

[Persisted regressions](../../packages/core/src/audit/run-progress.test.ts)
initially reproduced four failures in `/private/tmp/a11ied-journey-red.log`.
These cover discovered scope, changed states, changed step order, and progress
with evaluated checks in an explicitly reduced fixture catalog. The control uses
saved validated fixture evidence; it does not claim full WCAG or native coverage.
Related lifecycle and recovery checks passed 29 tests across three files:
`/private/tmp/a11ied-journey-green.log`.

The rebuilt CLI/MCP and report checks passed 47 tests across five files:
`/private/tmp/a11ied-journey-focused.log`. Standards passed in
`/private/tmp/a11ied-journey-standards.log`; prose passed in
`/private/tmp/a11ied-journey-prose.log`. Independent source review cleared the
shared lifecycle and report boundary.

A separate built-CLI continuation registered discovered and completed journeys,
changed their constituent state, and published a draft HTML/JSON/EARL bundle.
The draft retained the journey blocker and incomplete journey progress. Receipts:
`/private/tmp/a11ied-journey-cli-ghd2eaxo/action-receipts.json` and
`/private/tmp/a11ied-journey-cli-ghd2eaxo/evaluation-summary.json`.
This continuation used copied metadata fixtures. It sent no native or live-site
input. A completed traversal label remains an agent observation, not independent
proof that a reader traversed the process. Broader T-09 exploration remains open.

The final full suite passed 872 tests across 143 files in 289.45 seconds, exit 0:
`/private/tmp/a11ied-journey-full-tests.log`. Both skill validators passed after
the journey guidance change. Separate proof review cleared the bounded claims;
its final acceptance includes this full-suite receipt.

## Historical strict refusal and session ownership receipt

Beads `a11lied-j24.49` and `a11lied-j24.50` repair the rejection boundary within
T-05. They do not implement verified native dispatch or complete the parent bead.
The installed VoiceOver scripting dictionary exposes cursor text and bounds, but
no authoritative cursor/document identity. The installed NVDA relay exposes
speech and generic input. Neither establishes a target-bound input boundary.

[The leased reader](../../packages/guidepup/src/leased-reader.ts#L164) defaults
to `guarded`. The optional `require-binding` policy refuses native typing, keys,
activation, raw commands,
and navigation before entering the upstream queue. Ownership also serializes
observations and teardown. VoiceOver cursor screenshots remain observations:
the installed screenshot implementation calls the cursor capture directly,
without queued keys or a speech-cancellation input preamble.
[Capability reporting](../../packages/guidepup/src/adapter-shared.ts#L32)
excludes unavailable input and navigation capabilities under this policy.

Explicit `development` input bypasses foreground checks. Audit evidence requires
actual session/action/speech receipts regardless of policy. The former categorical
rejection of real-reader provenance is superseded by `a11lied-j24.53`; the adaptive
receipt section below documents structured transcript validation and its trust
boundary. Native commands use one delivery attempt. An AppleEvent timeout cannot
trigger an automatic activation replay.

[Shared session resolution](../../packages/core/src/driver/session-utils.ts#L75)
checks the expected owner once, then runtime dispatch uses that concrete session.
[Broker library operations](../../packages/core/src/driver/screen-reader-node.ts#L183)
carry the captured session ID for run, open, status, and stop. The disposal
precheck cannot redirect shutdown into a replacement. A missing-policy native
owner rejects input while status and stop remain available.

Focused checks passed 99 tests across 11 files, including mocked VoiceOver/NVDA
dispatch, CLI/MCP policy validation, legacy metadata, and a real detached virtual
broker replacement regression: `/private/tmp/a11ied-native-final-focused.log`.
Earlier red checks cover upstream input, activation replay, and missing-policy
acceptance: `/private/tmp/a11ied-native-input-red.log`,
`/private/tmp/a11ied-native-replay-red.log`, and
`/private/tmp/a11ied-native-legacy-red.log`. The replacement regression verifies rejected typing, activation,
attachment, and state queries, followed by replacement-preserving disposal.
Independent source review cleared both bounded repairs and the screenshot exception.

Standards passed in `/private/tmp/a11ied-native-final-standards.log`.
Prose passed in `/private/tmp/a11ied-native-final-prose.log`.
The built CLI started a virtual broker, rejected an invalid native policy with
exit 2, retained the same session ID on status, and stopped with exit 0:
`/private/tmp/a11ied-native-policy-cli-scr7y6x4/action-receipts.json`.
This check used an isolated state directory and sent no native input.
Playwright MCP inspected the rendered screen-reader guide at
`http://127.0.0.1:4325/guides/screen-reader`. It showed the default policy,
missing-binding error, and development option with no horizontal overflow.
Preserved snapshot: `/private/tmp/a11ied-native-docs-snapshot.yml`.

These earlier receipts tested strict refusal, not successful live native input.
The former authoritative cursor-binding requirement is superseded by the user's
adaptive-control clarification in `a11lied-j24.53`. Remaining platform acceptance
is described in the adaptive receipt below. The earlier full suite passed 888
tests across 146 files in 340.95 seconds, exit 0:
`/private/tmp/a11ied-native-final-full-tests.log`. Separate proof review cleared
those bounded repairs and the additional layout receipt below.

## Troubleshooting title layout receipt

Bead `a11lied-j24.51` addresses the additional heading overflow report.
The shared [docs shell](../../packages/docs/src/layouts/doc-shell.astro) treats
long single words as long titles. It sizes those titles with a clamp based on
header container width, retaining a readable minimum and the existing maximum.
The main grid can shrink below its content's intrinsic width; inline code wraps
instead of widening that grid.

Playwright MCP measured the troubleshooting heading at viewport widths 320,
500, 768, 1024, 1440, and 1920 pixels. Every heading, including its shadow, fits
its container and viewport; none has horizontal document overflow:
`/private/tmp/a11ied-troubleshooting-heading-qa.json`.
Independent source review cleared the shared styling and narrow-screen precedence.
Final standards passed in `/private/tmp/a11ied-native-ui-final-standards.log`;
prose passed in `/private/tmp/a11ied-native-ui-final-prose.log`.
Separate proof review cleared this layout receipt.
This typography change needs no extra runtime regression test. The full suite
receipt above covers the native repairs; browser measurements cover this layout.

## Adaptive native control receipt

The user's clarified requirement is adaptive desktop reader operation with quick,
accurate observations and deliberate recovery. Ordinary audits do not require atomic
OS input isolation or authoritative reader-cursor identity. Pending beads and the
plan now use that requirement. `cantTell` remains unresolved coverage in a partial
report; it cannot establish a completed assessment or conformance.

| Bead             | Implemented scope                                                                                      | Source                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `a11lied-j24.52` | Provider observations, dispatch semantics, optional strict-mode limits                                 | [Pinned research and host receipts](a11ied-native-control-provider-research.md)                                                                                                                                                                                                      |
| `a11lied-j24.53` | Foreground checks, per-character typing interruption, one delivery attempt, explicit focus recovery    | [Leased reader](../../packages/guidepup/src/leased-reader.ts), [target guard](../../packages/guidepup/src/native-input-target.ts), [native observations](../../packages/guidepup/src/native-observations.ts)                                                                         |
| `a11lied-j24.54` | Bounded action deltas, recent status tails, stable indexes, explicit historical access                 | [Shared action path](../../packages/core/src/driver/context-action.ts), [transcript selection](../../packages/core/src/driver/transcript-recorder.ts), [walk export](../../packages/cli/src/commands/drive-walk.ts)                                                                  |
| `a11lied-j24.55` | Parent launch validation and promptly consumed detached startup failures                               | [Parent validation](../../packages/core/src/driver/runtime-support.ts), [private atomic receipts](../../packages/core/src/driver/broker-startup.ts), [broker polling](../../packages/core/src/driver/broker-client.ts), [startup boundary](../../packages/core/src/driver/broker.ts) |
| `a11lied-j24.56` | Native workspace foreground identity, optional metadata, PID-only applications, locked-desktop refusal | [macOS helper](../../packages/guidepup/scripts/mac-frontmost.applescript), [parser](../../packages/guidepup/src/window-focus.ts), [guard](../../packages/guidepup/src/native-input-target.ts)                                                                                        |

[Native evidence validation](../../packages/core/src/evidence/native-evidence.ts)
correlates structured speech with the session ID, native reader target, referenced
page state, attempt/session times, ordered transcript entries, and captured text.
The existing artifact validator also checks run/attempt/environment/source/session,
state references, action range, artifact registration, capture times, and content
hashes. This accepts valid subpage and recovered-session receipts without claiming
cursor isolation. Imported receipts still depend on collector honesty; validation
cannot independently prove that a collector used a real reader or judged WCAG
correctly. Both skills state that trust boundary and the recovery procedure.

Source reviews cleared the bounded changes. They inspected implementation and
regressions; they did not execute native input. The pending-bead review confirmed
that optional binding research no longer blocks ordinary audits. Parent T-05 and
`a11lied-j24.53` remain open for successful real-platform acceptance.

The CLI smoke passed with the virtual reader and delivered the exact text
`native audit` plus one fixture button activation:
`/private/tmp/a11ied-native-adaptive-smoke-virtual.log`. That proves the fixture and
virtual CLI path, not VoiceOver behavior. Two live VoiceOver attempts failed during
foreground establishment before reaching fixture typing or button activation. The second attempt
returned `browser-focus-unconfirmed` rather than a readiness timeout:
`/private/tmp/a11ied-native-adaptive-smoke-voiceover-2.log`.

The real macOS workspace reported `loginwindow`, bundle ID
`com.apple.loginwindow`, PID 404 while System Events returned stale foreground
state. The final packaged helper compiled and reported that workspace identity:
`/private/tmp/a11ied-native-adaptive-workspace-foreground.txt`. The shared guard
refused the locked desktop with its actual foreground observation and an unlock
instruction, without dispatching input:
`/private/tmp/a11ied-native-adaptive-locked-refusal.json`.

A built-CLI detached startup with an unsafe browser port exited 3 and returned the
original `page.goto: net::ERR_UNSAFE_PORT` reason with its session ID:
`/private/tmp/a11ied-native-adaptive-cli-start-failure.json`. The startup receipt was
consumed. Source regressions cover invalid library PID rejection before spawning,
owner-specific failure consumption, locked input refusal, parser-produced PID-only
feedback, asynchronous focus establishment, target changes, partial typing,
checkpoint-heavy recent tails, explicit history, and CLI walk exports.

The screen-reader guide was inspected through Playwright MCP. Its rendered copy
shows the `guarded` default, optional strict policy, recovery instructions, and
remaining dispatch races:
`/private/tmp/a11ied-native-adaptive-docs-snapshot-2.yml`. Both skill validators
passed. Final focused checks passed 49 tests across 6 files:
`/private/tmp/a11ied-native-adaptive-verified-focused.log`. The frozen-source full
suite passed 911 tests across 148 files in 296.53 seconds:
`/private/tmp/a11ied-native-adaptive-verified-full-tests.log`. Standards passed in
`/private/tmp/a11ied-native-adaptive-verified-standards.log`; format passed in
`/private/tmp/a11ied-native-adaptive-final-format.log`. Prose passed in
`/private/tmp/a11ied-native-adaptive-proof-prose-2.log`. The final isolated virtual
smoke exited 0:
`/private/tmp/a11ied-native-adaptive-final-virtual.log`. Independent source and
separate proof review cleared the bounded `.52`, `.54`, `.55`, and `.56` repairs.

Successful VoiceOver typing/activation still needs an unlocked desktop. Windows/NVDA
execution and installed-package acceptance still need their respective environments.
These receipts do not prove a complete native audit, full-site WCAG coverage, or a
conformance conclusion. No commit, push, or remote Beads sync was performed.

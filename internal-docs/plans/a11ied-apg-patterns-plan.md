# a11ied APG Patterns: Implementation Plan (v0.2.0 - 2026-09-08)

## Summary

Add the ARIA Authoring Practices Guide (APG) as a fourth pinned data source alongside WCAG,
ACT, and axe. The APG publishes, for each of 68 examples across 28 patterns, a keyboard
support table and a role/property/state/tabindex table, both in markup that carries a
`data-test-id` on every row. This plan syncs those tables into a generated artifact, adds
`a1 pattern` as a lookup command that is a sibling of `a1 wcag` rather than a subcommand of
it, adds `a1 pattern check` to test a live page against a pattern's declared keyboard and
attribute contract, vendors three APG examples as known-good test fixtures, and exposes the
whole thing through the MCP server and the Agent Skill. A short refactor comes first so the
two lookup families share one command wrapper instead of duplicating it, and a second one at
the end widens the existing evidence store so a person or an agent can record a pattern row as
`inapplicable` once and have that judgment survive later runs.

## Objectives & Scope

- In scope: Extract the command wrapper in `packages/cli/src/commands/wcag.ts` into a shared
  `runLookupCommand` that does not require a WCAG version.
- In scope: Extract `--section` option parsing into a shared helper both lookup families use.
- In scope: Add `pattern` and `search` to `cliCommandFamilySchema`.
- In scope: Parse the APG example index page into an example list, a role index, and an
  attribute index.
- In scope: Parse each APG example's keyboard table and attribute table from its source HTML
  in the `w3c/aria-practices` repository.
- In scope: Write one generated artifact, `apg-patterns.json`, with its own provenance entry
  and its own validation step.
- In scope: Add engine lookups, core runtime functions, CLI renderers, and the `a1 pattern`
  command family.
- In scope: Replace `a1 wcag search` with a top-level `a1 search` that ranks WCAG and APG
  results in one list and takes `--kind` to scope to one corpus.
- In scope: Add `a1 pattern check <target>` with a static attribute check and a dynamic
  keyboard probe.
- In scope: Vendor three APG examples into `packages/cli/test/fixtures/apg/` and add tests
  that assert a11ied reports them clean.
- In scope: Add `pattern_show`, `pattern_find`, and `pattern_check` MCP tools, and a section
  in `packages/skills/a11ied/SKILL.md`.
- In scope: Route `a1 pattern check` rows into the existing evidence store, so a person or an
  agent can record a row as `inapplicable` once and have that judgment survive later runs.
- In scope: Generalize `evidenceRecordSchema` so a recorded result can be about an APG example
  row as well as a WCAG criterion.
- In scope: Update `NOTICE.md`, both READMEs, and the docs reference pages.
- Out of scope: Detecting which pattern a page implements without being told. `a1 pattern
check` takes the pattern name as an argument in this release. Automatic detection is a
  follow-up that builds on the role index this plan creates.
- Out of scope: Any stored mapping from APG patterns to WCAG success criteria. W3C publishes
  no such mapping and a11ied will not invent one. See the design decision in section 6.
- Out of scope: Ingesting the `w3c-cg/aria-at` test plans and their expected screen reader
  assertions. That is a separate plan that depends on this artifact existing.
- Out of scope: Vendoring all 68 examples. Three are vendored; the rest are referenced by URL.
- Out of scope: Changing any existing `a1 wcag` output. The refactor tasks are behavior
  preserving and their tests assert that.
- Out of scope: Any attempt by the tool to decide applicability on its own. It surfaces the
  signals and records the decision; a person or an agent makes it. T-15 step 5 is the limit of
  what the tool infers.

## Assumptions & Open Questions

### Assumptions

- The APG example index page at `https://www.w3.org/WAI/ARIA/apg/example-index/` is the list
  of examples. As built, it links 68 distinct examples across 28 patterns, and the sync
  writes 427 keyboard rows and 569 attribute rows into a 474 KB artifact. Eight examples, all
  landmarks, have no tables.
- Example source files live at
  `https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/<pattern>/examples/<example>.html`.
  An index href of the directory form `../patterns/combobox/examples/combobox-select-only/`
  and of the file form `../patterns/landmarks/examples/banner.html` both map to that path.
- The keyboard table is `table.def` whose `aria-labelledby` includes the token `kbd_label`.
  The attribute table is `table.data.attributes` whose `aria-labelledby` includes the token
  `rps_label`. Verified against `combobox-select-only.html`, `disclosure-faq.html`, and
  `data-grids.html`. The token test matters because `data-grids.html` contains three demo
  tables that also carry `class="data"`.
- `data-test-id` values are **not** unique within a file. `combobox-select-only.html` uses
  `combobox-aria-expanded` on two rows, one for `aria-expanded="false"` and one for
  `aria-expanded="true"`. Rows are therefore keyed by position and carry `testId` as a field.
- Some examples have neither table. `landmarks/examples/banner.html` has no table and no
  `data-test-id` at all. Roughly eight landmark examples are like this. They are stored with
  empty table arrays and are not checkable by `a1 pattern check`.
- `w3c/aria-practices` is licensed under the W3C Software and Document License. That license
  grants copying, modification, and redistribution with the notice attached, and is more
  permissive than the W3C Document License already relied on for the WCAG and WCAG2Mobile
  material in `packages/wcag-data/NOTICE.md`.
- No new runtime dependency is needed. `jsdom@30.0.1` is already a dependency of
  `@a11ied/wcag-data` and parses the source HTML. `playwright` is already a dependency of
  `@a11ied/core` and drives the keyboard probe.
- The APG is published in English only, and the stored prose is English only.
- Node 22 or newer, TypeScript 6, Zod 4, Commander, Vitest. Same as the rest of the repo.

### Settled Decisions

These were open when the plan was drafted and are now settled. They are recorded here because
each one changes a task.

1. **Store the full Usage column text.** The artifact lands near 500 KB against the 5.6 MB
   `documents-content.json` already committed.
2. **Vendor the fixtures intact, not flattened.** See the fixture decision in section 6. This
   reverses the draft's assumption and changes T-18.
3. **One search command.** `a1 search` replaces `a1 wcag search` rather than sitting beside it.
   The WCAG-only behavior stays reachable as `a1 search <query> --kind criterion`. The repo
   rule against `@deprecated` means the old subcommand is deleted, not aliased. This changes
   T-12.
4. **Track `main`**, matching the four existing sources, with a sha256 per artifact in
   `generated-provenance.json`.
5. **Status string: `W3C WAI resource, informative guidance that is not a W3C Recommendation`.**
   It is parallel to the WCAG2Mobile string already in the codebase, and it answers the only
   question a reader of `NOTICE.md` or of command output actually has, which is how much
   authority the guidance carries. It is a description rather than a quotation, because the APG
   makes no equivalent statement about itself, and T-06 says so in a comment.
6. **`--selector` is required** on `a1 pattern check`. This changes T-17.
7. **`no-observable-effect` exits 4**, matching `a1 audit`.

### Open Questions

None. Every question raised in the draft is settled above.

## Requirements

### Functional Requirements

- FR-1: `npm run wcag:sync` fetches the APG example index and every example source file, and
  writes `packages/wcag-data/data/generated/apg-patterns.json`.
- FR-2: `npm run wcag:validate` parses `apg-patterns.json` against its schema and fails when
  an example is filed under the wrong id, when a pattern names an example that is absent, or
  when a role index entry names an example that is absent.
- FR-3: `a1 pattern` with no argument opens the finder on a TTY and prints help otherwise,
  matching `a1 wcag`.
- FR-4: `a1 pattern <pattern-id>` prints the pattern, its examples, and the source URL.
- FR-5: `a1 pattern <example-id>` prints one example: its keyboard tables and its attribute
  tables, with the APG page URL.
- FR-6: `a1 pattern list` prints all patterns with an example count each.
- FR-7: `a1 pattern role <role>` and `a1 pattern attribute <attribute>` print the examples the
  APG index files under that role or attribute.
- FR-8: `a1 pattern <id> --section keyboard|attributes|examples` limits the output, the same
  way `a1 wcag show --section mobile|testing|fails` does.
- FR-9: `a1 search <query>` returns ranked results across WCAG criteria, techniques, failures,
  axe rules, and APG patterns and examples, each row labeled with its kind.
- FR-10: `a1 search <query> --kind criterion` returns what `a1 wcag search` used to return.
  The `a1 wcag search` subcommand is removed rather than aliased.
- FR-11: `a1 pattern check <target> --pattern <example-id>` loads the target, checks the
  attribute table against the DOM, presses each key in the example's first keyboard table,
  and reports one row per declared key.
- FR-12: `a1 pattern check` reports each keyboard row as `changed`, `no-observable-effect`, or
  `not-testable`, and each attribute row as `present`, `absent`, or `not-testable`.
- FR-13: `a1 pattern check` exits 4 when any row is `no-observable-effect` or `absent`, 0
  otherwise, matching how `a1 audit` exits 4 on findings.
- FR-14: `a1 pattern check --table <name>` selects a later keyboard table, and `--setup <keys>`
  presses a key sequence before the probe so a state such as an open listbox can be reached.
- FR-15: Every command supports `--json` and `--verbose` and emits the standard
  `CliOutputEnvelope` with `family: 'pattern'`.
- FR-16: Every command that prints APG prose prints the example title and its APG URL with it,
  the same way the WCAG commands print their source line.
- FR-17: `a1 audit` and `a1 tree` add `a1 pattern role <role>` to `nextCommands` when a widget
  role from the APG role index appears in the page's accessibility tree.
- FR-18: The MCP server exposes `pattern_show`, `pattern_find`, and `pattern_check`.
- FR-19: `a1 help-all` lists every new command and option.
- FR-20: A recorded result can be about an APG example row, not only a WCAG criterion, and the
  store keeps both kinds in one file.
- FR-21: `a1 pattern check` gives every row an outcome from `evidenceOutcomeSchema`: `failed`
  when nothing changed on either probe, `cantTell` when something changed, and no record at all
  for a key it cannot press. It never writes `inapplicable`.
- FR-22: `a1 pattern record` writes one judgment for one row, with `--outcome`, `--note`,
  `--pointer`, and `--by`, matching the options `a1 audit record` already takes.
- FR-23: `a1 pattern pending` lists the rows of one example with no recorded result.
- FR-24: `a1 pattern check` suppresses rows recorded `inapplicable` or `passed`, prints them in
  a summary block with their notes, and exits 4 only on a `failed` row that has no recorded
  judgment.
- FR-25: `a1 pattern check` warns when a row's recorded `subjectHash` no longer matches the
  page's accessibility tree, and treats that row as unjudged again.
- FR-26: `a1 audit --earl` includes pattern-row assertions, with the APG row as the EARL test
  case.

### Non-Functional Requirements

- NFR-1 (Performance): The sync makes 70 requests. Reuse `mapWithConcurrency` at the existing
  concurrency of 4. The engine loads `apg-patterns.json` lazily and caches it, the same as
  `loadMobileGuidance`. A lookup must not read the file more than once per process.
- NFR-2 (Performance): `apg-patterns.json` stays under 1 MB. Fail the build if it exceeds
  that, so a parser change that starts storing whole pages is caught.
- NFR-3 (Security): Fetches go to `www.w3.org` and `raw.githubusercontent.com` only, through
  the existing `curlFetch`. Add both to `listApprovedUpstreamSourceUrls` so the approved-source
  test covers them.
- NFR-4 (Security): `a1 pattern check` sends only key presses to the page under test. It
  executes no author-supplied script and it writes nothing back to the page.
- NFR-5 (Privacy): No new network calls at runtime. Lookups read the committed artifact from
  disk.
- NFR-6 (Accessibility): Terminal output follows the existing renderers: no color as the only
  signal, tables degrade to labeled lines under `--verbose`, and every URL is printed in full
  rather than hidden behind a label.
- NFR-7 (Observability): The sync logs the pattern count, example count, keyboard row count,
  attribute row count, and the count of examples with no tables. Fetch failures are listed by
  URL, matching `syncMobileGuidance`.
- NFR-8 (Observability): `apg-patterns.json` gets a `generated-provenance.json` entry with its
  sha256, so an unexpected upstream change shows up as a diff in review.
- NFR-9 (i18n): The APG is English only. The artifact stores no locale field and the commands
  make no claim of translation.
- NFR-10 (Licensing): `NOTICE.md` gains an APG section naming the source, the license, and
  what is stored, before any APG data is committed.

## Architecture & Design Overview

### Data flow

```txt
www.w3.org/WAI/ARIA/apg/example-index/
   |
   |  parseExampleIndex()          68 examples, role index, attribute index
   v
raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/*/examples/*.html
   |
   |  parseApgExample()            keyboard tables + attribute tables per example
   v
packages/wcag-data/data/generated/apg-patterns.json      (committed)
   |
   |  loadApgPatterns()            @a11ied/wcag-engine, lazy + cached
   v
getApgPattern / getApgExample / listApgPatterns / findApgExamplesByRole
   |
   v
@a11ied/core  showApgPattern / showApgExample / runPatternCheck
   |
   +--> packages/cli   a1 pattern ...        (renderers/pattern.ts)
   +--> packages/mcp-server  pattern_show, pattern_find, pattern_check
```

### Key interfaces

The artifact is version free. The APG has no 2.1/2.2 split, so one file serves every WCAG
version, exactly like `mobile-guidance.json`. This is why `runLookupCommand` must make the
`--wcag` option opt-in: `--wcag 2.1` is meaningless for a combobox.

```txt
ApgPatternsArtifact
   document      { title, url, status }        one W3C source block, as w3cDocumentSourceSchema
   patterns      Record<patternId, ApgPattern>
   examples      Record<exampleId, ApgExample>
   roleIndex     Record<role, exampleId[]>
   attributeIndex Record<attribute, exampleId[]>

ApgExample
   id, patternId, title, pageUrl, sourceUrl, experimental
   keyboardTables  ApgKeyboardTable[]     name, rows[]
   attributeTables ApgAttributeTable[]    name, rows[]

ApgKeyboardRow    testId, keys[], description[]
ApgAttributeRow   testId, role, attribute { raw, name, value, isIdRef }, element, usage
```

### Decisions and trade-offs

**Separate command families, shared plumbing.** `a1 pattern` is a sibling of `a1 wcag`, not a
subcommand. Everything under `a1 wcag` resolves to a success criterion: techniques, failures,
axe rules, Understanding documents, and WCAG2Mobile guidance are all more to say about one
criterion, which is why WCAG2Mobile became a `CriterionDetailSection` rather than `a1 mobile`.
An APG pattern is keyed by role and does not reduce to a criterion. Filing it under `a1 wcag`
would force a pattern-to-criterion mapping into the data. The shared parts, which are the
command wrapper, the section option, the output envelope, the search ranking, and the finder,
are extracted instead.

**No stored pattern-to-criterion mapping.** A combobox bears on 2.1.1, 4.1.2, 1.3.1, and 2.4.3
at least, and W3C publishes no mapping. Writing one by hand would be the first row in
`wcag-data` that traces to no upstream file, which defeats the purpose of
`generated-provenance.json` and the regression fixtures. The link between the two corpora is
therefore made from observed page data instead: when `a1 audit` or `a1 tree` sees a role in a
real accessibility tree, it looks that role up in the APG role index and suggests
`a1 pattern role <role>`. That is derived from the page in front of the user, not asserted as
a fact about WCAG.

**The keyboard check reports observations, not judgments.** The APG describes each key's effect
in prose: "Opens the listbox if it is not already displayed without moving focus or changing
selection." No parser turns that into an assertion without inventing an interpretation. What
is mechanical is the negative: the APG says this key does something, so press it and see
whether anything observable changed. A key the pattern declares that produces no focus change,
no ARIA attribute change, and no accessibility tree change is a real finding with no
interpretation involved. Everything else is printed as an observation next to the APG's own
description for a person to judge. This matches the `hybrid` test method the project already
uses: run what can be run, hand the rest to a person, and keep the two apart.

**The brittleness of the keyboard probe was measured before this plan was approved.** The
observation model above was run against seven APG reference implementations on
`www.w3.org`, probing the first keyboard table of each: `combobox-select-only`,
`disclosure-faq`, `menu-button-actions`, `slider-temperature`, `checkbox`, `accordion`, and
`listbox-scrollable`. These pages are correct by definition, so every finding is a false alarm.

```txt
rows probed            31
changed                28
no-observable-effect    1     the only false alarm, 3.4% of the 29 testable rows
not-testable            2     both "Printable Characters"
errors                  0
```

The single false alarm is `listbox-scrollable`, Up Arrow. The first option is selected at
load, so Up Arrow correctly does nothing. That is a starting-state boundary, not a flaw in the
observation model, and T-16 mitigates it with a second probe.

Sensitivity was measured the same way against `packages/cli/test/fixtures/aria-widgets.html`,
which was built to contain real breaks:

```txt
stuck-toggle        Space       no-observable-effect    aria-pressed never changes
live-toggle         Space       changed                 the one correct widget
stateless-checkbox  Space       no-observable-effect    no aria-checked at all
stateful-checkbox   Space       no-observable-effect    aria-checked never toggles
fake-button         Enter       no-observable-effect    div with role=button, no key handler
tab-overview        ArrowRight  no-observable-effect    no roving tabindex
```

Five real bugs caught, one correct widget passed, no false negatives. The check is worth
building. The reason it holds up is that ARIA widget patterns express their state in ARIA
attributes by design, so the pattern's own contract is what the observation model watches.

**The fixtures are vendored intact rather than flattened.** The draft assumed flattening each
example into one self-contained file so `readFixture` could load it through jsdom. That is the
wrong trade. Flattening hand-edits W3C source, so the fixture drifts from upstream and cannot
be refreshed by the sync. Vendoring the directory intact keeps the files byte-identical and
refreshable, and its only cost is that the scripted examples must be loaded by URL rather than
by `readFixture`. That cost is already paid: `dialog.html`, `status-message.html`,
`live-regions.html`, and `modal-untrapped.html` are listed under "Pages that need their
scripts" in the fixture README for exactly this reason, and `createTestServer()` already
serves a directory and already sets the content type for `.js` and `.css`. The `app/` fixture
proves the multi-file shape works.

**The attribute table is checkable outright.** Unlike the keyboard prose, the attribute rows
are concrete: `aria-expanded="false"` on a `div` with `role="combobox"`. Parsing the `<code>`
cell into a name and a value, then querying the DOM for it, involves no interpretation. This is
the part of `a1 pattern check` that is fully automated.

**State reachability.** An example with more than one keyboard table documents more than one
state, such as "Closed Combobox" and "Listbox Popup". The tool cannot reach the second state on
its own without interpreting prose. `a1 pattern check` probes the first table by default,
prints the names of the tables it did not probe, and takes `--table` with `--setup` so the user
can drive to that state and probe it.

### What the implementation changed

Three decisions in this plan did not survive contact with the code. They are recorded here
rather than edited away, because each was settled by a measurement.

**The exit code no longer fails on a missing attribute.** FR-13 and FR-24 said `a1 pattern
check` exits 4 when an attribute row is `absent`. Running the finished check against the APG's
own select-only combobox showed `aria-activedescendant` absent while the listbox is closed,
which is correct behavior, so that rule failed a correct reference implementation. The rule
is now: exit 4 on a keyboard row that changed nothing on either attempt, and on an attribute
that points at an id the document does not have. A plain absence is reported and listed under
"May not apply". `apgAttributeCheckStatusSchema` gained `broken-reference` to make the
difference explicit.

**The keyboard key cell needed a third separator.** T-05 named `or` and a comma. The data also
uses `<br>`, in `menu-button-actions.html`. The rule the parser implements is the conservative
one: only a `+` between two `kbd` elements makes a chord, and anything else starts a new
group. Verified against all 427 keyboard rows, which produce 13 distinct chords, every one a
real modifier combination.

**The observation had to include element text.** Comparing focus by tag, id, and role reported
`Tab` as having no effect on the disclosure example, because its two buttons have neither an
id nor a role and described identically. The description now includes the element's position
and the first 40 characters of its text.

Two smaller ones: the vendored fixtures keep the upstream directory depth, so no path rewrite
is needed at all and only the site chrome is removed; and the pattern titles come from the
APG's pattern index page, because `alertdialog` is "Alert and Message Dialogs" and no
title-casing of the slug would produce that.

## Task Grid

| Status | ID   | Task                                  | Priority | Depends On       | Acceptance Criteria                                                   |
| ------ | ---- | ------------------------------------- | -------- | ---------------- | --------------------------------------------------------------------- |
| [ ]    | T-01 | Extract `runLookupCommand`            | H        | —                | `a1 wcag` output byte-identical; version option opt-in                |
| [ ]    | T-02 | Extract the `--section` option helper | M        | T-01             | `a1 wcag show --section` unchanged; helper takes an allowed list      |
| [ ]    | T-03 | Add `pattern` and `search` families   | H        | —                | `cliCommandFamilySchema` extended; envelope tests pass                |
| [ ]    | T-04 | APG contracts schemas                 | H        | —                | `apgPatternsArtifactSchema` parses a hand-written sample              |
| [ ]    | T-05 | APG parser                            | H        | T-04             | Parses 3 committed sample files into expected rows                    |
| [ ]    | T-06 | APG sync and generation               | H        | T-05             | `npm run wcag:sync` writes `apg-patterns.json` with provenance        |
| [ ]    | T-07 | APG validation                        | H        | T-06             | `npm run wcag:validate` fails on a corrupted artifact                 |
| [ ]    | T-08 | Engine lookups                        | H        | T-06             | `getApgExample('combobox-select-only')` returns 2 keyboard tables     |
| [ ]    | T-09 | Core runtime                          | H        | T-08             | Not-found raises `CliUsageError` with `lookupKey`                     |
| [ ]    | T-10 | Pattern renderers                     | M        | T-09             | Text output prints the title, URL, and both tables                    |
| [ ]    | T-11 | `a1 pattern` command                  | H        | T-01, T-03, T-10 | All of FR-3 to FR-8 pass; `help-all` lists them                       |
| [ ]    | T-12 | Unified `a1 search` and finder        | M        | T-11             | One ranked list, rows labeled by kind; `a1 wcag search` deleted       |
| [ ]    | T-13 | Role-derived next commands            | M        | T-08             | `a1 audit` on `aria-widgets.html` suggests `a1 pattern role`          |
| [ ]    | T-14 | APG key text to Playwright keys       | H        | T-04             | One group in, one chord out; `Space or Enter` never joins             |
| [ ]    | T-15 | Static attribute check                | H        | T-08, T-14       | Reports `present`/`absent` per attribute row                          |
| [ ]    | T-16 | Dynamic keyboard probe                | H        | T-14, T-15       | Flags a dead key; nudge re-probe clears the boundary false alarm      |
| [ ]    | T-17 | `a1 pattern check` command            | H        | T-16             | FR-11 to FR-14 pass; `--selector` required; exits 4 on a finding      |
| [ ]    | T-18 | Vendor 3 APG fixtures                 | M        | T-06             | Byte-identical dirs under `test/fixtures/apg/`, refreshed by the sync |
| [ ]    | T-19 | False-positive tests                  | H        | T-17, T-18       | axe clean, `pattern check` clean, sr assertions pass                  |
| [ ]    | T-20 | MCP tools                             | M        | T-09, T-17       | 3 tools registered, listed in `index.test.ts`                         |
| [ ]    | T-21 | Agent Skill section                   | M        | T-11, T-17       | SKILL.md section added; vale passes                                   |
| [ ]    | T-22 | Docs, README, NOTICE                  | H        | T-06, T-11       | NOTICE names the APG before data lands; docs pages updated            |
| [ ]    | T-23 | Generalize the evidence record        | H        | T-17             | Old flat lines still read; both test kinds round-trip                 |
| [ ]    | T-24 | Row outcomes from the check           | H        | T-23             | Every row gets `failed`/`cantTell`/no record; never `inapplicable`    |
| [ ]    | T-25 | `a1 pattern record` and `pending`     | H        | T-24             | A row recorded `inapplicable` appears in neither pending list again   |
| [ ]    | T-26 | Check reads the store                 | H        | T-25             | Recorded rows suppressed; stale hash warns; exit 4 narrowed           |
| [ ]    | T-27 | EARL export of pattern rows           | M        | T-23             | APG row becomes a `TestCase`; `isPartOf` omitted, not empty           |
| [ ]    | T-28 | MCP record tool, skill, docs          | M        | T-26             | `pattern_record` registered; SKILL.md states the split                |

## Task Details

### T-01 - Extract `runLookupCommand`

**Goal:** One command wrapper serves both lookup families, and it does not assume a WCAG
version.

**Step-by-step instructions:**

1. Create `packages/cli/src/lib/run-lookup.ts`.
2. Move `runWcagCommand` from `packages/cli/src/commands/wcag.ts` into it and rename it
   `runLookupCommand`.
3. Change its input so `family` is a parameter of type `CliCommandFamily` and `wcagVersion` is
   `string | undefined` rather than required.
4. Move the `RenderText`, `CommandResult`, `CoreModule`, and `Renderers` type aliases with it.
   Do not export any alias used only inside the file.
5. Split `withWcagOptions` in `commands/wcag.ts` into `addLookupOptions(command)`, which adds
   `--json` and `--verbose`, and keep the WCAG version option applied only by the WCAG family.
   Put `addLookupOptions` in `packages/cli/src/lib/options.ts` next to the existing helpers.
6. Update `commands/wcag.ts` to call `runLookupCommand` with `family: 'wcag'`.
7. Verify no behavior changed:
   ```sh
   npm run standards
   npx vitest run packages/cli/src/program.test.ts
   ```
8. Confirm the recorded help fixtures in `packages/cli/src/program-help-fixtures.ts` and
   `program-run-help-fixtures.ts` still match. If they do not, the refactor changed output and
   is wrong.

### T-02 - Extract the `--section` option helper

**Goal:** Both families parse and validate `--section` the same way.

**Step-by-step instructions:**

1. Create `packages/cli/src/lib/sections.ts`.
2. Export `addSectionOption(command, allowed)` which adds
   `--section <names>` with a comma-separated value and lists `allowed` in the option
   description.
3. Export `parseSectionOption(value, allowed)` which splits on commas, trims, rejects an
   unknown name with `CliUsageError`, and returns the full `allowed` list when `value` is
   undefined.
4. Leave `CriterionDetailSection` and `renderCriterionDetailLines` in
   `packages/cli/src/renderers/wcag-show.ts`. Only the option handling moves.
5. Update the WCAG command and `packages/cli/src/tui/finder-data.ts` to use the helper.
6. Run `npm run standards` and the CLI tests.

### T-03 - Add `pattern` and `search` families

**Goal:** The output envelope accepts the new families.

**Step-by-step instructions:**

1. In `packages/contracts/src/schemas/core.ts`, add `'pattern'` and `'search'` to
   `cliCommandFamilySchema`.
2. Run `npm run typecheck` and fix any exhaustive switch that now misses a case.
3. Run the contracts tests.

### T-04 - APG contracts schemas

**Goal:** The artifact has a schema before anything writes it.

**Step-by-step instructions:**

1. Create `packages/contracts/src/schemas/apg.ts`.
2. Import `w3cDocumentSourceSchema` from `./wcag.js` and reuse it for the `document` block, the
   way `schemas/mobile.ts` does.
3. Define, with a JSDoc block on each exported schema explaining what the APG calls it:
   - `apgAttributeValueSchema`: `{ raw, name, value: string | null, isIdRef: boolean }`.
     `value` is null when the APG writes the attribute with no value. `isIdRef` is true when
     the APG writes the value as `#IDREF` or `#IDREF+`.
   - `apgKeyboardRowSchema`: `{ testId: string | undefined, keyGroups: string[][], description: string[] }`.
     `keyGroups` holds one group per alternative and one entry per `<kbd>` within a group, so
     `Alt + Down Arrow` is `[['Alt', 'Down Arrow']]` and `Space or Enter` is
     `[['Space'], ['Enter']]`. See T-05 step 4 for why the two cases must not collapse.
     `description` holds one entry per `<li>`, or a single entry when the cell is a paragraph.
   - `apgAttributeRowSchema`: `{ testId, role, attribute, element, usage }` where `role` and
     `attribute` are optional because the APG leaves one of the two cells empty on every row.
   - `apgKeyboardTableSchema` and `apgAttributeTableSchema`: `{ name: string, rows: [...] }`.
   - `apgExampleSchema`: `{ id, patternId, title, pageUrl, sourceUrl, experimental, keyboardTables, attributeTables }`.
   - `apgPatternSchema`: `{ id, title, pageUrl, exampleIds }`.
   - `apgPatternsArtifactSchema`: `{ document, patterns, examples, roleIndex, attributeIndex }`.
4. Add `apgCheckRowStatusSchema` as `z.enum(['changed', 'no-observable-effect', 'not-testable'])`
   and `apgAttributeCheckStatusSchema` as `z.enum(['present', 'absent', 'not-testable'])`.
5. Add the result schemas the CLI and MCP layers share: `apgPatternShowResultSchema`,
   `apgExampleShowResultSchema`, `apgFindResultSchema`, `apgCheckResultSchema`.
6. Export every schema and its inferred type from `packages/contracts/src/index.ts`.
7. Run `npm run typecheck`.

### T-05 - APG parser

**Goal:** Two pure functions turn APG HTML into the artifact's row types, with no network and
no filesystem access.

**Step-by-step instructions:**

1. Create `packages/wcag-data/src/sources/apg/parse.ts`.
2. Export `ApgParseError` following `MobileGuidanceParseError` in
   `src/sources/mobile/parse.ts`: it carries the file name and prefixes the message.
3. Export `parseExampleIndex(html)`. Use `JSDOM` from the existing `jsdom` dependency.
   1. Select every `a[href]` whose href matches
      `^\.\./patterns/(?<pattern>[a-z0-9-]+)/examples/(?<example>[a-z0-9-]+)(?:/|\.html)$`.
   2. Derive `sourceUrl` as
      `https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/<pattern>/examples/<example>.html`
      and `pageUrl` as `https://www.w3.org/WAI/ARIA/apg/patterns/<pattern>/examples/<example>/`.
   3. Take the link text as the example title, trimmed, with the `(HC)` suffix the index adds
      for high-contrast variants left in place.
   4. Set `experimental` to true when the link's nearest preceding `h2` is the "Experimental
      Examples" heading.
   5. Build `roleIndex` from the "Examples by Role" table and `attributeIndex` from the
      "Examples By Properties and States" table, keyed by the first cell's text and holding the
      example ids linked in the second cell. Do not derive these from the example files; the
      published index is the source.
   6. Throw `ApgParseError` when fewer than 50 examples are found, so a page restructure fails
      the sync instead of silently producing a small artifact.
4. Export `parseApgExample(html, { exampleId, patternId })`.
   1. Select keyboard tables with `table.def[aria-labelledby~="kbd_label"]`.
   2. Select attribute tables with `table.data.attributes[aria-labelledby~="rps_label"]`.
      The `~=` token match is required: `data-grids.html` has three demo tables with
      `class="data"` that must not be picked up.
   3. Name each table from the `aria-labelledby` token that is not `kbd_label` or `rps_label`,
      resolved to that element's text. When the only token is `kbd_label` or `rps_label`, as in
      `disclosure-faq.html`, name the table the empty string and let the renderer omit the
      heading.
   4. For a keyboard row, read `data-test-id` into `testId` and parse the `th` into **key
      groups**. A cell with more than one `<kbd>` means one of two different things, and the
      text between the elements is what distinguishes them:
      - `<kbd>Alt</kbd> + <kbd>Down Arrow</kbd>` in `combobox-select-only.html` is one chord.
      - `<kbd>Space</kbd> or <kbd>Enter</kbd>` in `menu-button-actions.html` and
        `accordion.html` is two alternatives, each of which must satisfy the row on its own.

      Walk the `th`'s child nodes in order. Accumulate `<kbd>` text into the current group;
      when the text between two `<kbd>` elements contains `or`, start a new group. Produce
      `keyGroups: string[][]`, so `Alt + Down Arrow` is `[['Alt', 'Down Arrow']]` and
      `Space or Enter` is `[['Space'], ['Enter']]`. Fall back to the whole cell text as a
      single group of one when there is no `<kbd>`, which is how "Printable Characters"
      appears. Getting this wrong produces the nonsense chord `Down Arrow+Space+Enter`, which
      is what a naive join of every `<kbd>` in the `menu-button-actions` cell yields.

   5. For a keyboard row description, map each `li` to a string, or use the trimmed cell text
      when there is no list.
   6. For an attribute row, read the four cells positionally: 0 role, 1 attribute, 2 element,
      3 usage. Either cell 0 or cell 1 is empty on every row. Parse the attribute cell's
      `<code>` text with `^(?<name>[a-zA-Z-]+)(?:="(?<value>[^"]*)")?$` and set `isIdRef` when
      the value starts with `#IDREF`.
   7. Return empty arrays for both table lists when the file has neither table.
      `landmarks/examples/banner.html` is the case to keep working.
5. Add three sample files under `packages/wcag-data/test/apg/` copied from upstream:
   `combobox-select-only.html`, `disclosure-faq.html`, and `banner.html`. These are parser
   inputs, not fixtures the CLI serves.
6. Write the parser tests described in section 10 and run them:
   ```sh
   npx vitest run packages/wcag-data/src/index.apg.test.ts
   ```

### T-06 - APG sync and generation

**Goal:** `npm run wcag:sync` produces a committed, provenance-tracked artifact.

**Step-by-step instructions:**

1. Create `packages/wcag-data/src/generation/apg.ts`, following
   `src/generation/mobile.ts` closely.
2. Define the document block. The APG is not published under `/TR/` and carries no "Status of
   This Document" section, so do not copy the wording used for WCAG2Mobile. Confirm the
   current self-description on `https://www.w3.org/WAI/ARIA/apg/` before settling the string;
   as of 2026-09-08 the page describes itself as a W3C WAI accessibility resource.
   ```ts
   const APG_DOCUMENT = {
      title: 'ARIA Authoring Practices Guide (APG)',
      url: 'https://www.w3.org/WAI/ARIA/apg/',
      status: 'W3C WAI resource, informative guidance that is not a W3C Recommendation',
   } as const;
   ```
3. Export `syncApgPatterns({ directories, fetchImpl })`.
   1. Fetch the example index page.
   2. Fetch every example source with `mapWithConcurrency` at the existing
      `DEFAULT_CONCURRENCY` of 4.
   3. Collect failures into `ApgFetchFailure[]` rather than throwing, matching
      `MobileGuidanceFetchFailure`.
   4. Build `patterns` by grouping examples on `patternId` and taking the pattern page URL as
      `https://www.w3.org/WAI/ARIA/apg/patterns/<pattern>/`.
   5. Write the artifact with `writeGeneratedArtifact` from `./version.js` so it lands in the
      provenance manifest.
   6. Return `{ generated, requestCount, patternCount, exampleCount, keyboardRowCount, attributeRowCount, tablelessExampleCount, failures }`.
4. Export `syncApgPatterns` and `SyncApgPatternsResult` from `packages/wcag-data/src/index.ts`.
5. In `packages/wcag-data/scripts/sync.ts`, call `syncApgPatterns` after `syncMobileGuidance`
   and log every count from NFR-7, including the failure list.
6. Add both hosts to `listApprovedUpstreamSourceUrls` in `src/sources/definitions.ts`.
7. Run the sync and inspect the diff before committing:
   ```sh
   npm run wcag:sync
   git diff --stat packages/wcag-data/data/generated/
   ls -lh packages/wcag-data/data/generated/apg-patterns.json
   ```
8. Confirm the file is under 1 MB per NFR-2.

### T-07 - APG validation

**Goal:** A corrupted or truncated artifact fails the validate step, not a user's lookup.

**Step-by-step instructions:**

1. Create `packages/wcag-data/src/validation/apg.ts` following `validation/mobile.ts`.
2. Export `validateApgPatternsArtifact(directories)` which:
   1. Parses the file with `apgPatternsArtifactSchema`.
   2. Fails when an example's `id` does not match the key it is filed under.
   3. Fails when a pattern's `exampleIds` names an example that is absent from `examples`.
   4. Fails when a `roleIndex` or `attributeIndex` entry names an example that is absent.
   5. Fails when the artifact holds fewer than 50 examples or fewer than 20 patterns.
3. Export it from `packages/wcag-data/src/index.ts`.
4. Call it from `packages/wcag-data/scripts/validate.ts` and log the file name, the pattern
   count, and the example count.
5. Run:
   ```sh
   npm run wcag:validate
   ```

### T-08 - Engine lookups

**Goal:** `@a11ied/wcag-engine` reads the artifact once and answers lookups from memory.

**Step-by-step instructions:**

1. In `packages/wcag-engine/src/artifacts/load.ts`, add
   `loadApgPatterns(): ApgPatternsArtifact` using the existing `loadArtifact` helper with
   `'apg-patterns.json'`, next to `loadMobileGuidance`.
2. In `packages/wcag-engine/src/artifacts/runtime.ts`, add a cached accessor following the
   mobile guidance pattern, and make sure `resetWcagEngineCache` clears it.
3. Export from `packages/wcag-engine/src/index.ts`:
   - `getApgPattern(patternId)` and `getApgExample(exampleId)`, both raising
     `WcagEngineNotFoundError` with the lookup key when absent.
   - `listApgPatterns()`.
   - `findApgExamplesByRole(role)` and `findApgExamplesByAttribute(attribute)`.
   - `resolveApgLookupKey(key)` returning `{ kind: 'pattern' | 'example', id }` or undefined,
     which is what the CLI uses to dispatch a bare argument.
4. Add `searchApgEntries(query, limit)` in `packages/wcag-engine/src/search/runtime.ts`,
   reusing the existing ranking helpers. Weight the example title and the pattern title above
   the attribute usage prose.
5. Run the engine tests.

### T-09 - Core runtime

**Goal:** The product layer wraps the engine and normalizes errors the way the WCAG runtime
does.

**Step-by-step instructions:**

1. Create `packages/core/src/apg/runtime.ts`.
2. Reuse `normalizeEngineError` behavior from `packages/core/src/wcag/runtime.ts`. If it is not
   exported, move it to `packages/core/src/errors/engine-errors.ts` and have both call it.
   Do not copy it.
3. Export `showApgPattern`, `showApgExample`, `listApgPatternSummaries`,
   `findApgExamples({ role, attribute })`, and `searchApgPatterns(query, { limit })`.
4. Export a combined `searchAll(query, { version, limit })` that merges
   `searchWcagCriteria` and `searchApgPatterns` into one ranked list, each row carrying a
   `kind` field of `'criterion' | 'technique' | 'failure' | 'axe-rule' | 'pattern' | 'example'`.
5. Re-export everything from `packages/core/src/index.ts`.
6. Add the new functions to the public API list checked by
   `packages/core/src/public-api-docs.test.ts` and `release-consistency.test.ts`.

### T-10 - Pattern renderers

**Goal:** Terminal output matching the existing renderers.

**Step-by-step instructions:**

1. Create `packages/cli/src/renderers/pattern.ts`.
2. Export `renderPatternText`, `renderExampleText`, `renderPatternListText`,
   `renderPatternFindText`, and `renderPatternCheckText`.
3. Reuse `heading` and `dim` from `packages/cli/src/lib/format.js`. `renderers/shared.ts` has
   no generic table renderer, so add one there rather than inside `pattern.ts`: export
   `twoColumnLines(rows, { labelWidth })` producing a label column and a wrapped description
   column, and use it for both APG tables. Keep it in `shared.ts` so the WCAG renderers can
   adopt it later.
4. Print the source line on every view that prints APG prose with `attributionLine` from
   `renderers/shared.ts`, the helper the WCAG renderers already use for this. Pass the example
   title and its `pageUrl`.
5. Accept a `sections` option of `'keyboard' | 'attributes' | 'examples'` and gate each block on
   it, mirroring `renderCriterionDetailLines`.
6. Export the renderers from `packages/cli/src/renderers/index.ts`.

### T-11 - `a1 pattern` command

**Goal:** The lookup family, wired through the shared wrapper.

**Step-by-step instructions:**

1. Create `packages/cli/src/commands/pattern.ts`.
2. Register `pattern` on the program with `helpGroup: TOP_LEVEL_GROUPS.lookUp`, a summary, a
   description, an optional `[name]` argument, and an examples block:
   ```txt
   Examples:
     a1 pattern combobox
     a1 pattern combobox-select-only
     a1 pattern role combobox
     a1 pattern check http://localhost:3000 --pattern combobox-select-only
   ```
3. Dispatch the bare argument with `resolveApgLookupKey`, mirroring
   `showCriterionOrTechnique`. A name that resolves to neither raises `CliUsageError` with the
   lookup key and a suggestion from the search index.
4. With no argument, open the finder on a TTY and print help when piped or `--json`, copying
   `runWcagEntry`.
5. Register the `list`, `role <role>`, and `attribute <attribute>` subcommands.
6. Apply `addLookupOptions` from T-01 and `addSectionOption(command, ['keyboard', 'attributes', 'examples'])`
   from T-02. Do not apply the WCAG version option.
7. Call `registerPatternCommands(program)` from `packages/cli/src/program.ts`.
8. Regenerate the help fixtures and review the diff:
   ```sh
   npx vitest run packages/cli/src/program.test.ts -u
   git diff packages/cli/src/program-help-fixtures.ts
   ```

### T-12 - Unified `a1 search` and finder

**Goal:** One search over both corpora, without removing the scoped one.

**Step-by-step instructions:**

1. Create `packages/cli/src/commands/search.ts` registering a top-level `search <query>` with
   `family: 'search'`, `--limit` defaulting to 10, and `--kind` to filter to one row kind.
2. Render with a new `renderUnifiedSearchText` in `packages/cli/src/renderers/wcag.ts` that
   prints the kind as the first column.
3. Delete the `search` subcommand from `packages/cli/src/commands/wcag.ts` and delete
   `renderSearchText` from `renderers/wcag.ts` once nothing calls it. There is one search
   command, and `a1 search <query> --kind criterion` is the WCAG-scoped form. Do not leave an
   alias behind: the repo rule is to refactor and delete rather than deprecate.
4. Run the fallow MCP `trace_export` on `renderSearchText` before deleting it, to confirm the
   TUI finder and the MCP server are the only other callers and that both are updated.
5. In `packages/cli/src/tui/finder-data.ts`, add APG rows to `listFinderRows`. Give `FinderRow`
   a `kind` field and show it in the list. Selecting an APG row renders the example detail
   lines instead of the criterion detail lines.
6. Update `packages/cli/src/tui/finder-app.ts` for the new column and section list.
7. Regenerate help fixtures and run the CLI tests.

### T-13 - Role-derived next commands

**Goal:** Link the two corpora from observed page data, never from a stored mapping.

**Step-by-step instructions:**

1. In `packages/core/src/audit/next-commands.ts`, after the accessibility tree is available,
   collect the distinct roles in the tree.
2. For each role, call `findApgExamplesByRole`. When it returns at least one example, append
   `a1 pattern role <role>` to `nextCommands`, capped at three role suggestions so the list
   stays short.
3. Do the same in `packages/core/src/tree/runtime.ts` output if it carries next commands. If it
   does not, skip it and note that in the PR description.
4. Add a test asserting `a1 audit` on `packages/cli/test/fixtures/aria-widgets.html` suggests
   `a1 pattern role checkbox`, since that fixture has a `role="checkbox"`.

### T-14 - APG key text to Playwright keys

**Goal:** Turn the APG's key column into keys Playwright can press, and say plainly which ones
it cannot.

**Step-by-step instructions:**

1. Create `packages/core/src/apg/keys.ts`.
2. Export `toPlaywrightKeys(keyGroup: string[]): { chord: string } | { untestable: string }`.
   It takes one group from `keyGroups`, never the whole row, so alternatives are never joined
   into one chord.
3. Map the APG's spellings to Playwright key names:
   `Down Arrow` to `ArrowDown`, `Up Arrow` to `ArrowUp`, `Left Arrow` to `ArrowLeft`,
   `Right Arrow` to `ArrowRight`, `Home`, `End`, `Enter`, `Escape`, `Tab`, `Space` to `' '`,
   `Page Down` to `PageDown`, `Page Up` to `PageUp`, `Backspace`, `Delete`, and the modifiers
   `Alt`, `Control`, `Shift`, `Meta`.
4. Join a multi-key row with `+`, so `['Alt', 'Down Arrow']` becomes `Alt+ArrowDown`.
5. Return `{ untestable }` with a plain reason for rows that name no single key, which are
   "Printable Characters", "Any printable character", and similar. The reason string is printed
   in the report, so write it for a reader: `the APG describes a class of keys, not one key`.
6. Reuse the alias names already in `packages/guidepup/src/key-aliases.ts` where they overlap.
   Do not import that module into core; it targets screen reader chords, not browser keys.
   Duplicate only the four arrow spellings and note why in a comment.
7. Unit test every entry.

### T-15 - Static attribute check

**Goal:** Check the attribute table against a real DOM with no interpretation.

**Step-by-step instructions:**

1. Create `packages/core/src/apg/check-attributes.ts`.
2. Export `checkApgAttributes({ page, rootSelector, table })`.
3. For each attribute row:
   - Skip rows with no parsed attribute name and report `not-testable` with the reason
     `the row documents a role, not an attribute` when only the role cell is filled.
   - Query the root subtree for an element carrying the attribute. Report `present` when found.
   - When `isIdRef` is true, additionally resolve the id and report `absent` with the reason
     `points at an id that is not in the document` when it does not resolve. This is the check
     that catches the broken `aria-labelledby` in `aria-widgets.html`.
   - When the parsed value is a literal such as `false`, report `present` when the attribute
     exists with any value, and record the observed value in the row. Do not fail on a value
     mismatch: the APG lists both `aria-expanded="false"` and `aria-expanded="true"` as rows for
     the same attribute, so only one can hold at a time.
4. Return `ApgAttributeCheckRow[]` matching the contract schema.
5. Also return `applicabilityHints`: for each attribute the example documents that the widget
   does not set anywhere in the subtree, one entry with the attribute name and the keyboard
   rows whose `description` mentions it. This is a text match against the APG's own prose, and
   it is presented as a hint, never as a verdict. It answers "which parts of this pattern may
   not apply to my component" with evidence rather than with a guess: a row about
   `aria-multiselectable` is worth a second look when the widget never sets that attribute.
   The tool stops there. Deciding is T-25's job and recording it is T-23's.

### T-16 - Dynamic keyboard probe

**Goal:** Press each declared key and record what observably changed.

**Step-by-step instructions:**

1. Create `packages/core/src/apg/check-keyboard.ts`.
2. Export `probeApgKeyboard({ page, rootSelector, table, setupKeys })`.
3. Define the observation, read from the page before and after each press:
   - The focused element as a stable selector, using the existing helper in
     `packages/core/src/browser/helper.ts` if one fits, otherwise the tag, id, and role.
   - The values of `aria-expanded`, `aria-activedescendant`, `aria-selected`, `aria-checked`,
     `aria-pressed`, `aria-hidden`, and `tabindex` on every element in the root subtree.
   - The accessibility tree of the root, from `page.locator(rootSelector).ariaSnapshot()`,
     parsed with `parseAriaSnapshot` from `packages/core/src/tree/parse.ts`.
4. For each row, and within a row for **each group in `keyGroups` separately**:
   1. Reload the target and re-apply `setupKeys` so every key is pressed from the same
      documented starting state.
   2. Focus the root element itself when it is tabbable, otherwise its first tabbable
      descendant. Record which element was focused and return it on the row: the measurement
      showed this resolves to the right element for a combobox, a disclosure button, a menu
      button, an SVG slider, a checkbox, an accordion header, and a listbox, but the user needs
      to see it to trust a finding.
   3. Call `toPlaywrightKeys` on the group. On `untestable`, record `not-testable` with the
      reason and continue.
   4. Take the before observation, press the chord, wait for the page to settle using the
      existing settle helper rather than a fixed timeout, take the after observation.
   5. When any of the three observations differ, record `changed` and stop: one alternative
      satisfying the row is enough.
   6. When all three are identical, **re-probe once from a nudged state before reporting**.
      Reload, apply `setupKeys`, focus as above, press the row's opposite-direction key when
      the row names a direction (Up Arrow nudged with Down Arrow, Home nudged with End, and so
      on), then press the chord again. Report `no-observable-effect` only when the second probe
      is also identical. This exists because of the one false alarm the measurement found:
      `listbox-scrollable` loads with the first option selected, so Up Arrow correctly does
      nothing from that position. Without the second probe, every widget that starts at a
      boundary reports a finding it should not.
   7. Record on the row which probe decided it, so a reader can see that a `changed` verdict
      came from the nudged attempt.
5. Carry the APG's own `description` array on every row in the result, so the renderer prints
   what the pattern says the key should do next to what was observed.
6. Return `ApgKeyboardCheckRow[]`.

### T-17 - `a1 pattern check` command

**Goal:** The command, its output, and its exit code.

**Step-by-step instructions:**

1. Create `packages/core/src/apg/check-runtime.ts` exporting `runPatternCheck(input)` which
   resolves the target with `resolveDocumentTarget`, loads it with `withLoadedPage` from
   `packages/core/src/browser/shared-browser.ts`, runs T-15 then T-16, and returns
   `ApgCheckResult`.
2. Require `--selector <css>`. It scopes every check to one widget. Raise `CliUsageError` when
   it is omitted, when it matches nothing, and when it matches more than one element, naming
   the match count. Requiring it is not a convenience: the APG's own pages disagree on the
   container id, using `#ex1` on `combobox-select-only` and `#ex` on `listbox-scrollable`, so
   there is no default worth guessing, and on a real application page an unscoped check reports
   rows for widgets the user did not ask about.
3. Probe `keyboardTables[0]` by default. Include the names of every table not probed in the
   result as `unprobedTables`, so the renderer can print them.
4. Add `--table <name>` to select a table and `--setup <keys>` to press a chord sequence first.
   Reject `--table` naming a table the example does not have, with `CliUsageError`.
5. Register `check <target>` under `a1 pattern` in `packages/cli/src/commands/pattern.ts` with
   a required `--pattern <example-id>` option.
6. Set the exit code with `execution.exitCode`: `cliExitCodes.assertion` when any keyboard row
   is `no-observable-effect` or any attribute row is `absent`, otherwise success.
7. Render with `renderPatternCheckText`. Group by table, one line per row: the key, the status,
   the observation, and the APG's description indented under it. Print `unprobedTables` at the
   end with the `--table` command to reach each one.
8. Regenerate help fixtures.

### T-18 - Vendor 3 APG fixtures

**Goal:** Known-good pages to test a11ied against.

**Step-by-step instructions:**

1. Create `packages/cli/test/fixtures/apg/`.
2. Vendor three examples **byte-identical to upstream**, each in its own directory with the
   `js/` and `css/` files it references, following the layout of the existing `app/` fixture:
   - `apg/combobox-select-only/`, a scripted widget with two keyboard tables.
   - `apg/disclosure-faq/`, a scripted widget with one keyboard table.
   - `apg/banner/`, a landmark example with no tables, which exercises the empty case.
3. Rewrite only the `<link>` and `<script>` paths, which point at `../../../shared/` upstream,
   to the vendored copies. Change nothing else. Record the rewrite in the README so the next
   person knows the one way these differ from upstream.
4. Add a `refreshApgFixtures()` step to `packages/wcag-data/src/generation/apg.ts` that
   re-fetches these three directories during `npm run wcag:sync`, so an upstream fix arrives as
   a reviewable diff instead of going stale. This is the reason the files are not flattened.
5. Confirm `createTestServer()` serves them without changes. It already resolves any path under
   the fixture root and already sets the content type for `.js` and `.css`, so no server change
   should be needed. If one is, make it a separate commit.
6. Add an "APG examples" section to `packages/cli/test/fixtures/README.md` with one table row
   per directory, following the existing table format. Say what each is for, that they are
   expected to be clean, and that the two scripted ones belong under "Pages that need their
   scripts", so they are loaded by URL rather than by `readFixture`.
7. Add the license notice. Because the files are vendored rather than rewritten, the notice
   goes in the README section and in `NOTICE.md` rather than in an HTML comment inside each
   upstream file.
8. Confirm vale passes on the README, which is in the checked set:
   ```sh
   npm run prose
   ```

### T-19 - False-positive tests

**Goal:** Prove a11ied reports a correct implementation as correct.

**Step-by-step instructions:**

1. Create `packages/cli/src/testing/apg-fixtures.test.ts`.
2. For each vendored fixture, assert `runAxe` reports zero violations. If any rule does fire,
   do not suppress it. Investigate first: either the vendoring broke the example or a11ied has
   a false positive, and both are findings worth a separate commit.
3. For the two scripted fixtures, assert `runPatternCheck` returns no `no-observable-effect`
   and no `absent` rows, and exits 0.
4. Add a screen reader test in `packages/cli/src/vitest/` driving the combobox fixture through
   the virtual reader and asserting the role, the name, and the collapsed state are spoken.
   Follow `screen-reader-interaction.test.ts` for structure.
5. Run:
   ```sh
   npx vitest run packages/cli/src/testing/apg-fixtures.test.ts
   ```

### T-20 - MCP tools

**Goal:** Agents reach the pattern data without shelling out.

**Step-by-step instructions:**

1. In `packages/mcp-server/src/tools/knowledge.ts`, register `pattern_show` and `pattern_find`
   with `readOnlyAnnotations`, following `registerWcagShowTool` exactly.
   - `pattern_show` takes `name` and optional `sections`. It dispatches pattern or example with
     `resolveApgLookupKey`, the same way `wcag_show` dispatches criterion or technique.
   - `pattern_find` takes optional `role`, optional `attribute`, and optional `query`, and
     requires at least one.
2. Write each tool description to say what it returns and name the matching CLI command, in the
   style of the existing descriptions.
3. Rename the existing `wcag_search` tool to `search` and widen it to both corpora with a
   `kind` filter, matching the CLI change in T-12. `kind` here filters results; it is not a
   discriminator that picks which tool to call.
4. In `packages/mcp-server/src/tools/execution.ts`, register `pattern_check`. It drives a
   browser, so it is not read-only and must not carry `readOnlyAnnotations`.
5. Add the new tools to `packages/mcp-server/src/index.test.ts` in the same shape as the
   existing `wcag_show` and `run_axe` cases, and update the `wcag_search` cases to `search`.

### T-21 - Agent Skill section

**Goal:** An agent writing a custom widget looks the pattern up before writing it.

**Step-by-step instructions:**

1. Add a section to `packages/skills/a11ied/SKILL.md` after "Look up WCAG before testing",
   titled "Look up the ARIA pattern before writing a widget".
2. State the rule plainly: before writing or reviewing a custom widget with a role such as
   combobox, tabs, or menu, run `a1 pattern <role>` and follow the keyboard and attribute
   tables it prints, rather than recalling the APG.
3. Show the four commands from FR-4, FR-5, FR-7, and FR-11.
4. Say what `a1 pattern check` decides and what it does not: it reports a declared key that
   does nothing and an attribute that is missing, and it prints the APG's description of every
   other key for a person to judge.
5. Update `packages/skills/a11ied/resources/command-cheat-sheet.md` with the new commands.
6. Run `npm run prose`. Both files are in vale's checked set.

### T-22 - Docs, README, NOTICE

**Goal:** The licensing notice lands before the data, and the docs describe what shipped.

**Step-by-step instructions:**

1. Add an APG section to `packages/wcag-data/NOTICE.md` **in the same commit that first adds
   `apg-patterns.json`**, naming:
   - the ARIA Authoring Practices Guide and its URL,
   - the `w3c/aria-practices` repository as the source of the example files,
   - the W3C Software and Document License,
   - what is stored: the keyboard and attribute table rows, the example titles, and the URLs,
   - that the commands print the example title and URL whenever they print this material,
   - that the three vendored fixtures were flattened from their original CSS and JS includes.
2. Update `packages/wcag-data/README.md` with the new artifact and the sync counts it logs.
3. Update the root `README.md`: add `a1 pattern` to the command list at the top and add the APG
   to the standards data workflow section.
4. Update `packages/docs/src/pages/reference/cli.astro` with the `a1 pattern` and `a1 search`
   commands and every option.
5. Update `packages/docs/src/pages/reference/wcag-data.astro` with `apg-patterns.json`, its
   shape, and its provenance.
6. Update `packages/docs/src/pages/reference/mcp.astro` with the three new tools.
7. Run the full check:
   ```sh
   npm run standards && npm test && npm run prose
   ```

### T-23 - Generalize the evidence record

**Goal:** One store holds a judgment about a WCAG criterion and a judgment about an APG example
row, without a second store and without a parallel vocabulary.

**Step-by-step instructions:**

1. In `packages/contracts/src/schemas/evidence.ts`, add the test key as a discriminated union:
   ```ts
   export const evidenceTestSchema = z.discriminatedUnion('kind', [
      z.object({
         kind: z.literal('criterion'),
         criterionId: z.string().min(1),
         procedureId: z.string().min(1),
      }),
      z.object({
         kind: z.literal('patternRow'),
         exampleId: z.string().min(1),
         rowKey: z.string().min(1),
      }),
   ]);
   ```
2. Replace the flat `criterionId` and `procedureId` fields on `evidenceRecordSchema` with
   `test: evidenceTestSchema`. Leave `subject`, `outcome`, `mode`, `pointer`, `note`,
   `assertedBy`, `recordedAt`, and `subjectHash` alone. Do not change
   `evidenceOutcomeSchema`: `inapplicable` is already the value this whole line of work is
   about, and `cantTell` is already the value for "something happened and a person has to say
   whether it was right".
3. `rowKey` is the `data-test-id` plus the group index, such as `combobox-key-home[0]`. The
   index is required because test ids repeat within a file, which T-05 already establishes.
4. In `packages/core/src/evidence/store.ts`, change `keyOf` to join `subject`, a serialized
   test key, and `pointer`. Serialize a criterion test as `criterion:<id>:<procedure>` and a
   pattern test as `patternRow:<exampleId>:<rowKey>`.
5. Add tolerant reading for lines already on disk: a line with flat `criterionId` and
   `procedureId` parses into `{ kind: 'criterion', ... }`. This is not a deprecation, it is a
   reader that accepts the older line shape, and it stays.
6. In `packages/core/src/evidence/pending.ts`, `listRecordedCriterionIds` currently reads
   `record.criterionId` directly. Narrow on `record.test.kind === 'criterion'` first, so
   pattern rows never count toward criterion coverage.
7. In `packages/cli/src/commands/audit-evidence-actions.ts`, update `buildRecord` to build the
   criterion variant. No CLI option changes: `a1 audit record` keeps the same surface.
8. Run the whole suite. The evidence store tests in `packages/core/src/evidence/store.test.ts`
   are the ones that prove the migration:
   ```sh
   npx vitest run packages/core/src/evidence
   npm run standards
   ```

### T-24 - Row outcomes from the check

**Goal:** Every check row states an outcome the tool is willing to defend, and no more.

**Step-by-step instructions:**

1. In `packages/core/src/apg/check-runtime.ts`, map each row to an `EvidenceOutcome`:
   - `no-observable-effect` after both probes maps to `failed`.
   - `changed` maps to `cantTell`. Something happened; whether it was the documented behavior
     is a judgment. Do not map it to `passed`.
   - `not-testable` produces no outcome at all, because not recording a result already means
     untested, which is what `evidenceOutcomeSchema`'s own comment says.
2. Never produce `inapplicable`. Add a comment saying so, because the next reader will be
   tempted to infer it from `applicabilityHints`.
3. Add `--record` to `a1 pattern check`. When passed, append one evidence record per row that
   has an outcome, with `mode: 'semiAutomatic'`, the `subjectHash` from
   `hashAccessibilityTree`, and `assertedBy` from `--by`.
4. Add `--results <path>` matching the option `a1 audit record` already takes, so the store
   path is overridable the same way. The default stays `.a11ied/evidence.jsonl` through
   `resolveEvidenceFile`.

### T-25 - `a1 pattern record` and `a1 pattern pending`

**Goal:** The person or agent writes the judgment the tool refuses to make.

**Step-by-step instructions:**

1. Create `packages/cli/src/commands/pattern-evidence.ts`, modeled on
   `commands/audit-evidence.ts` and `audit-evidence-actions.ts`.
2. Register `a1 pattern record <target>` with `--pattern <example-id>`, `--row <rowKey>`,
   `--outcome`, `--mode`, `--pointer`, `--note`, `--by`, and `--results`. Reuse the option
   builders and the outcome and mode parsers from the audit evidence command rather than
   writing new ones. If they are not exported, move them to a shared module in one commit and
   use them in the next.
3. Reject a `--row` the example does not have, with `CliUsageError` and the closest matching
   row keys.
4. Register `a1 pattern pending <target>` with `--pattern <example-id>`. It lists the rows of
   the example with no recorded result for that subject. Model the shape on
   `listPendingCriteria`, but do not extend `PendingCriterion`: add
   `pendingPatternRowSchema` in the contracts, because the fields differ.
5. `a1 audit clear` already drops recorded results for a target. Confirm it drops pattern rows
   too once the record is generalized, and add a test that it does.

### T-26 - Check reads the store

**Goal:** Triage once. The exit code means something afterward.

**Step-by-step instructions:**

1. In `runPatternCheck`, read the recorded results for the subject before rendering.
2. Suppress rows recorded `inapplicable` or `passed` from the findings list. Print them in a
   closing block with the outcome, the note, and who recorded it, so a reader can see what was
   set aside and why. A suppressed row is never invisible.
3. Compare each recorded row's `subjectHash` with the current tree hash. On a mismatch, print
   the row as unjudged again with a warning that the component changed since the judgment, and
   count it toward the exit code. This is what stops a recorded `inapplicable` from becoming a
   permanent excuse.
4. Narrow the exit code: `cliExitCodes.assertion` when a row is `failed` with no recorded
   judgment, or when an attribute row is `absent`. A `cantTell` row alone does not fail the
   run, because the tool did not decide it.
5. Update the T-17 acceptance criteria and the FR-13 wording to match. FR-13 as first written
   exits 4 on every `no-observable-effect` row; FR-24 replaces it.

### T-27 - EARL export of pattern rows

**Goal:** A recorded pattern-row judgment reaches the report without inventing vocabulary.

**Step-by-step instructions:**

1. In `packages/contracts/src/schemas/earl.ts`, make `criterionSlugs` optional on
   `earlProcedureSchema`.
2. In `packages/earl/src/assertion.ts`, `buildTest` currently always writes
   `isPartOf: procedure.criterionSlugs.map(...)`. Omit `isPartOf` when the slugs are absent
   rather than writing an empty array.
3. Build the pattern-row procedure as the APG example page URL plus the row's `data-test-id`
   as a fragment, with the row's key and first description line as the title. That URL is a
   real anchor on the published page, so the report links to the row it asserts about.
4. `earl:inapplicable` and `earl:cantTell` are already standard EARL outcomes, so nothing is
   added to `earlOutcomeSchema`. Confirm that in the test rather than assuming it.
5. Add pattern-row assertions to the `a1 audit --earl` output path.

### T-28 - MCP record tool, skill, and docs

**Goal:** An agent can complete the loop without shelling out, and the skill states the split.

**Step-by-step instructions:**

1. Register `pattern_record` and `pattern_pending` in
   `packages/mcp-server/src/tools/evidence.ts`, next to whatever the audit evidence tools
   already are, not in `knowledge.ts`. `pattern_record` writes, so it is not read-only.
2. In the `pattern_record` description, state the rule plainly: record `inapplicable` when the
   component does not implement that part of the pattern, and say why in the note. An agent
   with no reason to give should record nothing.
3. Extend the SKILL.md section from T-21 with the triage loop and one sentence on the division:
   `a1 pattern check` reports what it observed, the agent decides what applies, and
   `a1 pattern record` keeps that decision so the next run does not ask again.
4. Update `packages/docs/src/pages/reference/cli.astro` and `mcp.astro` with the new commands
   and tools, and add the loop to the guides page that already covers evidence.
5. Run `npm run standards && npm test && npm run prose`.

## New Code

### `packages/contracts/src/schemas/apg.ts` (new)

Zod schemas and inferred types for the APG artifact, the lookup results, and the check
results. Mirrors `schemas/mobile.ts`, including reusing `w3cDocumentSourceSchema` for the
document block.

### `packages/wcag-data/src/sources/apg/parse.ts` (new)

`parseExampleIndex(html)` and `parseApgExample(html, ids)`, plus `ApgParseError`. Pure
functions over jsdom, no network and no filesystem. The `aria-labelledby~=` token selectors
live here and are the reason `data-grids.html` parses correctly.

### `packages/wcag-data/src/generation/apg.ts` (new)

`syncApgPatterns()` and `SyncApgPatternsResult`. Fetches both indexes and 68 example files
through `mapWithConcurrency`, assembles the artifact, writes it with `writeGeneratedArtifact`,
returns the counts the sync script logs.

### `packages/wcag-data/src/validation/apg.ts` (new)

`validateApgPatternsArtifact()`. Schema parse plus the four referential checks from T-07.

### `packages/wcag-engine/src/artifacts/load.ts` (modified)

Add `loadApgPatterns()`.

### `packages/wcag-engine/src/index.ts` (modified)

Export `getApgPattern`, `getApgExample`, `listApgPatterns`, `findApgExamplesByRole`,
`findApgExamplesByAttribute`, `resolveApgLookupKey`, and `searchApgEntries`.

### `packages/core/src/apg/runtime.ts` (new)

Product-level lookups and `searchAll`. Normalizes engine errors into `CliUsageError`.

### `packages/core/src/apg/keys.ts` (new)

`toPlaywrightKeys()`. The only place APG key spellings are translated.

### `packages/core/src/apg/check-attributes.ts` (new)

`checkApgAttributes()`. The fully automated half of `pattern check`.

### `packages/core/src/apg/check-keyboard.ts` (new)

`probeApgKeyboard()`. The observation model and the press loop.

### `packages/core/src/apg/check-runtime.ts` (new)

`runPatternCheck()`. Resolves the target, loads the page once, runs both checks, assembles the
result.

### `packages/core/src/errors/engine-errors.ts` (new)

`normalizeEngineError()`, moved out of `wcag/runtime.ts` so both runtimes call one copy.

### `packages/cli/src/lib/run-lookup.ts` (new)

`runLookupCommand()`. The wrapper both lookup families use. WCAG version is optional.

### `packages/cli/src/lib/sections.ts` (new)

`addSectionOption()` and `parseSectionOption()`.

### `packages/cli/src/renderers/shared.ts` (modified)

Add `twoColumnLines()`. The file already has `attributionLine()`, which is what prints the
source document and URL, and the pattern renderers reuse it unchanged.

### `packages/cli/src/renderers/pattern.ts` (new)

The five renderers from T-10.

### `packages/cli/src/commands/pattern.ts` (new)

`registerPatternCommands()`: the bare argument, `list`, `role`, `attribute`, and `check`.

### `packages/cli/src/commands/search.ts` (new)

`registerSearchCommand()`: the top-level unified search.

### `packages/contracts/src/schemas/evidence.ts` (modified)

Add `evidenceTestSchema` and replace the flat `criterionId` and `procedureId` on
`evidenceRecordSchema` with `test`. Add `pendingPatternRowSchema`.

### `packages/core/src/evidence/store.ts` (modified)

`keyOf` serializes the discriminated test key. The reader accepts lines already on disk that
use the flat criterion fields.

### `packages/cli/src/commands/pattern-evidence.ts` (new)

`a1 pattern record` and `a1 pattern pending`, reusing the option builders and the outcome and
mode parsers from the audit evidence command.

### `packages/earl/src/assertion.ts` (modified)

Omit `isPartOf` when a procedure has no criterion slugs, so an APG row can be a test case.

### `packages/cli/test/fixtures/apg/` (new)

Three APG examples vendored byte-identical, one directory each with the `js/` and `css/` they
reference. Only the `<link>` and `<script>` paths are rewritten. Refreshed by
`refreshApgFixtures()` during the sync.

### `packages/wcag-data/test/apg/` (new)

Three upstream sample files used as parser test inputs.

## Tests

### Parser, `packages/wcag-data/src/index.apg.test.ts`

- `parseExampleIndex` on the committed index sample returns at least 50 examples, and
  `combobox-select-only` maps to the expected raw source URL and page URL.
- `parseExampleIndex` builds a `roleIndex` where `combobox` names the six combobox examples.
- `parseExampleIndex` throws `ApgParseError` when given a page with no pattern links.
- `parseApgExample` on `combobox-select-only.html` returns two keyboard tables named "Closed
  Combobox" and "Listbox Popup", and the first has eight rows.
- The row for `Alt` plus `Down Arrow` parses to `keyGroups: [['Alt', 'Down Arrow']]`, one
  group, because the text between the two `kbd` elements is `+`.
- A `Space` or `Enter` row parses to `keyGroups: [['Space'], ['Enter']]`, two groups, because
  the text between them is `or`. Assert this against both `menu-button-actions.html` and
  `accordion.html`, which are the two files that exercise it.
- The `Down Arrow` row parses its description into two entries, one per `li`.
- Two attribute rows share the `testId` `combobox-aria-expanded` and are both kept, one with
  parsed value `false` and one with `true`.
- `aria-controls="#IDREF"` parses with `isIdRef` true.
- `parseApgExample` on `disclosure-faq.html` returns one keyboard table with an empty name.
- `parseApgExample` on `banner.html` returns empty arrays for both table lists and does not
  throw.
- `parseApgExample` on `data-grids.html` returns exactly one attribute table and does not pick
  up the three demo tables that carry `class="data"`.

### Validation, in the same file

- `validateApgPatternsArtifact` rejects an artifact where an example is filed under a
  mismatched key.
- It rejects an artifact where a `roleIndex` entry names an absent example.
- It rejects an artifact with fewer than 50 examples.

### Engine, `packages/wcag-engine/src/index.apg.test.ts`

- `getApgExample('combobox-select-only')` returns two keyboard tables.
- `getApgExample('nope')` raises `WcagEngineNotFoundError` carrying the lookup key.
- `resolveApgLookupKey('combobox')` returns `{ kind: 'pattern' }` and
  `resolveApgLookupKey('combobox-select-only')` returns `{ kind: 'example' }`.
- `findApgExamplesByRole('combobox')` returns the six combobox examples.
- The artifact is read from disk once across repeated lookups.

### Keys, `packages/core/src/apg/keys.test.ts`

- Every mapped spelling returns its Playwright name.
- `['Alt', 'Down Arrow']` returns the chord `Alt+ArrowDown`.
- `['Printable Characters']` returns `untestable` with a reason.
- The function takes one group, so there is no input that can produce the joined chord
  `ArrowDown+ +Enter`. Assert that passing a whole `keyGroups` array is a type error, not a
  silent join.

### Check, `packages/core/src/apg/check-runtime.test.ts`

- Running the check against the vendored `combobox-select-only.html` fixture returns no
  `no-observable-effect` rows and no `absent` rows.
- Running it against a copy with the arrow key handler removed returns `no-observable-effect`
  for `Down Arrow` and still returns `changed` for `Tab`.
- Running it against `packages/cli/test/fixtures/aria-widgets.html` with `--pattern` naming a
  checkbox example reports the broken `aria-labelledby` as `absent` with the id-does-not-resolve
  reason.
- A row whose first probe finds no change but whose nudged re-probe does is reported
  `changed`, not `no-observable-effect`. Build the fixture as a listbox that loads with the
  first option selected, which is the shape that produced the one false alarm in the
  measurement recorded in section 6.
- A row that finds no change on both probes is reported `no-observable-effect`.
- A row with two alternatives is satisfied when either alternative changes something, and the
  result records which one did.
- `--selector` omitted, matching nothing, and matching two elements each raise `CliUsageError`,
  and the two-match message names the count.
- `unprobedTables` names "Listbox Popup" when the default table is probed.
- `--table 'Listbox Popup'` with a `--setup` chord probes the second table.
- An unknown `--table` raises `CliUsageError`.

### CLI, `packages/cli/src/testing/handlers-pattern.test.ts`

- `a1 pattern combobox` exits 0 and prints the six example titles.
- `a1 pattern combobox-select-only` prints both keyboard tables and the APG URL.
- `a1 pattern combobox-select-only --section attributes` prints no keyboard table.
- `a1 pattern role combobox` and `a1 pattern attribute aria-expanded` return rows.
- `a1 pattern nope` exits 2 with a `CliUsageError` naming the lookup key.
- `a1 pattern --json` on a non-TTY prints help rather than opening the finder.
- `a1 pattern check` exits 4 on a fixture with a dead key and 0 on a clean one.
- `a1 search combobox` returns rows of more than one kind, each labeled.
- `a1 search "color contrast" --kind criterion` returns what `a1 wcag search "color contrast"`
  returned before T-12, asserted against the recorded fixture.
- `a1 wcag search` no longer exists and exits 2 with Commander's unknown-command error.

### Fixtures, `packages/cli/src/testing/apg-fixtures.test.ts`

- Each of the three vendored fixtures reports zero axe violations.
- The two scripted fixtures pass `runPatternCheck` with no findings.
- The combobox fixture speaks its role, name, and collapsed state through the virtual reader.

### Evidence, `packages/core/src/evidence/store.test.ts`

- A line already on disk with flat `criterionId` and `procedureId` reads back as
  `{ kind: 'criterion', ... }`.
- A criterion record and a pattern-row record for the same subject do not collide in `keyOf`.
- Recording the same pattern row twice replaces the earlier result on read, matching the
  existing behavior for criteria.
- `listRecordedCriterionIds` ignores pattern-row records, so they never count toward criterion
  coverage.
- `a1 audit clear` drops pattern-row records for the target as well as criterion records.

### Row outcomes and triage, `packages/core/src/apg/check-runtime.test.ts`

- A row with no observable effect on both probes maps to `failed`.
- A row that changed maps to `cantTell`, never to `passed`.
- A `not-testable` row produces no record at all.
- No input produces `inapplicable`.
- A row recorded `inapplicable` is suppressed from findings, appears in the closing block with
  its note, and does not affect the exit code.
- The same row, after the page's accessibility tree changes, is reported as unjudged again with
  the stale-judgment warning and does affect the exit code.
- The run exits 0 when the only remaining rows are `cantTell`.
- `applicabilityHints` lists an attribute the example documents that the widget never sets, and
  the keyboard rows whose description mentions it.

### EARL, `packages/earl/src/index.test.ts`

- A procedure with no criterion slugs produces a test case with no `isPartOf` key at all,
  rather than one with an empty array.
- A pattern-row assertion uses the APG example URL plus the `data-test-id` fragment as its
  test case `@id`.
- `earl:inapplicable` and `earl:cantTell` serialize without any addition to
  `earlOutcomeSchema`.

### Refactor guards

- `packages/cli/src/program.test.ts` and both help fixture files must show no diff after T-01
  and T-02, and a reviewed, intentional diff after T-11 and T-12.

## Review Checklist

- [x] Have all outstanding questions been answered? Yes. All seven are settled in section 4,
      and each one that changed a task says which task it changed.
- [x] Are there any ambiguities that need to be resolved? No. The two the draft raised are
      both closed. `--selector` is required rather than defaulting to `body`, and
      `no-observable-effect` exits 4.
- [x] Was the riskiest assumption tested rather than argued? Yes. The keyboard probe was run
      against seven APG reference implementations and against the repo's own broken-widget fixture
      before the plan was approved. Section 6 records the counts, the one false alarm, its cause,
      and the mitigation in T-16 step 4.6.
- [x] Does every task name the files it touches and a command to verify it?
- [x] Does the plan avoid storing any mapping W3C does not publish? Yes, see the design
      decision in section 6 and the out-of-scope item in section 3.
- [x] Does the licensing notice land in the same commit as the first APG data? Yes, T-22 step 1.
- [x] Are new dependencies introduced? No. `jsdom` and `playwright` are already dependencies of
      the packages that need them.
- [x] Before merging T-05, confirm the alternatives-versus-combination parse against every one
      of the 68 examples, not only the three sample files. Done: all 427 keyboard rows across the
      artifact produce 13 distinct chords, and every one is a real modifier combination such as
      `Shift + Tab` or `Alt + Down Arrow`. The data also uses `<br>` as an alternatives
      separator, which the first draft of the parser did not account for.
- [ ] FR-13 no longer describes what ships. Measurement against the APG's own combobox showed
      that failing on a missing attribute fails a correct implementation, so the rule narrowed to
      a dead key and a broken reference. See "What the implementation changed". Rewrite FR-13 and
      FR-24 as one rule before the evidence tasks land.
- [x] Does the applicability work invent a new concept? No. `evidenceOutcomeSchema` already has
      `inapplicable` and `cantTell`, the store is already append-only and safe for concurrent agent
      writes, `hashAccessibilityTree` already detects a changed subject, and `earl:inapplicable` is
      already standard EARL. T-23 widens the record's key and nothing else.

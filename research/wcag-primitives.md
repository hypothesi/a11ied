# wcag-aware primitives for the CLI, MCP, and agent skill

Checked on 2026-04-06.

## The design target

I want `a11ied` to answer three different questions cleanly:

1. "What does WCAG actually require here?"
2. "Which of those requirements matter for this page, story, or component?"
3. "What can we verify automatically, what needs a hybrid procedure, and what still needs a human call?"

If the product cannot answer all three, agents will either overclaim or wander.

## The primitive model

The cleanest shape is a five-layer stack:

1. knowledge primitives
2. applicability primitives
3. driver primitives
4. execution primitives
5. verification primitives

Each layer should work in CLI, MCP, and skill workflows without inventing a different mental model for each surface.

## 1. knowledge primitives

These are the "what is the rule?" operations.

### CLI

- `a11ied wcag levels --version 2.2`
- `a11ied wcag criteria --level AA --version 2.2`
- `a11ied wcag show 4.1.3`
- `a11ied wcag search "status message"`
- `a11ied wcag coverage 3.3.8`

### MCP

- `wcag_list_levels`
- `wcag_list_criteria`
- `wcag_get_criterion`
- `wcag_search`
- `wcag_get_coverage`

### What each primitive should return

- criterion id and slug
- title
- conformance level
- normative text
- details and notes
- sufficient techniques
- known failures
- links to the standard and understanding docs
- coverage summary: axe, ACT, Guidepup runbook, or manual only

## 2. applicability primitives

These answer "which criteria should we even care about for this target?"

This is where a lot of tools get sloppy. They either dump every criterion on the user or act too confident about relevance.

### Applicability statuses

Use a small explicit enum:

- `applicable`
- `likely-applicable`
- `not-detected`
- `out-of-scope`
- `unknown`

### Inputs

- target URL
- DOM and accessibility-tree signals
- page or component metadata
- optional user hint like "this is a login flow" or "this is a drag-and-drop widget"

### Signals worth using

- forms, validation, and error regions
- media elements
- landmarks, headings, dialogs, menus, and tablists
- `aria-live`, `role=status`, `role=alert`, `role=log`
- sticky or fixed overlays
- drag-and-drop affordances
- authentication flows
- repeated multi-step forms
- help and support affordances

### Data sources

- Quickref tag taxonomy for category hints
- DOM heuristics from the target page or story
- optional framework annotations

### CLI

- `a11ied inspect applicable --url https://...`
- `a11ied inspect criterion 4.1.3 --url https://...`

### MCP

- `wcag_list_applicable_criteria`
- `wcag_explain_applicability`

## 3. driver primitives

These make `a11ied` usable as an accessibility driver, not just a canned auditor.

They matter for three reasons:

1. some widgets will not fit the first generation of named patterns
2. agents need an escape hatch for exploratory testing
3. higher-level patterns should be built on top of one raw control surface, not bypass it

The goal is simple: let an agent drive VoiceOver, NVDA, or the virtual screen reader the way a real user would, while still preserving logs and machine-readable state.

### CLI

- `a11ied drive start --target voiceover`
- `a11ied drive start --target nvda`
- `a11ied drive key --target voiceover --keys "VO+RightArrow"`
- `a11ied drive key --target nvda --keys "tab"`
- `a11ied drive type --target nvda --text "hello world"`
- `a11ied drive next --target voiceover`
- `a11ied drive previous --target voiceover`
- `a11ied drive interact --target voiceover`
- `a11ied drive stop-interacting --target voiceover`
- `a11ied drive read --target nvda --last-spoken`
- `a11ied drive logs --target voiceover --spoken`
- `a11ied drive checkpoint --target nvda --label after-submit`
- `a11ied drive stop --target nvda`

### MCP

- `driver_start_session`
- `driver_stop_session`
- `driver_press_keys`
- `driver_type_text`
- `driver_next_item`
- `driver_previous_item`
- `driver_interact`
- `driver_stop_interacting`
- `driver_click_current_item`
- `driver_get_last_spoken_phrase`
- `driver_get_logs`
- `driver_clear_logs`
- `driver_checkpoint`

### What driver primitives should return

- target and session id
- normalized action payload
- timestamped action result
- last spoken phrase snapshot
- current item text snapshot
- log cursor or checkpoint metadata
- target-specific raw details when needed for debugging

The important bit is that these are not verdicts. They are control and observation primitives.

## 4. execution primitives

These are the things that actually gather evidence.

The mistake would be exposing only low-level driver commands or only canned patterns. The product needs both.

### Axe-backed primitives

- run rule set by standards tag
- run rule set by criterion id
- run rule set by explicit rule ids
- return violations, passes, needs-review, incomplete, and raw rule metadata

Suggested CLI shape:

- `a11ied run axe --url https://... --criterion 4.1.2`
- `a11ied run axe --url https://... --level AA`

Suggested MCP tools:

- `axe_run_by_level`
- `axe_run_by_criterion`
- `axe_list_rules`

### Guidepup-backed interaction patterns

These should be named patterns with stable outputs, built on top of the driver primitives.

I would start with:

- `tab_sequence`
- `landmark_sequence`
- `heading_sequence`
- `form_field_walk`
- `status_message_probe`
- `dialog_probe`
- `focus_order_probe`
- `focus_visibility_probe`
- `focus_obscured_probe`
- `auth_flow_probe`
- `redundant_entry_probe`

Each pattern should emit:

- step log
- spoken phrase log
- item text log
- assertion results
- attached browser or DOM evidence when needed

### Why this matters

A criterion like 4.1.3 Status Messages is not really "run screen reader commands until vibes emerge." It is:

1. trigger a state change
2. keep focus where it is supposed to stay
3. capture whether the status message is exposed and announced
4. preserve the exact spoken evidence

That is a reusable primitive.

## 5. verification primitives

This is the orchestration layer. It answers the compliance question without pretending every criterion is equally automatable.

### CLI

- `a11ied verify criterion 4.1.3 --url https://... --target nvda`
- `a11ied verify criterion 3.3.8 --story auth-login--default --target voiceover`
- `a11ied verify level AA --url https://...`

### MCP

- `verify_criterion`
- `verify_level`
- `verify_story_criterion`
- `verify_story_level`

### Result model

Every verification should return a per-criterion verdict with explicit evidence status:

- `pass`
- `fail`
- `needs-manual-review`
- `not-applicable`
- `not-covered`
- `error`

And it should always include:

- what sources and procedures were used
- what was not covered
- whether the verdict is automated, hybrid, or manual

That last piece is the difference between a serious tool and a marketing claim.

## The interaction between WCAG data and execution

The nice part is that these layers line up well:

- `wcag show 4.1.3` tells you what the criterion requires
- `wcag coverage 4.1.3` tells you axe and ACT do not really cover it
- `inspect applicable` says this page has live regions and form errors, so it matters
- `drive` gives the agent a raw accessibility-driver surface when the component is weird or the pattern does not exist yet
- `run pattern status_message_probe` gathers repeatable evidence when the pattern does exist
- `verify criterion 4.1.3` packages the result into a criterion-level verdict

That is coherent. It does not ask the agent to improvise the product model on every run.

## Skill behavior

The Agent Skill should teach this exact loop:

1. Resolve the WCAG target.
2. Look up the criterion or level requirements locally.
3. Determine applicability for the page.
4. Check coverage before testing.
5. Use `drive` primitives when the agent needs to manually operate the UI or screen reader.
6. Use axe where automation exists.
7. Use Guidepup-backed patterns where interaction or announcement behavior matters and a reusable procedure already fits.
8. State clearly when evidence is partial.

The skill should also be blunt about one thing:

Do not say "this is WCAG compliant" unless the evidence model actually supports that claim.

Say:

- "passed the covered checks for WCAG 2.2 AA"
- "failed criterion 4.1.2"
- "criteria 2.4.3 and 4.1.3 still need hybrid verification"

That is a lot more believable.

## Data package recommendation

Add two packages to the future design:

- `packages/wcag-data`: fetch, normalize, and snapshot WCAG, ACT, Quickref, and axe metadata
- `packages/wcag-engine`: search, lookup, applicability, coverage, and verification planning

That keeps the CLI, MCP server, and skill all reading from the same source of truth.

## Sources

- WAI WCAG 2.2 JSON: [https://www.w3.org/WAI/WCAG22/wcag.json](https://www.w3.org/WAI/WCAG22/wcag.json)
- W3C WCAG repo: [https://github.com/w3c/wcag](https://github.com/w3c/wcag)
- WAI Quickref repo: [https://github.com/w3c/wai-wcag-quickref](https://github.com/w3c/wai-wcag-quickref)
- axe-core API docs: [https://github.com/dequelabs/axe-core/blob/develop/doc/API.md](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md)
- Guidepup docs: [https://guidepup.dev](https://guidepup.dev)

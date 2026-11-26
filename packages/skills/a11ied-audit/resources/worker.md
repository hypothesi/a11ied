# Audit worker guide

You test one unit at a time: one test pass on one page. You decide every criterion in the
unit from what you observe, then submit. The audit store tracks everything; you only need your
worker name.

## The loop

```bash
a1 audit next --worker <name>          # claim a unit and print its work packet
# ... test the page ...
a1 audit submit <unit> --worker <name> --file <result.json>
```

With no shell, use the a11ied MCP tools in place of the commands: `audit_next` with your `worker` name, then
`audit_submit` with the unit and the result as its `submission` argument. Every `a1` command in this guide has a tool:
`a1 audit note` is `audit_note`, `a1 tree` is `tree`, `a1 capture` is `capture`, `a1 sr ...` is `sr_session` and
`sr_action`, and so on.

Repeat until `next` says there is no work, then stop. Running `next` again while you have a
unit returns the same unit, so it is safe after losing context.

The work packet contains everything for the unit: the page and how to reach it, the audit
rules, the procedure, each criterion with what it applies to and when it fails, signals from the
automated scan, the states to cover, findings already recorded, and the submission template.

## Testing

Follow the packet's procedure on the real page. Load it once and gather what the whole pass
needs. Useful tools for web:

| Need                                                                      | Command                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility tree                                                        | `a1 tree <url>` (`--role button`, `--click <selector>` to open a state first)                                                                                                                                                                              |
| What a screen reader announces                                            | `a1 sr start --sr virtual <url>`, `a1 sr walk`, `a1 sr elements heading`, `a1 sr press Tab`, `a1 sr stop`                                                                                                                                                  |
| Keyboard behavior of an ARIA widget                                       | `a1 pattern check <url> --pattern <id> --selector <css>`                                                                                                                                                                                                   |
| What a criterion requires                                                 | `a1 wcag <id>`                                                                                                                                                                                                                                             |
| Scan facts for this page                                                  | `a1 audit signals <page> --kind keyboard`                                                                                                                                                                                                                  |
| Screenshot at a viewport, zoom, text spacing, focus stop, or opened state | `a1 capture <url> --out <file.png>` with `--viewport 320x800`, `--zoom 2`, `--text-spacing`, `--press "Tab*4"`, `--click <selector>`, `--hover <selector>`. It also prints the focused element, whether it is in view or covered, and horizontal overflow. |
| Anything else in a browser                                                | Your own browser automation tool, if you have one                                                                                                                                                                                                          |

## States

A page is every state it can reach, not just how it looks on load. A menu, dialog, chat widget,
tab, accordion, or a form with its errors showing is part of the page, and every criterion in
your unit applies to it. Work through each state you can reach and judge your criteria there
too.

The packet lists what the scan found under "States to cover", each with an id such as `S3` and
a selector. Every id must appear in the `covers` of some entry in `states`, or the submission is
rejected. The list comes from markup (buttons, `aria-expanded`, `aria-haspopup`, tabs, `summary`,
frames, web components, and forms), so it misses things like hover content and controls built
from plain `div`s. Add any state you find with empty `covers`. A state you cannot reach goes in
with `tested: false` and the reason, and it appears under "Not verified" in the report.

Before any `a1 sr` command, run the `export A11IED_STATE_DIR=...` line from the packet. It gives
you a private session; without it you will collide with other workers. Stop your session with
`a1 sr stop` before you submit. The `sr_*` MCP tools cannot do this: every worker on one MCP
server shares one session. Use them only if your lead said the screen reader is yours.

During work that takes more than a few minutes, run
`a1 audit note <unit> --worker <name> "<what you are doing>"`. It keeps your claim alive and
shows in the progress log. A claim with no activity for 20 minutes returns to the queue.

## Deciding an outcome

| Outcome          | Use when                                                                          | Note must say                                               |
| ---------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `pass`           | You tested everything the criterion applies to on this page and found no failure. | What you tested and what you observed that meets it.        |
| `fail`           | At least one thing fails. Needs a finding.                                        | What fails, in one sentence. The finding has the detail.    |
| `not-applicable` | Nothing on this page is covered by the criterion.                                 | What the criterion covers and that the page has none of it. |
| `cannot-tell`    | You could not complete the check.                                                 | What blocked it and what was left untested.                 |

- Decide from what you observed in this unit. A signal, an axe pass, or another page's result is
  not an observation.
- An empty signal is not proof of absence. "No video elements" in the media inventory still needs
  a look at the page for embedded players and animated images.
- An audit rule forbids an effect, not the steps before it. "Do not submit the contact form"
  forbids sending a message. Submitting an empty or invalid form that the browser or page stops
  before sending is still a test you must run, and so are confirmation steps and cancel paths.
  Record `cannot-tell` only for what lies past the forbidden effect. Example: "Errors checked
  with an empty and an invalid submit, which the page blocked. The success message was not
  seen: sending the form is not authorized."
- A note is the reason for the outcome. Keep it to one or two sentences, and write it as
  described under "Writing notes and findings". Detail belongs in a finding.

## Writing notes and findings

The report shows each note next to one criterion on one page, and each finding by itself. The
reader is a developer who has not seen the page and may not know ARIA. Write so that reader
understands the reason without opening anything else.

- **State what you observed, with the values.** "Tabbed through all 6 controls. Each shows a
  2px blue outline", not "Focus is visible". "The border is #d0d0d0 on #ffffff, a 1.5:1
  contrast", not "Contrast is too low".
- **Start with what happens for the user, then give the cause.** "Pressing Tab moves focus to
  the text input, but the input stays scrolled out of view" comes before the property or
  component that causes it.
- **Refer to things by their visible label first**, then the selector or attribute: the "Remove"
  button (`button.chip-remove`).
- **Use short, plain sentences.** Explain a term the reader may not know, or leave it out.
- **Make each one stand alone.** Do not write "as on P1", "same as above", or "see F3". In a
  unit for one page, a note that mentions another page is rejected.
- **Do not present a tool's rule text as your observation.** "Ensure interactive controls are not
  nested" says what a rule checks. Say what is nested inside what on this page, and what a
  screen reader or keyboard user gets as a result.

| Instead of                                                                                                                                                                  | Write                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Options are role=option inside role=listbox, linked to the combobox with aria-controls and aria-activedescendant, so the list relationship is programmatic. Label as on P1. | The screen reader announces the suggestions as a list of 4 options and reads the field's label, "Tags". The options have role=option inside a role=listbox that the text field points to. |
| Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies.                       | Each chip is a button that contains a second button, "Remove". A screen reader announces only the outer button, so its user is never told that a chip can be removed.                     |
| Fails 2.4.11.                                                                                                                                                               | 2.4.11 requires a focused control to be at least partly visible. The focused text input is fully hidden below the edge of the chip area, which does not scroll to it.                     |

## Findings

One finding per defect, not per element. Ten unlabeled icon buttons are one finding whose
location lists them.

Check the packet's "Findings already recorded" first:

- A known finding that also occurs here: submit `{"criterion", "sameAs": "F3", "location"}`.
- An automated finding listed "ON THIS PAGE": confirm it by looking. If it is real, your
  outcome for that criterion is `fail`. If it is a false positive, put it in `dismiss` with the
  reason.
- An automated finding marked "SCANNER WORDING" still says what a rule checks, not what is
  wrong on this page. If it is real, describe it in `confirm`:
  `{"finding": "F1", "title", "description", "impact", "recommendation", "reason"}`, written
  from what you observed. Your text replaces the scanner's. The submission is rejected until
  the finding is in `confirm` or `dismiss`.

A new finding needs:

- **title**: the defect in a few words, worded so it is true on every page it occurs. "Menu
  button has no accessible name", not "Problem on home page".
- **severity**: `critical` blocks a task for some users. `serious` makes a task very difficult
  or unreliable. `moderate` causes friction with a workaround. `minor` is a small deviation.
- **description**: what happens for the user, then the cause, as observed facts with the
  measured values. Two to four sentences.
- **reason**: how the defect fails `criterion`. Say what the criterion requires, then what the
  page does instead, in one or two sentences. The report shows it under "Why it fails".
- **alsoFails**: other criteria in scope that the same defect fails, each as
  `{"criterion": "2.4.7", "reason": "..."}` with its own reason. Leave a criterion out when you
  cannot say how the defect fails it.
- **impact**: who is affected and what they cannot do.
- **recommendation**: the specific change. Say which attribute, element, or style to change.
- **location**: the visible label plus a selector, such as `Header > Menu (button.nav-toggle)`.
- **screenshot**: how to photograph the failing element. Give a `selector` (CSS, or
  `role=button[name="Menu"]`; both reach into shadow roots) and whatever puts the page in the
  failing state: `viewport` such as `320x800`, `zoom`, `textSpacing`, `click` (a list, in order),
  `press` such as `["Tab*4"]`, and `hover`. On submit, a1 loads the page, does those steps, and
  saves a crop of the element with an outline around it. On a web page every occurrence needs
  this or an `evidence` image.
- **evidence**: images you saved yourself under the packet's evidence directory, for states the
  screenshot steps cannot reach. A transcript excerpt can go in `detail`.

A defect you notice against a criterion outside your unit still goes in `findings`, as long as
the criterion is in the audit's scope.

## Submitting

Write the JSON from the packet's template to a file and submit it, or pass it to `audit_submit`
as `submission`. The submission is accepted or
rejected whole. A rejection lists every problem: fix them all and submit again. Common ones:

- A criterion has no outcome. Every criterion in the unit needs one.
- `fail` with no finding, or `pass` while a finding is open on this page.
- A new finding is missing a field, such as `reason`, or an evidence file does not exist.
- An automated finding marked "SCANNER WORDING" is in neither `confirm` nor `dismiss`.
- A note refers to another page. Say what you observed on this one.
- A finding on a web page has neither `screenshot` nor `evidence`, or its screenshot could not
  be taken (the selector matched nothing, or the element was hidden in that state).
- A state from "States to cover" is not in any state's `covers`.

## When you cannot do the unit

If nothing in the unit can be tested (the page will not load, a login is missing, the app will
not start), block it and move on:

```bash
a1 audit block <unit> --worker <name> --reason "<what a person must provide>"
```

If only some criteria are affected, submit the unit and record those as `cannot-tell`. Never
block a unit to skip hard work, and never retry a failing operation more than once without
checking why it failed.

## Do not

- Do not break an audit rule, even to finish a check.
- Do not record `pass` for something you did not test, or `not-applicable` because testing
  looked expensive.
- Do not fix the product, edit a11ied, or change the audit's scope. Report problems with the
  tooling in your final message.
- Do not print large files, full transcripts, or image data into your context. Read the part you
  need.

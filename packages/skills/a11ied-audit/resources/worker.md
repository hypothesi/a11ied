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

Repeat until `next` says there is no work, then stop. Running `next` again while you have a
unit returns the same unit, so it is safe after losing context.

The work packet contains everything for the unit: the page and how to reach it, the audit
rules, the procedure, each criterion with what it applies to and when it fails, signals from the
automated scan, findings already recorded, and the submission template.

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

Before any `a1 sr` command, run the `export A11IED_STATE_DIR=...` line from the packet. It gives
you a private session; without it you will collide with other workers. Stop your session with
`a1 sr stop` before you submit.

During work that takes more than a few minutes, run
`a1 audit note <unit> --worker <name> "<what you are doing>"`. It keeps your claim alive and
shows in the progress log. A claim with no activity for 20 minutes returns to the queue.

## Deciding an outcome

| Outcome          | Use when                                                                          | Note must say                               |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| `pass`           | You tested everything the criterion applies to on this page and found no failure. | What you tested and how.                    |
| `fail`           | At least one thing fails. Needs a finding.                                        | The short version of the failure.           |
| `not-applicable` | Nothing on this page is covered by the criterion.                                 | What you looked for and did not find.       |
| `cannot-tell`    | You could not complete the check.                                                 | What blocked it and what was left untested. |

- Decide from what you observed in this unit. A signal, an axe pass, or another page's result is
  not an observation.
- An empty signal is not proof of absence. "No video elements" in the media inventory still needs
  a look at the page for embedded players and animated images.
- When a check needs an action the audit rules forbid, do the parts you can and record
  `cannot-tell` for the rest. Example: "Field labels and required markers checked. Error messages
  not exercised: submitting the form is not authorized."
- Keep notes to one or two sentences. Detail belongs in a finding.

## Findings

One finding per defect, not per element. Ten unlabeled icon buttons are one finding whose
location lists them.

Check the packet's "Findings already recorded" first:

- A known finding that also occurs here: submit `{"criterion", "sameAs": "F3", "location"}`.
- An automated finding listed "ON THIS PAGE": confirm it by looking. If it is real, your
  outcome for that criterion is `fail`. If it is a false positive, put it in `dismiss` with the
  reason.

A new finding needs:

- **title**: the defect in a few words, worded so it is true on every page it occurs. "Menu
  button has no accessible name", not "Problem on home page".
- **severity**: `critical` blocks a task for some users. `serious` makes a task very difficult
  or unreliable. `moderate` causes friction with a workaround. `minor` is a small deviation.
- **description**: what is wrong, as an observed fact with the measured values.
- **impact**: who is affected and what they cannot do.
- **recommendation**: the specific change. Say which attribute, element, or style to change.
- **location**: the visible label plus a selector, such as `Header > Menu (button.nav-toggle)`.
- **evidence**: a screenshot for anything visual, saved under the evidence directory in the
  packet and referenced by its path. A transcript excerpt can go in `detail`.

A defect you notice against a criterion outside your unit still goes in `findings`, as long as
the criterion is in the audit's scope.

## Submitting

Write the JSON from the packet's template to a file and submit it. The submission is accepted or
rejected whole. A rejection lists every problem: fix them all and submit again. Common ones:

- A criterion has no outcome. Every criterion in the unit needs one.
- `fail` with no finding, or `pass` while a finding is open on this page.
- A new finding is missing a field, or an evidence file does not exist.

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

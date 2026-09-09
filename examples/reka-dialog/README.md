# Reka UI dialog

A test suite for the dialog demo on
[reka-ui.com](https://reka-ui.com/docs/components/dialog). It checks the demo against the
ARIA Authoring Practices Guide (APG) modal dialog example, which `a1 pattern dialog`
prints, and against the WCAG 2.2 A and AA rules axe automates.

The suite runs against the live site, so it needs the network. It uses the built
`a11ied` package, so run `npm run build` first.

```sh
npm run build
npm run test:examples
```

## Files

- `dialog.test.ts` reads the demo with the virtual screen reader through the `sr` fixture
  from `a11ied/vitest`. A comment above each test gives the APG row it covers and the
  WCAG criterion behind that row.
- `dialog.cli.test.ts` runs the `a1` binary. The dialog is not on the page until its
  button is clicked, so `a1 axe`, `a1 pattern check`, and `a1 pattern record` all take
  `--click` with a selector for that button.
- `dialog.batch.jsonl` is the batch script. It opens the dialog with Enter, presses Tab,
  Shift+Tab, and Escape, and checks what the reader says after each one.
- `../lib/run-a1.ts` spawns `a1` from this repository's `node_modules/.bin`.

## What the tests check

| Test                                             | APG row                                              | WCAG criterion                      |
| ------------------------------------------------ | ---------------------------------------------------- | ----------------------------------- |
| The trigger says it opens a dialog               |                                                      | 4.1.2 Name, Role, Value             |
| The dialog is named by its title and described   | `dialog-role`, `aria-labelledby`, `aria-describedby` | 4.1.2, 1.3.1 Info and Relationships |
| Focus moves to the first field                   |                                                      | 2.4.3 Focus Order                   |
| The title is a level 2 heading                   |                                                      | 1.3.1, 2.4.6 Headings and Labels    |
| Tab stays inside the dialog and wraps            | `key-tab`                                            | 2.1.1 Keyboard, 2.4.3 Focus Order   |
| Shift+Tab wraps backwards                        | `key-shift-tab`                                      | 2.1.1 Keyboard, 2.4.3 Focus Order   |
| Escape closes and returns focus                  | `key-escape`                                         | 2.1.1 Keyboard, 2.4.3 Focus Order   |
| The Close button closes and returns focus        |                                                      | 2.1.1 Keyboard                      |
| The rest of the page is hidden while open        | `aria-modal`                                         | 2.4.3 Focus Order                   |
| Every control the dialog needs is inside it      |                                                      | 1.3.1 Info and Relationships        |
| axe finds no A or AA violation inside the dialog |                                                      | Every criterion axe maps a rule to  |

## Results on 2026-09-09

One test fails. axe reports `color-contrast` on the Save changes button inside the open
dialog: green text on a light green background, below the 4.5:1 ratio WCAG 1.4.3
requires.

The demo does not set `aria-modal`. It hides the rest of the page with `aria-hidden`
instead, which the reader confirms: after the Close button it reads `end of dialog` and
then `end of document`. The triage test records that row as inapplicable with this
reason, and the next check sets it aside.

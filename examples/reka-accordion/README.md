# Reka UI accordion

A test suite for the accordion demo on
[reka-ui.com](https://reka-ui.com/docs/components/accordion). It checks the demo against
the ARIA Authoring Practices Guide (APG) accordion example, which `a1 pattern accordion`
prints, and against the WCAG 2.2 A and AA rules axe automates.

The suite runs against the live site, so it needs the network. It uses the built
`a11ied` package, so run `npm run build` first.

```sh
npm run build
npm run test:examples
```

## Files

- `accordion.test.ts` reads the demo with the virtual screen reader through the `sr`
  fixture from `a11ied/vitest`. A comment above each test gives the APG row it covers
  and the WCAG criterion behind that row.
- `accordion.cli.test.ts` runs the `a1` binary: `a1 axe` for the automated rules,
  `a1 pattern check` for the pattern's rows, `a1 sr batch` for the keyboard rows a person
  has to judge, and `a1 pattern record` and `a1 pattern pending` to record those
  judgments.
- `accordion.batch.jsonl` is the batch script. It presses Enter, Tab, Space, and
  Shift+Tab on the demo's headers and checks what the reader says after each one.
- `../lib/run-a1.ts` spawns `a1` from this repository's `node_modules/.bin`.

## What the tests check

| Test                                             | APG row                                 | WCAG criterion                               |
| ------------------------------------------------ | --------------------------------------- | -------------------------------------------- |
| Each header is a level 3 heading with a button   | `h3-element`                            | 1.3.1 Info and Relationships, 2.4.6 Headings |
| The open header says expanded                    | `button-aria-expanded`                  | 4.1.2 Name, Role, Value                      |
| A header refers to its panel                     | `button-aria-controls`                  | 4.1.2 Name, Role, Value                      |
| Enter and Space expand a collapsed header        | `key-enter-or-space`                    | 2.1.1 Keyboard, 3.2.2 On Input               |
| Opening a header collapses the one that was open | `key-enter-or-space`                    | 2.1.1 Keyboard                               |
| Tab and Shift+Tab move through the headers       | `key-tab`, `key-shift-tab`              | 2.1.1 Keyboard, 2.4.3 Focus Order            |
| The open panel is a region named by its header   | `region-role`, `region-aria-labelledby` | 1.3.1 Info and Relationships                 |
| A collapsed panel is skipped                     | `region-role`                           | 1.3.1 Info and Relationships                 |
| axe finds no A or AA violation inside the demo   |                                         | Every criterion axe maps a rule to           |

## Results on 2026-09-09

Two tests fail, and both report the same thing. Until a person activates a header, every
trigger button on the demo has `aria-controls=""`. The virtual reader announces
`button, Is it accessible?, expanded` on load and `button, Is it accessible?, 1 control,
expanded` after the first Enter. `a1 pattern check` reports the `button-aria-controls`
row as absent, set to an empty value on 3 elements. The other rows pass.

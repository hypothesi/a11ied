# Reka UI tooltip

A test suite for the tooltip demo on
[reka-ui.com](https://reka-ui.com/docs/components/tooltip). The ARIA Authoring Practices
Guide (APG) has no tooltip example, so the tests check the WCAG 2.2 criteria a tooltip
serves: 1.4.13 Content on Hover or Focus, 2.1.1 Keyboard, and 4.1.2 Name, Role, Value.

The suite runs against the live site, so it needs the network. It uses the built
`a11ied` package, so run `npm run build` first.

```sh
npm run build
npm run test:examples
```

## Files

- `tooltip.test.ts` reads the demo with the virtual screen reader through the `sr`
  fixture from `a11ied/vitest`. A comment above each test gives the WCAG criterion it
  covers.
- `tooltip.cli.test.ts` runs `a1 axe` against the trigger and `a1 sr batch` with the
  script below.
- `tooltip.batch.jsonl` moves focus onto the trigger with Tab, checks the tooltip text is
  read, and checks that Escape dismisses it without moving focus.
- `../lib/run-a1.ts` and `../lib/a1-results.ts` spawn `a1` and read its results.

## What the tests check

| Test                                             | WCAG criterion                          |
| ------------------------------------------------ | --------------------------------------- |
| Keyboard focus on the trigger opens the tooltip  | 1.4.13 Content on Hover or Focus, 2.1.1 |
| The tooltip text is read with the trigger        | 4.1.2 Name, Role, Value                 |
| Escape dismisses the tooltip and keeps focus     | 1.4.13 Content on Hover or Focus        |
| The tooltip closes when focus leaves the trigger | 1.4.13 Content on Hover or Focus        |
| The trigger has a name before the tooltip opens  | 4.1.2 Name, Role, Value                 |
| axe finds no A or AA violation on the trigger    | Every criterion axe maps a rule to      |

The APG tooltip pattern also asks for the tooltip element to have role `tooltip`, which
the reader cannot reach: the demo renders it visually hidden and the reader moves past it.
`aria-describedby` on the trigger is covered, because the reader reads the description.

Hovering is not covered. The virtual screen reader has no pointer, so whether the
tooltip stays open while the pointer moves onto it needs a person or a browser test.

## Results on 2026-09-09

Two tests fail, and both report the same thing. The trigger is a button with an icon and
no text or `aria-label`. While the tooltip is open, `aria-describedby` gives it the text
`Add to library`, and the reader announces `button, Add to library`. Once Escape closes
the tooltip, the reader announces `button` alone. axe reports `button-name` on the
trigger, at critical impact.

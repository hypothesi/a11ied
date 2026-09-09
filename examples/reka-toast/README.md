# Reka UI toast

A test suite for the toast demo on
[reka-ui.com](https://reka-ui.com/docs/components/toast). The closest ARIA Authoring
Practices Guide (APG) pattern is Alert, which is a live region and nothing more, so the
tests check the WCAG 2.2 criteria a toast serves: 4.1.3 Status Messages, 2.1.1 Keyboard,
and 2.4.3 Focus Order.

The suite runs against the live site, so it needs the network. It uses the built
`a11ied` package, so run `npm run build` first.

```sh
npm run build
npm run test:examples
```

## Files

- `toast.test.ts` reads the demo with the virtual screen reader through the `sr` fixture
  from `a11ied/vitest`. A comment above each test gives the WCAG criterion it covers.
- `toast.cli.test.ts` runs `a1 axe` against the open toast, `a1 tree` to look for the
  announcement, and `a1 sr batch` with the script below. The toast is not on the page
  until its button is pressed, so the page commands pass `--click` for the trigger.
- `toast.batch.jsonl` presses the trigger, moves to the toast with F8 and Tab, reaches
  its Undo button, and closes it with Escape.
- `../lib/run-a1.ts` and `../lib/a1-results.ts` spawn `a1` and read its results.

## What the tests check

| Test                                                  | WCAG criterion                     |
| ----------------------------------------------------- | ---------------------------------- |
| Pressing the trigger announces the toast              | 4.1.3 Status Messages              |
| The toast does not take keyboard focus                | 2.4.3 Focus Order                  |
| The toast stays until the user dismisses it           | 2.2.1 Timing Adjustable            |
| F8 moves focus to the notifications, Tab to the toast | 2.1.1 Keyboard, 2.4.3 Focus Order  |
| Tab reaches the Undo button inside the toast          | 2.1.1 Keyboard                     |
| Escape closes the toast                               | 2.1.1 Keyboard                     |
| The tree exposes the announcement as an alert         | 4.1.3 Status Messages              |
| axe finds no A or AA violation in the open toast      | Every criterion axe maps a rule to |

The toast mounts a moment after the press, and the F8 hotkey and Escape act on the toasts
present at the time, so the tests wait half a second after pressing the trigger.

## Results on 2026-09-09

Five tests fail, and three report the same thing. The demo announces a toast through a
visually hidden element with `role="alert"` and `aria-live="assertive"`, and that element
also has `aria-hidden="true"`. Assistive technology ignores it, so the reader hears nothing
when the toast appears, the accessibility tree has no alert, and axe reports
`aria-hidden-focus` on it. axe also reports `color-contrast` on the toast's action.

The fifth failure stands alone. The toast removes itself after five seconds, which the APG
alert pattern says to avoid: an alert that disappears on its own can be missed.

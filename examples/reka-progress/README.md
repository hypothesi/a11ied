# Reka UI progress

A test suite for the progress demo on
[reka-ui.com](https://reka-ui.com/docs/components/progress). The ARIA Authoring Practices
Guide (APG) has no progress bar example, so the tests check the WCAG 2.2 criteria a
progress bar serves: 4.1.2 Name, Role, Value and 1.3.1 Info and Relationships.

The suite runs against the live site, so it needs the network. It uses the built
`a11ied` package, so run `npm run build` first.

```sh
npm run build
npm run test:examples
```

## Files

- `progress.test.ts` reads the demo with the virtual screen reader through the `sr`
  fixture from `a11ied/vitest`. A comment above each test gives the WCAG criterion it
  covers.
- `progress.cli.test.ts` runs `a1 axe` against the bar, `a1 tree` to read its name, and
  `a1 sr batch` with the script below.
- `progress.batch.jsonl` reads the bar, waits three seconds, and reads it again.
- `../lib/run-a1.ts` and `../lib/a1-results.ts` spawn `a1` and read its results.

## What the tests check

| Test                                               | WCAG criterion                     |
| -------------------------------------------------- | ---------------------------------- |
| Announces its role, name, range, and current value | 4.1.2 Name, Role, Value            |
| Is named by its percentage                         | 1.3.1 Info and Relationships       |
| Reports a higher value after it advances           | 4.1.2 Name, Role, Value            |
| axe finds no A or AA violation on the bar          | Every criterion axe maps a rule to |

The demo advances the bar on its own, from 10% in steps of 30. The bar re-renders as its
value moves, so the reader loses its place and the tests find the bar again from the top
of the page before reading it a second time.

## Results on 2026-09-09

Every test passes. The reader announces
`progressbar, 10%, max value 100, min value 0, current value 10%`, and a later reading
gives a higher value.

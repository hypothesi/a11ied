# Reka UI tags input

A test suite for the tags input demo on
[reka-ui.com](https://reka-ui.com/docs/components/tags-input). The ARIA Authoring
Practices Guide (APG) has no tags input pattern, so the tests check the WCAG 2.2 criteria
the widget serves: 4.1.2 Name, Role, Value, 1.3.1 Info and Relationships, 2.1.1 Keyboard,
and 4.1.3 Status Messages. The demo starts with two tags, Apple and Banana, and a text
field after them.

The suite runs against the live site, so it needs the network. It uses the built
`a11ied` package, so run `npm run build` first.

```sh
npm run build
npm run test:examples
```

## Files

- `tags-input.test.ts` reads the demo with the virtual screen reader through the `sr`
  fixture from `a11ied/vitest`. A comment above each test gives the WCAG criterion it
  covers.
- `tags-input.cli.test.ts` runs `a1 axe` against the widget, `a1 tree` for the field's
  name, and `a1 sr batch` with the script below.
- `tags-input.batch.jsonl` types a value, adds it with Enter, marks it as current with Left
  Arrow, and removes it with Delete.
- `../lib/run-a1.ts` and `../lib/a1-results.ts` spawn `a1` and read its results.

## What the tests check

| Test                                                           | WCAG criterion                                     |
| -------------------------------------------------------------- | -------------------------------------------------- |
| The text field is named                                        | 4.1.2 Name, Role, Value, 3.3.2 Labels              |
| Each tag is read with its text and its state                   | 1.3.1 Info and Relationships                       |
| The button on each tag says that it removes the tag            | 4.1.2 Name, Role, Value, 2.4.6 Headings and Labels |
| Typing a value and pressing Enter adds a tag                   | 2.1.1 Keyboard                                     |
| Adding a tag is announced                                      | 4.1.3 Status Messages                              |
| Left Arrow marks the last tag as current and Delete removes it | 2.1.1 Keyboard                                     |
| Backspace marks the last tag as current, then removes it       | 2.1.1 Keyboard                                     |
| axe finds no A or AA violation in the widget                   | Every criterion axe maps a rule to                 |

## Results on 2026-09-09

Three tests fail. The button on each tag is named by the tag's text alone, so the reader
announces `button, Apple` with no word for what the button does. Adding a tag changes
nothing the reader announces, so a person who cannot see the tag appear gets no
confirmation. axe reports `color-contrast` on the tag text and the field.

The field is named by its placeholder, `Fruits...`, which the reader announces. A visible
label would serve criterion 3.3.2 better, but the name is there.

# Reka UI dropdown menu

A test suite for the dropdown menu demo on
[reka-ui.com](https://reka-ui.com/docs/components/dropdown-menu). It checks the demo
against the ARIA Authoring Practices Guide (APG) actions menu button example, which
`a1 pattern menu-button-actions` prints, and against the WCAG 2.2 A and AA rules axe
automates.

The suite runs against the live site, so it needs the network. It uses the built
`a11ied` package, so run `npm run build` first.

```sh
npm run build
npm run test:examples
```

## Files

- `dropdown-menu.test.ts` reads the demo with the virtual screen reader through the `sr`
  fixture from `a11ied/vitest`. A comment above each test gives the APG row it covers
  and the WCAG criterion behind that row.
- `dropdown-menu.cli.test.ts` runs the `a1` binary. The APG example has two keyboard
  tables. The button table is checked on the page as it loads. The menu table is checked
  after `--click` opens the menu and `--setup ArrowDown` moves focus to the first item.
- `dropdown-menu.batch.jsonl` opens the menu, moves through it with the arrow keys, Home,
  End, and a letter, closes it with Escape, and opens a submenu with Enter.
- `../lib/run-a1.ts` and `../lib/a1-results.ts` spawn `a1` and read its results.

## What the tests check

| Test                                                        | APG row                                      | WCAG criterion                     |
| ----------------------------------------------------------- | -------------------------------------------- | ---------------------------------- |
| The button says it has a popup menu                         | `menu-button-aria-haspopup`, `aria-expanded` | 4.1.2 Name, Role, Value            |
| Enter and Down Arrow open the menu on the first item        | `menu-button-key-open`                       | 2.1.1 Keyboard, 2.4.3 Focus Order  |
| Space opens the menu on the first item                      | `menu-button-key-open`                       | 2.1.1 Keyboard, 2.4.3 Focus Order  |
| The items are inside a menu named by the button             | `menu-role`, `menu-aria-labelledby`          | 4.1.2 Name, Role, Value            |
| The rest of the page is hidden while the menu is open       |                                              | 2.4.3 Focus Order                  |
| Right Arrow opens a submenu and Left Arrow closes it        | Menu and Menubar pattern                     | 2.1.1 Keyboard                     |
| Enter activates an item, closes the menu, and returns focus | Menu and Menubar pattern                     | 2.1.1 Keyboard, 2.4.3 Focus Order  |
| Tab moves focus out of the menu and closes it               | Menu and Menubar pattern                     | 2.1.1 Keyboard                     |
| Down Arrow and Up Arrow move between items                  | `menu-key-down-arrow`, `menu-key-up-arrow`   | 2.1.1 Keyboard                     |
| End and Home move to the last and first items               | `menu-key-end`, `menu-key-home`              | 2.1.1 Keyboard                     |
| A letter moves to the next item that starts with it         | `menu-key-character`                         | 2.1.1 Keyboard                     |
| Checkbox and radio items say whether they are checked       |                                              | 4.1.2 Name, Role, Value            |
| Escape closes the menu and returns focus                    | `menu-key-escape`                            | 2.1.1 Keyboard, 2.4.3 Focus Order  |
| Enter on an item with a submenu opens the submenu           | `menu-key-enter`                             | 2.1.1 Keyboard                     |
| axe finds no A or AA violation on the button or in the menu |                                              | Every criterion axe maps a rule to |

## Results on 2026-09-09

One test fails. The Menu and Menubar pattern says Tab moves focus out of an open menu and
closes it. The demo keeps focus on the current item when Tab is pressed, so a keyboard
user leaves the menu with Escape alone.

A scan taken while the menu is still animating open reports `color-contrast` on the
checkbox and radio items, so the CLI lets a clicked widget settle before it scans.

Two rows of the button table need a judgment, and the triage test records both. Up Arrow
does nothing on the button, which the pattern lists as optional. `aria-controls` is set
only while the menu is open, which is the only time the menu is on the page.

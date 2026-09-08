# Test fixtures

Pages the CLI and API tests run against. `createTestServer()` in
`src/testing/fixtures.ts` serves this directory, and `readFixture(name)` reads one file
for `screenReader({ html })`.

Two ways to load a fixture, and the difference matters:

- `screenReader({ url })` and `a1 sr start <url>` render through headless Chromium, which
  runs page scripts and reads the tree a real browser builds. Every fixture below is tested
  this way, the static ones included.
- `screenReader({ html })` renders through jsdom, which does **not** run page scripts. It
  needs no browser and finishes in milliseconds. One case in
  `src/vitest/screen-reader-structure.test.ts` reads `heading-outline.html` both ways and
  compares the phrases, so a difference between the engines fails a test.

## Static pages

| File                       | What it is for                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basic-page.html`          | Headings, a landmark, and an iframe.                                                                                                                                                                                                                                                                                                                                 |
| `structure.html`           | One of every structural element: headings, links, landmarks, a table with headers, a list, a form.                                                                                                                                                                                                                                                                   |
| `auth-login.html`          | A labeled sign-in form.                                                                                                                                                                                                                                                                                                                                              |
| `button-name-failure.html` | One button with no accessible name.                                                                                                                                                                                                                                                                                                                                  |
| `contrast-failure.html`    | Text that fails contrast at AA.                                                                                                                                                                                                                                                                                                                                      |
| `focus-obscured.html`      | An overlay that covers part of a focused button.                                                                                                                                                                                                                                                                                                                     |
| `heading-outline.html`     | An outline that skips from `h1` to `h3`, an empty heading, and a second `h1`. Fails `heading-order` and `empty-heading`, both of which axe only runs when you name them.                                                                                                                                                                                             |
| `landmark-maze.html`       | Two `main` elements, two unlabeled `nav` elements, a named and an unnamed `section`, and a paragraph outside every landmark. Fails `landmark-no-duplicate-main`, `landmark-unique`, and `region`.                                                                                                                                                                    |
| `aria-widgets.html`        | Each widget twice, once broken and once correct: an icon-only button, a `div` with `role="button"` and no `tabindex`, a `role="checkbox"` with no `aria-checked`, a toggle whose `aria-pressed` never changes, tabs with no `aria-selected`, and an `aria-labelledby` pointing at an id that does not exist. Fails `button-name`, `aria-required-attr`, and `label`. |
| `form-errors.html`         | A field labeled only by a placeholder, an unlabeled `select`, radios with no legend, error text that is not linked to a field, and one field with `aria-describedby` and `aria-invalid` done right. Fails `select-name`. axe's `label` rule **passes** the placeholder-only field, which is the point of it.                                                         |

## Pages that need their scripts

| File                   | What it is for                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dialog.html`          | A dialog that moves focus in, returns it on close, and closes on Escape.                                                                                                                                                                                                                                |
| `status-message.html`  | A form that writes its confirmation to a `role="status"` region.                                                                                                                                                                                                                                        |
| `live-regions.html`    | The same message written three ways: to `role="status"` after a 250 ms delay, to `role="alert"` during the click, and to a `div` with no role. Only the third announces nothing, and the timing difference decides whether `sr wait --for` or `sr expect --since` is the right check.                   |
| `modal-untrapped.html` | Two dialogs from one page. The first is a `div` with `role="dialog"` that opens without moving focus and has no accessible name. The second is a native `dialog` opened with `showModal()`. Loading it with `#rename` opens the first one, so a scan can reach markup that is otherwise never rendered. |

## The console app

`app/console.html` is a small client-side-routed support console, the fixture the end to
end tests drive. `app/console.js` has its routing and `app/app.css` its styling.

Routing happens inside the page, so `activate` on a link changes the view without tearing
down the browsing context. Activating something that triggers a real navigation instead
rejects with `Execution context was destroyed`.

Sign in with `dana@northwind.test` and `correct horse`. Every other password is refused.

Views and what each one is built to show:

- `#/signin`: a rejected password writes to a plain paragraph, so the reader announces
  nothing and the visitor hears no reason for the refusal.
- `#/queue`: a search form, a priority filter, and a ticket table. Applying a filter
  rewrites the result count in a plain paragraph, which announces nothing.
- `#/ticket/:id`: a reply form whose confirmation goes to a `role="status"` region, which
  does announce, and an escalate dialog that opens without moving focus into it.
- `#/settings`: a profile form that moves focus to the field it rejected, links the error
  with `aria-describedby`, and sets `aria-invalid`. This one is correct throughout.

A signed-out visitor asking for any view lands on `#/signin`.

Loading the page as `console.html?announce=on` turns on the route announcement the default
build leaves out: focus moves to the new view's heading and a `role="status"` region names
it. Tests assert both settings against each other.

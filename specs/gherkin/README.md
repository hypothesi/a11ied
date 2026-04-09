# a11ied gherkin acceptance suite

This directory is the executable acceptance contract for the planned `v0.3.0` milestone.

The feature files are grouped by product layer:

- `01-wcag-data-sync.feature`
- `02-wcag-engine-query.feature`
- `03-wcag-applicability.feature`
- `04-cli-wcag.feature`
- `05-cli-inspect.feature`
- `06-cli-drive.feature`
- `07-cli-run-axe.feature`
- `08-cli-run-patterns.feature`
- `09-cli-verify.feature`
- `10-storybook-integration.feature`
- `11-mcp.feature`
- `12-docs-and-release.feature`

## Shared fixture assumptions

These feature files assume the acceptance harness provides a deterministic local fixture site and Storybook instance.

### Fixture pages

- `basic-page.html`: headings, landmarks, and plain content with no form, dialog, auth, or live-region signals
- `button-name-failure.html`: a native interactive control with no accessible name, designed to fail criterion `4.1.2`
- `status-message.html`: a form with a `role="status"` region that announces a success message without moving focus, designed to pass criterion `4.1.3`
- `dialog.html`: a modal `role="dialog"` flow with focus entry, focus containment, and close behavior
- `auth-login.html`: a login flow with authentication signals and repeated-entry pressure, designed so criterion `3.3.8` still requires manual review in `v0.3.0`
- `focus-order.html`: a page where tab order is intentionally correct
- `focus-obscured.html`: a page where fixed chrome can obscure focused elements
- `contrast-failure.html`: a page that fails color-contrast checks

### Storybook stories

- `layout-landmarks--default`
- `forms-login--default`
- `dialogs-confirm-delete--default`
- `status-updates--default`

## Shared output assumptions

CLI JSON output uses this envelope:

```json
{
   "ok": true,
   "command": {},
   "target": null,
   "result": {},
   "warnings": [],
   "errors": [],
   "meta": {}
}
```

CLI exit codes:

- `0`: success
- `2`: usage or validation error
- `3`: environment or dependency error
- `4`: assertion or verification failure
- `5`: internal runtime error

## Suggested tags

- `@foundation`
- `@engine`
- `@cli`
- `@drive`
- `@axe`
- `@pattern`
- `@verify`
- `@storybook`
- `@mcp`
- `@docs`
- `@release`
- `@virtual`
- `@manual-release`

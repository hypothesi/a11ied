# Accessibility audit: Northwind team settings (a11ied practice page)

* Target: https://hypothesi.github.io/a11ied/demo/team/
* Standard: WCAG 2.2 Level AA (55 success criteria in scope)
* Scope: 1 page or state of https://hypothesi.github.io/a11ied/demo/team/
* Report date: 2026-11-24
* Status: Final

## Summary

Northwind team settings (a11ied practice page) does not meet WCAG 2.2 Level AA. 10 success criteria fail, described in 14 findings.

| Findings | Critical | Serious | Moderate | Minor |
| --- | --- | --- | --- | --- |
| 14 | 2 | 5 | 6 | 1 |

| Criteria | Fail | Pass | Not applicable | Not verified or unfinished |
| --- | --- | --- | --- | --- |
| 55 | 10 | 20 | 18 | 7 |

## What to fix first

| ID | Issue | Severity | WCAG | Affected |
| --- | --- | --- | --- | --- |
| F1 | Remove buttons have no accessible name | Critical | 4.1.2 Name, Role, Value | 1 |
| F4 | Member avatars have no text alternative | Critical | 1.1.1 Non-text Content | 1 |
| F2 | Last-active dates and the Pending status have too little contrast | Serious | 1.4.3 Contrast (Minimum) | 1 |
| F7 | Invitation sent confirmation is not announced | Serious | 4.1.3 Status Messages | 1 |
| F10 | Dialog buttons are cut off in a short viewport and cannot be scrolled into view | Serious | 1.4.10 Reflow | 1 |
| F13 | Status filter chips cannot be reached or operated with the keyboard | Serious | 2.1.1 Keyboard | 1 |
| F14 | Modal dialog does not take keyboard focus when it opens and does not keep it | Serious | 2.4.3 Focus Order, also 2.4.11 | 1 |
| F5 | Filter buttons do not expose which filter is selected | Moderate | 4.1.2 Name, Role, Value | 1 |
| F6 | Invite member dialog has no accessible name | Moderate | 4.1.2 Name, Role, Value | 1 |
| F8 | Text field borders have too little contrast | Moderate | 1.4.11 Non-text Contrast | 1 |
| F9 | Navigation is cut off at 320 pixels wide | Moderate | 1.4.10 Reflow | 1 |
| F11 | Search field is labelled only by placeholder text | Moderate | 3.3.2 Labels or Instructions | 1 |
| F15 | Focus is lost when the dialog closes | Moderate | 2.4.3 Focus Order | 1 |
| F12 | Required field is not marked as required | Minor | 3.3.2 Labels or Instructions | 1 |

## Findings

### F1: Remove buttons have no accessible name

Critical | [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value) (Level A) | Found by automated scan

**Problem:** Each row of the members table ends with a button that holds only a trash-can icon. The button has no text, no aria-label, and no title, so its accessible name is empty. Detected by the axe-core rule button-name and confirmed in the accessibility tree.

**Impact:** A screen reader announces each of the three buttons as "button" and nothing else. A screen reader user cannot tell that the button removes a member, or which member. Voice control users have no name to speak.

**Fix:** Give each button a name that says what it does and to whom, for example aria-label="Remove Dana Whitfield". Add aria-hidden="true" to the SVG icon inside it.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: tr[data-status="active"][data-member-row=""]:nth-child(1) > td:nth-child(5) > .icon-button[type="button"], tr[data-status="active"][data-member-row=""]:nth-child(2) > td:nth-child(5) > .icon-button[type="button"], tr[data-status="pending"] > td:nth-child(5) > .icon-button[type="button"] (3 elements) Evidence: evidence/scan/P1/4.1.2-axe-button-name-button.png

### F4: Member avatars have no text alternative

Critical | [1.1.1 Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content) (Level A) | Found by automated scan

**Problem:** The three avatar images in the members table have no alt attribute. Detected by the axe-core rule image-alt and confirmed in the accessibility tree.

**Impact:** Without an alt attribute a screen reader may announce the image by its file name. Screen reader users hear noise before each member's name.

**Fix:** The member's name is already in the same cell, so the avatar is decoration. Add alt="" to each image so screen readers skip it.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: tr[data-status="active"][data-member-row=""]:nth-child(1) > td:nth-child(1) > .member > img, tr[data-status="active"][data-member-row=""]:nth-child(2) > td:nth-child(1) > .member > img, tr[data-status="pending"] > td:nth-child(1) > .member > img (3 elements) Evidence: evidence/scan/P1/1.1.1-axe-image-alt-img.png

### F2: Last-active dates and the Pending status have too little contrast

Serious | [1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) (Level AA) | Found by automated scan

**Problem:** The three last-active dates are #a2aab5 on white, which measures 2.35:1. The Pending status pill measures 2.17:1 on its own background. Both are normal-size text, which needs 4.5:1. Detected by the axe-core rule color-contrast and confirmed by measurement.

**Impact:** People with low vision, and anyone reading on a dim or sunlit screen, struggle to read when a member was last active and which members are pending.

**Fix:** Use text colors that reach at least 4.5:1 against their backgrounds. For example #414b59 on white for the dates, and a darker text color on the Pending pill.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: tr[data-status="active"][data-member-row=""]:nth-child(1) > .faint, tr[data-status="active"][data-member-row=""]:nth-child(2) > .faint, tr[data-status="pending"] > .faint (3 elements) Evidence: evidence/scan/P1/1.4.3-axe-color-contrast-td.png
* https://hypothesi.github.io/a11ied/demo/team/: .pill--pending (1 element) Evidence: evidence/scan/P1/1.4.3-axe-color-contrast-span.png

### F7: Invitation sent confirmation is not announced

Serious | [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages) (Level AA) | Found by an auditing agent

**Problem:** Submitting the invite form with sam@northwind.test closes the dialog and inserts <p class="banner">Invitation sent to sam@northwind.test.</p> above the Members card. The paragraph has no role="status" or aria-live, none of its ancestors is a live region, and the page contains no live region in any state. Chrome exposes it as a plain paragraph. Focus is not moved to it: after submit document.activeElement was the body.

**Impact:** Screen reader users get no confirmation that the invitation was sent. The dialog disappears and nothing is spoken, so they cannot tell success from failure without searching the page for new text.

**Fix:** Keep an empty container with role="status" in the page from load (the existing [data-banner-slot] div is in the right place) and write the message into it as text, instead of inserting a new paragraph with no role.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Banner above the Members card (p.banner inside div[data-banner-slot]) (Reached by: Invite member > type sam@northwind.test in Email address > Send invitation. The live region must exist before the text is added, or some screen readers will not announce it.) Evidence: evidence/P1.semantics/invite-sent-banner.png

### F10: Dialog buttons are cut off in a short viewport and cannot be scrolled into view

Serious | [1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow) (Level AA) | Found by an auditing agent

**Problem:** The invite dialog is 295px tall and sits 24px from the top of a fixed backdrop that has no overflow scrolling. When the viewport is shorter than about 343 CSS pixels the bottom of the dialog is cut off. At 1280x1024 with 400 percent zoom (320x256 CSS pixels) the Cancel and Send invitation buttons sit at y=253 to 294, below the 256px viewport. Scrolling with the mouse wheel, moving focus to the button, and calling scrollIntoView all left them at the same position.

**Impact:** People who zoom to 400 percent on a 1280x1024 display cannot see or click Cancel or Send invitation. A mouse or touch user cannot close the dialog or send the invitation without zooming back out.

**Fix:** Make the dialog scroll when it is taller than the viewport: add overflow-y: auto to .backdrop (it is position: fixed; inset: 0), or give .modal max-height: 100% with overflow-y: auto.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Invite member dialog > Cancel and Send invitation (.modal-actions button) (Tested at 320x256 (the 400 percent equivalent of 1280x1024) and with real 400 percent zoom at 1280x1024. .backdrop computed overflow-y: visible, scrollHeight 319 against clientHeight 256. The dialog fits fully at 320x344 and taller, and at 200 percent zoom in a 1280x900 window. The form can still be submitted with Enter in the email field.) Evidence: evidence/P1.visual/dialog-1280x1024-zoom400.png, evidence/P1.visual/dialog-320x256.png

### F13: Status filter chips cannot be reached or operated with the keyboard

Serious | [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard) (Level A) | Found by an auditing agent

**Problem:** The All, Active, and Pending chips in the Members toolbar are div elements with role="button" and no tabindex. Tab moves from the Filter members field straight to Invite member, and Shift+Tab does the same in reverse, so the chips never receive focus. The APG button check on the Active chip reported no effect for Enter and for Space. A mouse click on Pending reduced the table from 3 rows to 1, and a click on Active to 2, so the function exists for pointer users only.

**Impact:** People who use a keyboard, switch device, or voice control that relies on focusable controls cannot filter the member list by status. Screen reader users hear three buttons they cannot activate with Enter or Space.

**Fix:** Change each chip from <div class="chip" role="button"> to <button type="button" class="chip">, which adds the tab stop and Enter and Space activation, and set aria-pressed="true" on the selected chip and "false" on the others. If the div must stay, add tabindex="0" and a keydown handler that runs the same filter on Enter and Space.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Members toolbar > All, Active, Pending (div.chip[role="button"] inside [data-chips]) (Tab order observed: General, Billing, Team, Filter members, Invite member, three remove buttons, three footer links. Typing in the text filter still narrows the list from the keyboard, but that is a different control.) Evidence: evidence/P1.keyboard/tab-04.png, evidence/P1.keyboard/tab-05.png, evidence/P1.keyboard/chip-pending-mouse.png, evidence/P1.keyboard/finding-1.png

### F14: Modal dialog does not take keyboard focus when it opens and does not keep it

Serious | [2.4.3 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order) (Level A) | Found by an auditing agent

Also fails: 2.4.11 Focus Not Obscured (Minimum)

**Problem:** Pressing Enter or Space on Invite member shows the dialog (role="dialog", aria-modal="true") but focus stays on the Invite member button behind the backdrop. The next three Tab presses land on the three remove buttons in the table behind the dialog; the Email address field is the fourth. After Send invitation, Tab continues to the footer links and then the top navigation while the dialog is still open. Opening the page with #invite shows the dialog with nothing focused, and Tab starts at the General nav link. At a 320x640 viewport the dialog covers the Invite member button (152,383, 127x41) and the Filter members field (41,285, 176x39) completely, so the focus ring on either cannot be seen.

**Impact:** Keyboard users have to tab through hidden-looking background controls to reach the form, and can activate controls the dialog is meant to block. Screen reader users are not told a dialog opened because focus never enters it. On a narrow screen or at high zoom, sighted keyboard users lose track of focus entirely while it is behind the dialog.

**Fix:** Use a native <dialog> element opened with showModal(), which moves focus inside, makes the rest of the page inert, and closes on Escape. If the div stays, call focus() on #invite-email when the dialog opens, set the inert attribute on header, main, and footer while it is open, and remove it on close.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Invite member dialog (div.modal[role="dialog"][data-invite-dialog]), opened from Members toolbar > Invite member (button[data-open-invite]) (Tab order with the dialog open at 1280x900: Invite member (behind backdrop), remove, remove, remove, Email address, Role, Cancel, Send invitation, a11ied, practice on a broken page, the fixed version, browser, General, Billing, Team. The capture tool reported "covered by another element: yes" for every background stop. Escape does not close the dialog (APG modal dialog check: NO EFFECT); Cancel does.) Evidence: evidence/P1.keyboard/dialog-open-enter.png, evidence/P1.keyboard/dialog-tab-01.png, evidence/P1.keyboard/narrow-dialog-focus-on-trigger.png, evidence/P1.keyboard/narrow-dialog-focus-on-filter.png, evidence/P1.keyboard/finding-2.png

### F5: Filter buttons do not expose which filter is selected

Moderate | [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value) (Level A) | Found by an auditing agent

**Problem:** The All, Active, and Pending filters are div elements with role="button". The selected one is shown only by a dark fill (background rgb(22, 32, 46) against white for the others). Chrome's accessibility tree exposes each as a button with a name and no pressed, selected, or current state, on load and after clicking Active. Clicking Active hid the Priya Raman row and moved the dark fill, and no attribute on any of the three changed.

**Impact:** Screen reader users cannot tell which filter is applied or that activating a filter changed anything. They have to read the Status column of every remaining row to work out what the table is showing.

**Fix:** Make each filter a native <button type="button"> with aria-pressed="true" on the selected one and aria-pressed="false" on the others, and update the attribute in the same click handler that moves the chip--on class.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Members toolbar > All, Active, Pending (div.chip[role="button"]) (Attributes on all three in both states: role="button", no tabindex, no aria-pressed, no aria-current. Chrome also reports none of them as focusable; keyboard access belongs to the keyboard pass. The table caption stays "3 members in this workspace" while rows are filtered out, and no result count is shown or announced.) Evidence: evidence/P1.semantics/finding-1.png

### F6: Invite member dialog has no accessible name

Moderate | [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value) (Level A) | Found by an auditing agent

**Problem:** The dialog opened by the Invite member button has role="dialog" and aria-modal="true" and no aria-labelledby or aria-label. Chrome's accessibility tree reports role dialog, modal true, name "". The visible heading "Invite member" (h2 id="invite-title") is inside it and is not referenced.

**Impact:** A screen reader announces an unnamed dialog, so users entering it are not told what it is for. Lists of dialogs and landmarks show it without a title.

**Fix:** Add aria-labelledby="invite-title" to the element with role="dialog".

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Invite member dialog (div.modal[role="dialog"]) (When the dialog opened, document.activeElement was still the Invite member button behind the backdrop, and the main element was neither inert nor aria-hidden. Focus handling belongs to the keyboard pass. The same unnamed dialog appears when the page is loaded with #invite.) Evidence: evidence/P1.semantics/finding-2.png

### F8: Text field borders have too little contrast

Moderate | [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast) (Level AA) | Found by an auditing agent

**Problem:** The search field, the email field, and the role select are white boxes on a white surface, outlined only by a 1px border of rgb(183, 190, 201) (#b7bec9). That border measures 1.87:1 against #ffffff; 3:1 is required. The email field is empty when the dialog opens, so the border is the only thing that shows where the field is.

**Impact:** People with low vision or reduced contrast sensitivity cannot see where the fields are or how large they are. In the invite dialog the empty email field can look like blank space under its label.

**Fix:** Change the border color in the rule for input[type="search"], input[type="email"], select from rgb(183, 190, 201) to a color with at least 3:1 against white, for example #6b7584 (4.66:1). #8792a2 is about the lightest that passes (3.15:1).

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Members > Filter members (input#member-filter); Invite member dialog > Email address (input#invite-email) and Role (select#invite-role) (Measured from computed styles: border-color rgb(183, 190, 201), border-width 1px, field background #ffffff, surrounding card and dialog background #ffffff. The Cancel button uses the same border color but is identified by its text label (16.4:1), and the select also shows its value and the browser's arrow.) Evidence: evidence/P1.visual/dialog-fields.png, evidence/P1.visual/finding-1.png

### F9: Navigation is cut off at 320 pixels wide

Moderate | [1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow) (Level AA) | Found by an auditing agent

**Problem:** At a 320 CSS pixel viewport the header does not wrap. The navigation spans x=132 to x=342, so the current-page link 'Team' (x=282 to 342, its text ending near x=330) crosses the right edge of the viewport and the last letters are hidden until the page is scrolled sideways. The members table is 543px wide and is not inside a scrolling container, so it spills out of its card and makes the whole page 568px wide (248px of horizontal scrolling). The table is exempt as a data table; the navigation is not.

**Impact:** People who zoom to 400 percent, or use a narrow window, must scroll in two directions to read the navigation, and the whole page slides sideways while they read.

**Fix:** Let the header reflow: add flex-wrap: wrap to .topbar (and to .topbar nav), or reduce the 24px gap and 12px link padding at narrow widths, so all three links fit in 320px. Put the table in a wrapper with overflow-x: auto so only the table scrolls sideways and the rest of the page stays within the viewport.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Header > Workspace settings navigation (.topbar nav), link 'Team' (.topbar nav a[aria-current="page"]) (Viewport 320x800, 100 percent zoom. document.scrollWidth 568. .topbar scrollWidth 342 against clientWidth 320. table left 25, right 568; .card right 296. With the 1.4.12 text spacing values applied at this width the 'Team' link starts at x=326, fully outside the viewport.) Evidence: evidence/P1.visual/reflow-320.png, evidence/P1.visual/finding-2.png

### F11: Search field is labelled only by placeholder text

Moderate | [3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions) (Level A) | Found by an auditing agent

**Problem:** The member filter has no visible label. Its only prompt is the placeholder 'Filter members', which disappears as soon as a character is typed. With 'dana' entered, nothing on screen says what the field is for. The input also has no label element, aria-label, or aria-labelledby; the simulated screen reader announced it as 'searchbox, placeholder Filter members'.

**Impact:** People with memory or attention difficulties, and people using screen magnification, lose the prompt once they start typing and cannot check what the field does. People using speech input have no persistent visible name to say.

**Fix:** Add a visible label tied to the field, for example <label for="member-filter">Filter members</label> above the input, as the dialog fields already do with .field label. Keep or drop the placeholder; it must not be the only label.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Members > Filter members (input#member-filter) (Markup: <input id="member-filter" type="search" placeholder="Filter members">. Chrome's accessibility tree falls back to the placeholder for the name ('searchbox "Filter members"').) Evidence: evidence/P1.forms/filter-typed.png, evidence/P1.forms/finding-1.png

### F15: Focus is lost when the dialog closes

Moderate | [2.4.3 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order) (Level A) | Found by an auditing agent

**Problem:** Activating Cancel with Enter or Space closes the invite dialog and leaves nothing focused. The next Tab lands on the first footer link, "a11ied", not on the Invite member button that opened the dialog. Submitting the form with a valid address behaves the same way: the dialog closes, the "Invitation sent" banner appears, nothing is focused, and the next Tab goes to the footer link.

**Impact:** Keyboard users are moved past the member table to the footer and must tab backward to continue. Screen reader users are left at an undefined position with no announcement of where they are after cancelling or sending.

**Fix:** When the dialog closes, call focus() on the Invite member button (button[data-open-invite]). A native <dialog> opened with showModal() restores focus to the opener on close without extra code.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Invite member dialog > Cancel (button[data-cancel-invite]) and Send invitation (button[type="submit"]) (Sequence: Tab x5, Enter, Tab x6, Enter gives "nothing focused"; one more Tab focuses the footer link "a11ied". Submitting sam@northwind.test with Enter gave the same result.) Evidence: evidence/P1.keyboard/dialog-after-cancel.png, evidence/P1.keyboard/dialog-after-cancel-tab.png, evidence/P1.keyboard/dialog-after-submit.png, evidence/P1.keyboard/finding-3.png

### F12: Required field is not marked as required

Minor | [3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions) (Level A) | Found by an auditing agent

**Problem:** Email address in the invite dialog has the required attribute, and the form will not submit without it, but nothing visible says so: the label reads only 'Email address', with no 'required' text or symbol and no instruction in the dialog. A screen reader is told (the simulated reader announced 'textbox, Email address, required'); sighted users are not.

**Impact:** Sighted users, in particular people with cognitive disabilities, learn that the field is required only after a failed submit.

**Fix:** State the requirement in the label, for example 'Email address (required)', or add a visible asterisk with a line in the dialog explaining it. Keep the required attribute.

**Where:**

* https://hypothesi.github.io/a11ied/demo/team/: Invite member dialog > Email address (label[for="invite-email"], input#invite-email) (Markup: <label for="invite-email">Email address</label> <input id="invite-email" name="email" type="email" required autocomplete="email">. The Role select is not required and has a default value.) Evidence: evidence/P1.forms/finding-2.png

## Results by success criterion

| Criterion | Level | Result | Findings |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | Fails | F4 |
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | Not applicable |  |
| 1.2.2 Captions (Prerecorded) | A | Not applicable |  |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | A | Not applicable |  |
| 1.2.4 Captions (Live) | AA | Not applicable |  |
| 1.2.5 Audio Description (Prerecorded) | AA | Not applicable |  |
| 1.3.1 Info and Relationships | A | Passes |  |
| 1.3.2 Meaningful Sequence | A | Passes |  |
| 1.3.3 Sensory Characteristics | A | Passes |  |
| 1.3.4 Orientation | AA | Passes |  |
| 1.3.5 Identify Input Purpose | AA | Not applicable |  |
| 1.4.1 Use of Color | A | Passes |  |
| 1.4.2 Audio Control | A | Not applicable |  |
| 1.4.3 Contrast (Minimum) | AA | Fails | F2 |
| 1.4.4 Resize Text | AA | Passes |  |
| 1.4.5 Images of Text | AA | Passes |  |
| 1.4.10 Reflow | AA | Fails | F10, F9 |
| 1.4.11 Non-text Contrast | AA | Fails | F8 |
| 1.4.12 Text Spacing | AA | Passes |  |
| 1.4.13 Content on Hover or Focus | AA | Not applicable |  |
| 2.1.1 Keyboard | A | Fails | F13 |
| 2.1.2 No Keyboard Trap | A | Passes |  |
| 2.1.4 Character Key Shortcuts | A | Not applicable |  |
| 2.2.1 Timing Adjustable | A | Not applicable |  |
| 2.2.2 Pause, Stop, Hide | A | Not applicable |  |
| 2.3.1 Three Flashes or Below Threshold | A | Not applicable |  |
| 2.4.1 Bypass Blocks | A | Passes |  |
| 2.4.2 Page Titled | A | Passes |  |
| 2.4.3 Focus Order | A | Fails | F14, F15 |
| 2.4.4 Link Purpose (In Context) | A | Passes |  |
| 2.4.5 Multiple Ways | AA | Not evaluated |  |
| 2.4.6 Headings and Labels | AA | Passes |  |
| 2.4.7 Focus Visible | AA | Passes |  |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Fails | F14 |
| 2.5.1 Pointer Gestures | A | Not applicable |  |
| 2.5.2 Pointer Cancellation | A | Passes |  |
| 2.5.3 Label in Name | A | Passes |  |
| 2.5.4 Motion Actuation | A | Not applicable |  |
| 2.5.7 Dragging Movements | AA | Not applicable |  |
| 2.5.8 Target Size (Minimum) | AA | Passes |  |
| 3.1.1 Language of Page | A | Passes |  |
| 3.1.2 Language of Parts | AA | Not applicable |  |
| 3.2.1 On Focus | A | Passes |  |
| 3.2.2 On Input | A | Passes |  |
| 3.2.3 Consistent Navigation | AA | Not evaluated |  |
| 3.2.4 Consistent Identification | AA | Not evaluated |  |
| 3.2.6 Consistent Help | A | Not evaluated |  |
| 3.3.1 Error Identification | A | Not verified |  |
| 3.3.2 Labels or Instructions | A | Fails | F11, F12 |
| 3.3.3 Error Suggestion | AA | Not verified |  |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Not verified |  |
| 3.3.7 Redundant Entry | A | Not applicable |  |
| 3.3.8 Accessible Authentication (Minimum) | AA | Not applicable |  |
| 4.1.2 Name, Role, Value | A | Fails | F1, F5, F6 |
| 4.1.3 Status Messages | AA | Fails | F7 |

## Not verified

* 4.1.2, All pages and screens: No real screen reader was run. The keyboard, visual, and forms passes used the simulated screen reader. The semantics pass read names, roles, and states from the browser's accessibility tree. What VoiceOver or NVDA announces on this page is not verified.
* 3.3.1, https://hypothesi.github.io/a11ied/demo/team/: The page has no error text of its own and relies on the browser's built-in validation. Empty and malformed emails were blocked, focus returned to Email address, and the browser held a message for the field ('Please fill out this field.'). The browser draws that message outside the page, so the headless browser could not show it and the simulated screen reader read only 'textbox, Email address, required'. Whether a person sees and hears the error was left untested; it needs a visible browser and a real screen reader.
* 3.3.3, https://hypothesi.github.io/a11ied/demo/team/: Suggestions come only from the browser's validation message. The text read from the field does suggest a fix ('Please include an '@' in the email address. 'sam' is missing an '@'.'), but, as for 3.3.1, whether it is shown and announced could not be confirmed with a headless browser and the simulated reader.
* 3.3.4, https://hypothesi.github.io/a11ied/demo/team/: The invite form checks the email and lets the user correct it before anything is accepted. Removing a member is the other data change, but the three remove buttons did nothing when clicked, so whether removal is confirmed or can be undone could not be exercised.
* 2.4.5, Whole audit: Needs at least two pages or screens to compare; this audit covers one.
* 3.2.3, Whole audit: Needs at least two pages or screens to compare; this audit covers one.
* 3.2.4, Whole audit: Needs at least two pages or screens to compare; this audit covers one.
* 3.2.6, Whole audit: Needs at least two pages or screens to compare; this audit covers one.

## Scope and method

| ID | Page or screen | Location | States tested | Findings |
| --- | --- | --- | --- | --- |
| P1 | https://hypothesi.github.io/a11ied/demo/team/ | https://hypothesi.github.io/a11ied/demo/team/ | Filter chips: All, Active, and Pending selected in turn, Invite member dialog open, Remove member icon buttons, Invite dialog after empty and invalid submits, Invitation accepted (confirmation banner), Invite dialog cancelled and reopened, Member filter with text entered, Status filter chip selected, Remove buttons activated, Dialog opened from the #invite URL, Invite form submitted empty, Invitation sent banner, Text filter applied, Narrow viewport and 400% zoom, Page as loaded, then left idle for 30 seconds, Status and text filters applied, Row buttons (trash icon) hovered and clicked, Invite member dialog open, including the empty-submit validation message, Page as loaded, at 1280x900 and 320x800, Status filters pressed, aborted, and clicked, Row buttons (trash icon), Page as loaded, Status filter applied (All, Active, Pending), Text filter with one match and with no match, Invite form with validation errors, Invite dialog after an empty and an invalid submit, Success banner after sending an invitation, Member filter with text entered and no matching rows, Keyboard focus on each control, Pointer hover on links, chips, buttons, and the filter field | 14 |

Each page or screen was tested in passes that group related success criteria: names and structure as assistive technology receives them, keyboard operation, visual presentation, media and motion, forms, and pointer input. Checks that compare pages were run once across the whole set.

An automated scan (axe-core and page measurements) ran first. A failure the scanner is certain of is reported directly. Scanner output is never used to pass a criterion: every pass, not-applicable, and remaining failure was decided by an auditing agent that operated the page and inspected the result.

Each page was judged in every state it can reach that the auditor found, such as open menus, dialogs, and forms showing errors; the scan lists the controls that open them so none is skipped by accident. The scope table names the states tested. A state left untested appears under "Not verified".

A criterion fails when at least one audited page or screen fails it. "Not verified" marks checks that could not be completed, with the reason. Results apply to the audited scope on the audit dates and do not cover pages, states, or content outside it.

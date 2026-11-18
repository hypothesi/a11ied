import type { Platform } from './schema.js';

/** Whether a pass is run once per page or once for the whole audited set. */
export type PassScope = 'page' | 'site';

/**
 * A test pass groups the criteria an auditor checks with one kind of interaction, so a
 * page is loaded and exercised once per behavior instead of once per criterion.
 */
export interface TestPass {
   readonly id: string;
   readonly title: string;
   readonly scope: PassScope;
   readonly goal: string;
   /** WCAG 2.x A and AA criteria owned by this pass. */
   readonly criteria: readonly string[];
   /** AAA and retired criteria owned by this pass when they are in scope. */
   readonly extendedCriteria: readonly string[];
   readonly web: readonly string[];
   readonly mobile: readonly string[];
   /** Signal kinds from `a1 audit scan` that help with this pass. */
   readonly signals: readonly string[];
}

const SEMANTICS: TestPass = {
   id: 'semantics',
   title: 'Names, structure, and screen reader output',
   scope: 'page',
   goal: 'Everything a sighted user perceives is exposed to assistive technology with the right name, role, state, structure, and reading order.',
   criteria: [
      '1.1.1',
      '1.3.1',
      '1.3.2',
      '2.4.2',
      '2.4.4',
      '2.4.6',
      '3.1.1',
      '3.1.2',
      '4.1.2',
      '4.1.3',
   ],
   extendedCriteria: [
      '1.3.6',
      '2.4.9',
      '2.4.10',
      '3.1.3',
      '3.1.4',
      '3.1.5',
      '3.1.6',
      '4.1.1',
   ],
   web: [
      'Read the accessibility tree (`a1 tree <url>`) and compare it with a screenshot: every visible image, icon, control, heading, list, and table must appear with a sensible role and name.',
      'Walk the page with a screen reader (`a1 sr start --sr virtual <url>`, `a1 sr walk`, `a1 sr elements heading`). Judge what is announced, not what the markup intends.',
      'Judge every image alternative against the image itself: informative images need an equivalent, decorative ones must be hidden, and an alternative that names the wrong thing fails.',
      'Count every inline SVG in the `unlabeledSvgImages` signal as exposed, even when it sits beside text. Chrome and Safari give an SVG without `aria-hidden` an image role, so VoiceOver says "image" for each one, while the virtual reader skips them. Visible SVGs that are not hidden and have no name fail 1.1.1.',
      'Check that headings and labels describe their content, link purpose is clear from the link or its context, and the page title names this page.',
      'Check the page language and any passages in another language.',
      'Operate each custom control and dynamic region once and confirm state changes (expanded, selected, checked) and status messages are announced without moving focus.',
   ],
   mobile: [
      'Turn on the platform screen reader and move through the whole screen in order. On Android, `a1 talkback on` then `a1 talkback walk --count <n>` prints what TalkBack says at each stop. Every visible element must be reachable and announced with a name, role, and state.',
      'Compare the swipe order with the visual order, and check that grouped content is announced as a group or heading where the visual design implies one.',
      'Judge image and icon labels against what they show. Decorative images must be skipped.',
      'Check the screen title or navigation bar title, and the announcement when the screen changes.',
      'Trigger each state change and status message (toasts, loading, errors, counters) and confirm it is announced.',
   ],
   signals: ['axe', 'structure'],
};

const KEYBOARD: TestPass = {
   id: 'keyboard',
   title: 'Keyboard operation and focus',
   scope: 'page',
   goal: 'Every function works from a keyboard, focus is always visible and in a sensible order, and nothing traps or surprises the user.',
   criteria: [
      '1.4.13',
      '2.1.1',
      '2.1.2',
      '2.1.4',
      '2.4.1',
      '2.4.3',
      '2.4.7',
      '2.4.11',
      '3.2.1',
   ],
   extendedCriteria: ['2.1.3', '2.4.12', '2.4.13', '3.2.5'],
   web: [
      'Tab from the top of the page to the end and back with Shift+Tab. Take a screenshot at any stop where the focus indicator is missing, hard to see, or covered by sticky content.',
      'Compare the tab order with the visual and logical order. Check for a skip link or another way past repeated blocks.',
      'Operate every interactive element with the keyboard alone: Enter and Space on controls, arrow keys inside composite widgets, Escape to close. Anything a mouse can do must be possible. Use `a1 pattern check` for custom widgets that follow an ARIA pattern.',
      'Open every menu, dialog, and popup. Confirm focus moves into it, stays inside a modal, and returns to the trigger on close. Confirm focus is never trapped.',
      'Confirm that focusing an element never changes context on its own, and that content shown on hover or focus can be dismissed, hovered, and stays visible.',
      'Check for single-character keyboard shortcuts and whether they can be turned off or remapped.',
   ],
   mobile: [
      'Connect a hardware keyboard, or use Switch Control or Switch Access, and move through the whole screen. Every control must be reachable and operable.',
      'Check that the focus indicator is visible on each element and not hidden behind bars, sheets, or the on-screen keyboard.',
      'Open sheets, dialogs, and menus and confirm focus moves into them and returns on close, with no trap.',
      'Confirm the focus order matches the visual order and that focusing an element does not trigger navigation.',
   ],
   signals: ['keyboard'],
};

const VISUAL: TestPass = {
   id: 'visual',
   title: 'Color, contrast, and layout adaptation',
   scope: 'page',
   goal: 'Content stays readable and complete for people with low vision: enough contrast, no reliance on color or shape alone, and no loss at larger text, narrow widths, or wider spacing.',
   criteria: [
      '1.3.3',
      '1.3.4',
      '1.4.1',
      '1.4.3',
      '1.4.4',
      '1.4.5',
      '1.4.10',
      '1.4.11',
      '1.4.12',
   ],
   extendedCriteria: ['1.4.6', '1.4.8', '1.4.9'],
   web: [
      'Review the axe contrast results in the signals, then inspect what axe cannot measure: text over images or gradients, placeholder text, disabled-looking but active controls, and hover and focus states.',
      'Check non-text contrast: control boundaries, focus indicators, icons that carry meaning, and chart parts need 3:1 against their surroundings.',
      'Look for information carried by color alone (links inside text, required fields, error states, chart series) and for instructions that depend on shape, position, or sound.',
      'Set the viewport to 320 CSS pixels wide and check for horizontal scrolling, clipped or overlapping content, and lost functions. Then zoom text to 200 percent and repeat.',
      'Apply the WCAG text spacing values and check for clipped or overlapping text.',
      'Check that the content works in both portrait and landscape, and note images of text that could be real text.',
   ],
   mobile: [
      'Take screenshots and measure text and icon contrast against their backgrounds, including text over images and disabled-looking active controls.',
      'Set the system text size to its largest accessibility setting and check for truncated, overlapping, or missing content and controls.',
      'Rotate the device and confirm the screen works in both orientations unless one is essential.',
      'Look for information carried by color alone, and instructions that depend on shape, position, or sound.',
      'Turn on bold text, increased contrast, and dark mode if the app supports them and check nothing becomes unreadable.',
   ],
   signals: ['axe', 'layout'],
};

const MEDIA: TestPass = {
   id: 'media',
   title: 'Audio, video, motion, and time limits',
   scope: 'page',
   goal: 'Time-based media has alternatives, nothing moves, flashes, or plays without user control, and time limits can be extended.',
   criteria: [
      '1.2.1',
      '1.2.2',
      '1.2.3',
      '1.2.4',
      '1.2.5',
      '1.4.2',
      '2.2.1',
      '2.2.2',
      '2.3.1',
   ],
   extendedCriteria: [
      '1.2.6',
      '1.2.7',
      '1.2.8',
      '1.2.9',
      '1.4.7',
      '2.2.3',
      '2.2.4',
      '2.2.5',
      '2.2.6',
      '2.3.2',
      '2.3.3',
   ],
   web: [
      'Start from the media inventory in the signals, then confirm it by looking at the page: video and audio elements, embedded players, animated images, canvas, and background video.',
      'For each video or audio item, play it and check for captions, an audio description or text alternative, and a transcript as the criterion requires.',
      'Look for anything that moves, blinks, scrolls, or auto-updates for more than five seconds (carousels, tickers, animations) and check for a pause, stop, or hide control.',
      'Check for audio that plays automatically for more than three seconds, and for anything that flashes more than three times per second.',
      'Look for time limits (session expiry, timed steps, auto-advancing content) and whether the user can turn off, adjust, or extend them.',
      'When the page has no media, motion, or time limit, record each criterion as not-applicable and say what you checked.',
   ],
   mobile: [
      'List the audio, video, animation, and auto-advancing content on the screen by using it, not by assumption.',
      'For each media item check captions, audio description, and transcript availability, and that the player controls are labeled and operable.',
      'Check that motion and auto-play respect the system Reduce Motion setting or have a pause control, and that nothing flashes.',
      'Look for session timeouts and timed steps and whether they can be extended.',
   ],
   signals: ['media'],
};

const FORMS: TestPass = {
   id: 'forms',
   title: 'Forms, input, and error handling',
   scope: 'page',
   goal: 'People can understand what input is expected, complete it without surprises, and recover from mistakes.',
   criteria: [
      '1.3.5',
      '2.5.3',
      '3.2.2',
      '3.3.1',
      '3.3.2',
      '3.3.3',
      '3.3.4',
      '3.3.7',
      '3.3.8',
   ],
   extendedCriteria: ['3.3.5', '3.3.6', '3.3.9'],
   web: [
      'List every input, select, custom control, and button with visible text on the page. When there are none, record the input criteria as not-applicable.',
      'Check each field has a visible label or instruction, that required fields and expected formats are stated, and that the accessible name contains the visible label text.',
      'Check that fields collecting personal information declare their purpose with autocomplete.',
      'Change each control and confirm nothing unexpected happens before the user asks for it.',
      'Submit empty and invalid values. Errors must be identified in text, tied to the field, announced, and suggest a fix. Stay inside the audit rules: do not submit real orders, payments, or messages unless the audit authorizes it. Record what you could not exercise as cannot-tell.',
      'For legal, financial, or data-changing submissions check for a review, confirm, or undo step. For multi-step processes check that earlier answers are not asked again. For sign-in check that no cognitive test is required without an alternative, and that paste and password managers work.',
   ],
   mobile: [
      'List every input and control with visible text on the screen. When there are none, record the input criteria as not-applicable.',
      'Check each field has a visible, persistent label, announces that label, and uses the right keyboard type and autofill content type.',
      'Submit empty and invalid values within the audit rules and check errors are shown in text, tied to the field, and announced.',
      'Check that changing a control does not navigate or submit on its own.',
      'For sign-in check that paste, password managers, and biometrics are allowed, and that no puzzle is required without an alternative.',
   ],
   signals: ['forms'],
};

const POINTER: TestPass = {
   id: 'pointer',
   title: 'Pointer, touch, and motion input',
   scope: 'page',
   goal: 'Everything works with a single simple pointer action, targets are large enough, and accidental activation can be avoided.',
   criteria: ['2.5.1', '2.5.2', '2.5.4', '2.5.7', '2.5.8'],
   extendedCriteria: ['2.5.5', '2.5.6'],
   web: [
      'Review the small-target list in the signals and confirm each case by looking at it: targets under 24 by 24 CSS pixels need enough spacing or must fall under an exception.',
      'Look for functions that need a path gesture, multi-finger gesture, or dragging (sliders, maps, carousels, sortable lists) and check for a single-pointer alternative.',
      'Check that actions fire on pointer up, not pointer down, or can be aborted or undone.',
      'Look for functions triggered by device motion and whether they can be turned off and have a control alternative.',
   ],
   mobile: [
      'Measure touch targets from a screenshot. Flag targets under 24 by 24 points and note any under the platform guidance of 44 or 48.',
      'Find every swipe, pinch, long-press, and drag interaction and check for a single-tap alternative.',
      'Check that actions fire on touch up and can be cancelled by sliding off.',
      'Check shake, tilt, and other motion triggers can be disabled and have an on-screen alternative.',
   ],
   signals: ['pointer'],
};

const CONSISTENCY: TestPass = {
   id: 'consistency',
   title: 'Consistency across the audited set',
   scope: 'site',
   goal: 'Navigation, component naming, and help are consistent across pages or screens, and each page can be found in more than one way.',
   criteria: ['2.4.5', '3.2.3', '3.2.4', '3.2.6'],
   extendedCriteria: ['2.4.8'],
   web: [
      'Compare the repeated navigation on every page in the audit: same items in the same relative order.',
      'Compare components that do the same job across pages (search, cart, download, pagination) and check they have the same name and icon alternative.',
      'Check that help or contact mechanisms appear in the same relative place on each page that has them.',
      'Check there are at least two ways to reach each page that is not a step in a process: navigation, search, a sitemap, or links from related pages.',
   ],
   mobile: [
      'Compare the tab bar, navigation drawer, and headers across the audited screens: same items, same order, same names.',
      'Compare controls that do the same job across screens and check they share one label.',
      'Check that help and contact entry points are in a consistent place.',
      'Check that screens outside a linear process can be reached in more than one way where the app has more than a handful of screens.',
   ],
   signals: ['navigation'],
};

/** Every test pass, in the order an audit normally runs them. */
export const TEST_PASSES: readonly TestPass[] = [
   SEMANTICS,
   KEYBOARD,
   VISUAL,
   MEDIA,
   FORMS,
   POINTER,
   CONSISTENCY,
];

const FALLBACK_PASS_BY_GUIDELINE: Readonly<Record<string, string>> = {
   '1.1': 'semantics',
   '1.2': 'media',
   '1.3': 'semantics',
   '1.4': 'visual',
   '2.1': 'keyboard',
   '2.2': 'media',
   '2.3': 'media',
   '2.4': 'semantics',
   '2.5': 'pointer',
   '3.1': 'semantics',
   '3.2': 'consistency',
   '3.3': 'forms',
   '4.1': 'semantics',
};

const GUIDELINE_PARTS = 2;

export function getTestPass(passId: string): TestPass | undefined {
   return TEST_PASSES.find((pass) => pass.id === passId);
}

export function listTestPassIds(): string[] {
   return TEST_PASSES.map((pass) => pass.id);
}

/** Returns the pass that owns a criterion. Every criterion belongs to exactly one pass. */
export function getPassIdForCriterion(criterionId: string): string {
   const owner = TEST_PASSES.find(
      (pass) =>
         pass.criteria.includes(criterionId) ||
         pass.extendedCriteria.includes(criterionId),
   );
   if (owner) {
      return owner.id;
   }
   const guideline = criterionId.split('.').slice(0, GUIDELINE_PARTS).join('.');
   return FALLBACK_PASS_BY_GUIDELINE[guideline] ?? SEMANTICS.id;
}

/** Returns the procedure steps for the platform being audited. */
export function getPassProcedure(pass: TestPass, platform: Platform): readonly string[] {
   return platform === 'web' ? pass.web : pass.mobile;
}

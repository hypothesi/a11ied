import type { StateInventory, StateTrigger } from '@a11ied/audit';
import type { Page } from 'playwright';

/** More than this many triggers is usually one repeated pattern; the rest are counted. */
const TRIGGER_LIMIT = 25;
const LABEL_LIMIT = 60;

/** What the page script reports about one element; selectors are built afterward. */
interface RawTrigger {
   kind: StateTrigger['kind'];
   tag: string;
   id: string;
   role: string;
   label: string;
   inShadow: boolean;
   /** The first class name, to tell apart an element that has no name. */
   className: string;
   /** Position among all elements with this tag, in the order Playwright counts them. */
   nth: number;
}

/** The first rule an element matches decides its kind. */
const TRIGGER_RULES: readonly { kind: StateTrigger['kind']; selector: string }[] = [
   { kind: 'tabs', selector: '[role="tab"]' },
   { kind: 'dialog', selector: '[aria-haspopup="dialog"]' },
   { kind: 'popup', selector: '[aria-haspopup]:not([aria-haspopup="false"])' },
   {
      kind: 'disclosure',
      selector: '[aria-expanded], [popovertarget], [commandfor], summary',
   },
   { kind: 'embedded', selector: 'iframe' },
   // A button that does not submit a form exists to change the page, ARIA hint or not.
   {
      kind: 'control',
      selector:
         '[role="button"], button[type="button"], button[type="reset"], button:not(form button)',
   },
];

/** Implicit roles for the elements a `role=` selector can find by name. */
const ROLE_RULES: readonly { role: string; selector: string }[] = [
   { role: 'link', selector: 'a[href]' },
   { role: 'button', selector: 'button' },
];

/** An element narrower or shorter than this is treated as not shown. */
const MIN_VISIBLE_PX = 1;

const FIELD_SELECTOR = 'input:not([type=hidden]), select, textarea';
const INTERACTIVE_SELECTOR = 'button, a[href], input, iframe';

interface FindOptions {
   labelLimit: number;
   minVisiblePx: number;
   triggerRules: typeof TRIGGER_RULES;
   roleRules: typeof ROLE_RULES;
   fieldSelector: string;
   interactiveSelector: string;
}

/**
 * Runs in the page. Lists visible elements that can change what the page presents,
 * following open shadow roots, because embedded widgets usually live there. Everything it
 * needs arrives in `options`, since only this function is sent to the page.
 */
function findRawTriggers(options: FindOptions): RawTrigger[] {
   const found: RawTrigger[] = [];
   const seenForms = new Set<Element>();
   const tagCounts = new Map<string, number>();
   const positions = new Map<Element, number>();
   const isShown = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      return (
         rect.width >= options.minVisiblePx &&
         rect.height >= options.minVisiblePx &&
         getComputedStyle(element).visibility !== 'hidden'
      );
   };
   const add = (element: Element, kind: RawTrigger['kind'], inShadow: boolean): void => {
      const label = (
         element.getAttribute('aria-label') ??
         element.getAttribute('title') ??
         element.textContent ??
         ''
      )
         .replaceAll(/\s+/gu, ' ')
         .trim()
         .slice(0, options.labelLimit);
      found.push({
         kind,
         tag: element.tagName.toLowerCase(),
         id: element.id,
         role:
            element.getAttribute('role') ??
            options.roleRules.find((rule) => element.matches(rule.selector))?.role ??
            '',
         label: kind === 'form' ? '' : label,
         inShadow,
         className: element.classList.item(0) ?? '',
         nth: positions.get(element) ?? 0,
      });
   };
   /** Lists each form once, through the first visible field in it. */
   const addForm = (field: Element, inShadow: boolean): void => {
      const form = field.closest('form');
      const isNewField =
         form !== null && !seenForms.has(form) && field.matches(options.fieldSelector);
      if (isNewField && isShown(field)) {
         seenForms.add(form);
         add(form, 'form', inShadow);
      }
   };
   const visit = (root: Document | ShadowRoot, inShadow: boolean): void => {
      for (const element of root.querySelectorAll('*')) {
         const tag = element.tagName.toLowerCase();
         positions.set(element, tagCounts.get(tag) ?? 0);
         tagCounts.set(tag, (positions.get(element) ?? 0) + 1);
         if (element.shadowRoot) {
            if (element.shadowRoot.querySelector(options.interactiveSelector)) {
               add(element, 'embedded', inShadow);
            }
            visit(element.shadowRoot, true);
         }
         const kind = options.triggerRules.find((rule) =>
            element.matches(rule.selector),
         )?.kind;
         if (kind && isShown(element)) {
            add(element, kind, inShadow);
         }
         addForm(element, inShadow);
      }
   };
   visit(document, false);
   return found;
}

function quote(text: string): string {
   return text.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);
}

/** Names an element that has no accessible name by its tag and first class. */
function describeUnnamed(raw: RawTrigger): string {
   return raw.className === '' ? raw.tag : `${raw.tag}.${raw.className}`;
}

/** Picks a Playwright selector that finds the element again, preferring stable ones. */
function toSelector(raw: RawTrigger): string {
   if (raw.id !== '' && !raw.inShadow) {
      return `#${raw.id}`;
   }
   if (raw.role !== '' && raw.label !== '') {
      return `role=${raw.role}[name="${quote(raw.label)}"]`;
   }
   if (raw.className !== '') {
      return describeUnnamed(raw);
   }
   if (raw.label !== '') {
      return `${raw.tag}:has-text("${quote(raw.label)}")`;
   }
   return `${raw.tag} >> nth=${String(raw.nth)}`;
}

function describeForm(raw: RawTrigger): string {
   return raw.id === ''
      ? 'Form: validation and error states'
      : `Form ${raw.id}: validation and error states`;
}

/**
 * Lists what on a loaded page can change what it presents, so a worker accounts for every
 * state instead of judging the page only as it loads. It is a starting point: a control
 * driven by a click handler with no ARIA hint, or hover content, will not appear.
 */
export async function collectStateInventory(page: Page): Promise<StateInventory> {
   const raw = await page.evaluate(findRawTriggers, {
      labelLimit: LABEL_LIMIT,
      minVisiblePx: MIN_VISIBLE_PX,
      triggerRules: TRIGGER_RULES,
      roleRules: ROLE_RULES,
      fieldSelector: FIELD_SELECTOR,
      interactiveSelector: INTERACTIVE_SELECTOR,
   });
   const triggers = raw.map((entry, index): StateTrigger => ({
      id: `S${String(index + 1)}`,
      kind: entry.kind,
      label:
         entry.kind === 'form'
            ? describeForm(entry)
            : entry.label || describeUnnamed(entry),
      selector: toSelector(entry),
   }));
   return {
      triggers: triggers.slice(0, TRIGGER_LIMIT),
      omitted: Math.max(0, triggers.length - TRIGGER_LIMIT),
   };
}

import type { Page } from 'playwright';

/**
 * The attributes an ARIA widget expresses its state through.
 *
 * Watching these is what makes the keyboard probe work: an ARIA pattern is defined by the
 * state it publishes, so the pattern's own contract is what the observation reads.
 */
const WATCHED_ATTRIBUTES = [
   'aria-activedescendant',
   'aria-checked',
   'aria-current',
   'aria-disabled',
   'aria-expanded',
   'aria-hidden',
   'aria-level',
   'aria-pressed',
   'aria-selected',
   'aria-sort',
   'aria-valuenow',
   'aria-valuetext',
   'open',
   'tabindex',
] as const;

/**
 * How much of an element's text goes into its description.
 *
 * Two disclosure buttons with no id and no role describe identically without it, so a Tab
 * between them reads as no change and a working widget is reported as broken.
 */
const TEXT_LIMIT = 40;

const FOCUSABLE_SELECTOR =
   'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';

/** One reading of a widget, taken before and after a key press. */
export interface WidgetObservation {
   focus: string;
   ariaAttributes: string;
   accessibilityTree: string;
}

export type ObservedChange = 'focus' | 'ariaAttributes' | 'accessibilityTree';

/** Which of the three readings differ between two observations. */
export function diffObservations(
   before: WidgetObservation,
   after: WidgetObservation,
): ObservedChange[] {
   const changes: ObservedChange[] = [];
   if (before.focus !== after.focus) {
      changes.push('focus');
   }
   if (before.ariaAttributes !== after.ariaAttributes) {
      changes.push('ariaAttributes');
   }
   if (before.accessibilityTree !== after.accessibilityTree) {
      changes.push('accessibilityTree');
   }
   return changes;
}

/**
 * A key can remove the widget from the page: Escape closes a dialog that unmounts. The
 * snapshot would wait for the element to come back and time out, so an absent widget
 * reads as an empty tree, which the diff reports as a change.
 */
async function readWidgetTree(page: Page, selector: string): Promise<string> {
   const widget = page.locator(selector);
   if ((await widget.count()) === 0) {
      return '';
   }
   return widget.ariaSnapshot();
}

/**
 * Reads the widget's focused element, the state attributes across its subtree, and its
 * accessibility tree.
 *
 * The accessibility tree comes from Playwright's `ariaSnapshot()`, the same reading `a1
 * tree` prints, so a change the tree shows is a change a screen reader user could
 * notice.
 *
 * The page function declares no inner named functions on purpose. The build annotates a
 * named function expression with an `__name` helper that does not exist in the browser,
 * and Playwright ships this function's source across as text.
 */
export async function observeWidget(
   page: Page,
   selector: string,
): Promise<WidgetObservation> {
   const dom = await page.evaluate(
      ({ widgetSelector, watched, textLimit }) => {
         const root = globalThis.document.querySelector(widgetSelector);
         const active = globalThis.document.activeElement;
         const all = root ? [root, ...root.querySelectorAll('*')] : [];

         const states = all
            .map((element, index) => {
               const pairs = watched
                  .filter((name) => element.hasAttribute(name))
                  .map((name) => `${name}=${element.getAttribute(name) ?? ''}`);
               if (pairs.length === 0) {
                  return '';
               }
               const id = element.id ? `#${element.id}` : '';
               const role = element.getAttribute('role') ?? '';
               const text = (element.textContent ?? '').replaceAll(/\s+/gu, ' ').trim();
               return `${index}:${element.tagName}${id}[${role}]"${text.slice(0, textLimit)}" ${pairs.join(' ')}`;
            })
            .filter((entry) => entry.length > 0);

         if (!active) {
            return { focus: 'none', ariaAttributes: states.join(' | ') };
         }
         const activeIndex = all.indexOf(active);
         const activeId = active.id ? `#${active.id}` : '';
         const activeRole = active.getAttribute('role') ?? '';
         const activeText = (active.textContent ?? '').replaceAll(/\s+/gu, ' ').trim();
         return {
            focus: `${activeIndex}:${active.tagName}${activeId}[${activeRole}]"${activeText.slice(0, textLimit)}"`,
            ariaAttributes: states.join(' | '),
         };
      },
      {
         widgetSelector: selector,
         watched: [...WATCHED_ATTRIBUTES],
         textLimit: TEXT_LIMIT,
      },
   );

   return { ...dom, accessibilityTree: await readWidgetTree(page, selector) };
}

/**
 * Puts keyboard focus where the example's keyboard table assumes it is: on the widget
 * root when the root itself takes focus, otherwise on the first element inside it that
 * does.
 *
 * The element is returned so a finding can say where the key was pressed, which is what a
 * reader needs to judge one.
 */
export async function focusWidget(
   page: Page,
   selector: string,
   focusableSelector: string = FOCUSABLE_SELECTOR,
): Promise<string> {
   return page.evaluate(
      ({ widgetSelector, focusable }) => {
         const root = globalThis.document.querySelector(widgetSelector);
         if (!root) {
            return 'none';
         }
         const target = [root, ...root.querySelectorAll(focusable)].find((element) =>
            element.matches(focusable),
         );
         if (!(target instanceof globalThis.HTMLElement)) {
            return 'none';
         }
         target.focus();
         const id = target.id ? `#${target.id}` : '';
         return `${target.tagName}${id}[${target.getAttribute('role') ?? ''}]`;
      },
      { widgetSelector: selector, focusable: focusableSelector },
   );
}

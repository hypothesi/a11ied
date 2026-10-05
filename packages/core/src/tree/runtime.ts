import {
   withLoadedPage,
   type WithBrowserPageOptions,
} from '../browser/shared-browser.js';
import type { DocumentLoad } from '../targets/parse.js';
import { parseAriaSnapshot, type AriaTreeNode } from './parse.js';

export interface AccessibilityTree {
   /** The raw YAML from Playwright's `ariaSnapshot()`. */
   yaml: string;
   nodes: AriaTreeNode[];
}

/**
 * Loads a target and reads its accessibility tree with Playwright's `ariaSnapshot()`: the
 * role and name tree a screen reader sees, including JavaScript-rendered content.
 *
 * `selector` narrows it to one widget, which is what a hash of a judged component needs.
 */
export async function getAccessibilityTree(
   load: DocumentLoad,
   options: WithBrowserPageOptions & { selector?: string } = {},
): Promise<AccessibilityTree> {
   const selector = options.selector ?? 'body';
   const yaml = await withLoadedPage(
      load,
      (page) => page.locator(selector).ariaSnapshot(),
      options,
   );
   return { yaml, nodes: parseAriaSnapshot(yaml) };
}

/**
 * A supplied page retains the current document and journey state. Independent calls load
 * a fresh document before reading its title.
 */
export async function getPageTitle(
   load: DocumentLoad,
   options: WithBrowserPageOptions = {},
): Promise<string> {
   return withLoadedPage(load, (page) => page.title(), options);
}

export { getPageHtml } from '../browser/shared-browser.js';

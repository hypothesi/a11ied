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
 */
export async function getAccessibilityTree(
   load: DocumentLoad,
   options: WithBrowserPageOptions = {},
): Promise<AccessibilityTree> {
   const yaml = await withLoadedPage(
      load,
      (page) => page.locator('body').ariaSnapshot(),
      options,
   );
   return { yaml, nodes: parseAriaSnapshot(yaml) };
}

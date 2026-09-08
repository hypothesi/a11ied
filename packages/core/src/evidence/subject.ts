import { createHash } from 'node:crypto';

import {
   describeResolvedTarget,
   type ResolvedDocumentTarget,
} from '../targets/runtime.js';
import { serializeAriaTree } from '../tree/parse.js';
import type { AccessibilityTree } from '../tree/runtime.js';

/** Drops a `#fragment` from a URL string, leaving any other string untouched. */
export function stripFragment(value: string): string {
   const hashIndex = value.indexOf('#');
   if (hashIndex === -1) {
      return value;
   }
   return value.slice(0, hashIndex);
}

/**
 * The one string a recorded result and a later report both key on.
 *
 * `describeResolvedTarget` already folds the host case, drops a default port, adds the
 * root path to a bare host, and turns a relative file path into an absolute `file://`
 * URL, so those spellings all agree. It keeps the fragment, which this drops: a fragment
 * selects a place within a page, not a different page, so recording a result against
 * `/cart#top` has to match a later report of `/cart`.
 */
export function buildSubjectKey(resolved: ResolvedDocumentTarget): string {
   return stripFragment(describeResolvedTarget(resolved));
}

/**
 * Hashes the page's accessibility tree, so a later run can tell whether the page a person
 * judged still looks the way it did.
 *
 * The tree is the right input rather than the raw markup. A CSRF token, a session id, a
 * rendered timestamp, or an ad slot changes the markup on every load, and a warning that
 * fires every time is a warning nobody reads. Those all leave the role and name tree
 * alone.
 */
export function hashAccessibilityTree(tree: AccessibilityTree): string {
   return createHash('sha256').update(serializeAriaTree(tree.nodes)).digest('hex');
}

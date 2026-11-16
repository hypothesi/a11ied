import { parseAriaSnapshot, type AriaTreeNode } from './tree-parse.js';
import {
   interactiveCandidateSchema,
   type InteractiveCandidate,
   type VirtualSrSummary,
} from '@a11ied/contracts';
import type { Page } from 'playwright';

const LANDMARK_ROLES = new Set([
   'banner',
   'complementary',
   'contentinfo',
   'main',
   'navigation',
   'region',
   'search',
]);
const FORM_CONTROL_ROLES = new Set([
   'button',
   'checkbox',
   'combobox',
   'listbox',
   'radio',
   'searchbox',
   'slider',
   'spinbutton',
   'switch',
   'textbox',
]);
const LIVE_REGION_ROLES = new Set(['status', 'alert', 'log', 'marquee', 'timer']);

function spokenEntry(node: AriaTreeNode): string {
   if (node.text) {
      return String(node.text);
   }
   const levelPart =
      node.role === 'heading' && node.level !== undefined
         ? ` level ${String(node.level)}`
         : '';
   const namePart = node.name ? ` "${node.name}"` : '';
   return `${node.role}${namePart}${levelPart}`;
}

function roleNameEntry(node: AriaTreeNode): string {
   return node.name ? `${node.role}: ${node.name}` : node.role;
}

/** Walks an aria snapshot tree in depth-first reading order and summarizes it. */
export function buildVirtualSrSummaryFromNodes(
   nodes: readonly AriaTreeNode[],
): VirtualSrSummary {
   const summary: VirtualSrSummary = {
      provenance: 'virtual-dom',
      spokenOrder: [],
      headings: [],
      landmarks: [],
      links: [],
      formControls: [],
      liveRegions: [],
   };

   const walk = (node: AriaTreeNode): void => {
      summary.spokenOrder.push(spokenEntry(node));
      if (node.role === 'heading') {
         summary.headings.push(
            `h${String(node.level ?? 1)}: ${String(node.name ?? '')}`.trim(),
         );
      } else if (node.role === 'link') {
         summary.links.push(String(node.name ?? node.text ?? ''));
      }
      if (LANDMARK_ROLES.has(node.role)) {
         summary.landmarks.push(roleNameEntry(node));
      }
      if (FORM_CONTROL_ROLES.has(node.role)) {
         summary.formControls.push(roleNameEntry(node));
      }
      if (LIVE_REGION_ROLES.has(node.role)) {
         summary.liveRegions.push(roleNameEntry(node));
      }
      for (const child of node.children) {
         walk(child);
      }
   };

   for (const node of nodes) {
      walk(node);
   }

   return summary;
}

/**
 * Reads the live page's aria snapshot and builds a virtual screen reader summary. Any
 * explicit `aria-live` regions in the DOM that are not already represented in the live
 * region list are appended (plain element text when it has no live region role).
 */
export async function collectVirtualSrSummary(
   page: Page,
): Promise<{ yaml: string; nodes: AriaTreeNode[]; summary: VirtualSrSummary }> {
   const yaml = await page.locator('body').ariaSnapshot();
   const nodes = parseAriaSnapshot(yaml);
   const summary = buildVirtualSrSummaryFromNodes(nodes);

   const liveRegions = await page.evaluate(() => {
      const domLiveRegionRoles = new Set(['status', 'alert', 'log', 'marquee', 'timer']);
      const regions: string[] = [];

      for (const element of document.querySelectorAll(
         '[aria-live]:not([aria-live="off"])',
      )) {
         const label = (element.getAttribute('aria-label') ?? '').trim(),
            role = element.getAttribute('role') ?? '',
            text = (element.textContent ?? '').replaceAll(/\s+/gu, ' ').trim();

         if (domLiveRegionRoles.has(role)) {
            regions.push(label ? `${role}: ${label}` : role);
         } else {
            regions.push(label || text);
         }
      }

      return regions.filter((region) => region !== '');
   });

   const seen = new Set(summary.liveRegions);
   for (const region of liveRegions) {
      if (!seen.has(region)) {
         summary.liveRegions.push(region);
         seen.add(region);
      }
   }

   return { yaml, nodes, summary };
}

interface RawCandidate {
   kind: InteractiveCandidate['kind'];
   selector: string;
   label: string;
   suggestedSetup: Array<{ action: 'click'; selector: string }>;
}

const MAX_LABEL_LENGTH = 120;
const LABEL_TRUNCATE_SUFFIX_LENGTH = 3;

const CANDIDATES_SCRIPT = `
() => {
   const DISCLOSURE_QUERY = '[aria-expanded="false"]',
         DIALOG_QUERY = '[aria-haspopup="dialog"], [data-dialog], button[aria-controls]',
         TAB_QUERY = '[role="tab"][aria-selected="false"]',
         MENU_QUERY = '[aria-haspopup="menu"], [aria-haspopup="true"]',
         CANDIDATE_QUERIES = [
            ['disclosure', DISCLOSURE_QUERY],
            ['dialog', DIALOG_QUERY],
            ['tab', TAB_QUERY],
            ['menu', MENU_QUERY],
         ];

   const isVisible = (element) => {
      const style = getComputedStyle(element);
      return (
         style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0' &&
         element.getClientRects().length > 0
      );
   };

   const labelOf = (element) => {
      const label = String(element.getAttribute('aria-label') ?? '').replaceAll(/\\s+/gu, ' ').trim();
      if (label) {
         return label;
      }
      const text = String(element.textContent ?? '').replaceAll(/\\s+/gu, ' ').trim();
      if (text) {
         return text.length > ${String(MAX_LABEL_LENGTH)}
            ? text.slice(0, ${String(MAX_LABEL_LENGTH - LABEL_TRUNCATE_SUFFIX_LENGTH)}).trimEnd() + '...'
            : text;
      }
      return element.tagName.toLowerCase();
   };

   const escapeAttr = (value) => value.replaceAll('\\\\', '\\\\\\\\').replaceAll('"', '\\\\"');

   const nthSegment = (element) => {
      const tag = element.tagName.toLowerCase(),
            parent = element.parentElement;
      if (!parent) {
         return tag;
      }
      let index = 0;
      for (const sibling of parent.children) {
         if (sibling.tagName === element.tagName) {
            index += 1;
         }
         if (sibling === element) {
            break;
         }
      }
      return tag + ':nth-of-type(' + String(index) + ')';
   };

   const stableSelector = (element) => {
      const id = element.getAttribute('id');
      if (id) {
         return '#' + CSS.escape(id);
      }
      const testId = element.getAttribute('data-testid');
      if (testId) {
         return '[data-testid="' + escapeAttr(testId) + '"]';
      }
      const segments = [];
      for (let current = element; current; current = current.parentElement) {
         const tag = current.tagName.toLowerCase();
         if (tag === 'body') {
            segments.unshift('body');
            break;
         }
         if (tag === 'html') {
            break;
         }
         segments.unshift(nthSegment(current));
      }
      return segments.join(' > ');
   };

   const candidates = new Map();

   const record = (kind, element) => {
      if (!isVisible(element) || element.getAttribute('aria-hidden') === 'true') {
         return;
      }
      const label = labelOf(element);
      if (!label) {
         return;
      }
      const selector = stableSelector(element);
      if (candidates.has(selector)) {
         return;
      }
      candidates.set(selector, {
         kind,
         selector,
         label,
         suggestedSetup: [{ action: 'click', selector }],
      });
   };

   for (const [kind, query] of CANDIDATE_QUERIES) {
      for (const element of document.querySelectorAll(query)) {
         record(kind, element);
      }
   }

   for (const dialog of document.querySelectorAll('dialog:not([open])')) {
      const id = dialog.getAttribute('id');
      if (!id) {
         continue;
      }
      for (const trigger of document.querySelectorAll(
         'button[aria-controls="' + escapeAttr(id) + '"]',
      )) {
         record('dialog', trigger);
      }
   }

   for (const form of document.querySelectorAll('form')) {
      if (!isVisible(form)) {
         continue;
      }
      const submit = form.querySelector(
         'button[type="submit"], input[type="submit"], button:not([type])',
      );
      if (!submit || !isVisible(submit) || submit.getAttribute('aria-hidden') === 'true') {
         continue;
      }
      const formSelector = stableSelector(form);
      if (candidates.has(formSelector)) {
         continue;
      }
      candidates.set(formSelector, {
         kind: 'form',
         selector: formSelector,
         label: labelOf(form),
         suggestedSetup: [{ action: 'click', selector: stableSelector(submit) }],
      });
   }

   return Array.from(candidates.values());
}
`;

/**
 * Discovers interactive state candidates in the page: disclosures, dialog triggers, tabs,
 * menus, and form submit buttons. Each candidate gets a stable selector (`#id`,
 * `[data-testid="..."]`, or a `:nth-of-type` path) and a click setup step. The list is
 * deduplicated by selector and validated against the contract schema.
 */
export async function discoverInteractiveCandidates(
   page: Page,
): Promise<InteractiveCandidate[]> {
   const raw = await page.evaluate<RawCandidate[]>(`(${CANDIDATES_SCRIPT})()`);

   const seenSelectors = new Set<string>(),
      unique: InteractiveCandidate[] = [];

   for (const item of raw) {
      if (seenSelectors.has(item.selector)) {
         continue;
      }
      seenSelectors.add(item.selector);
      unique.push(interactiveCandidateSchema.parse(item));
   }

   return unique;
}

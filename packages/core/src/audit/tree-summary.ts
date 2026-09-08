import type { AriaTreeNode } from '../tree/parse.js';

export interface AuditTreeCounts {
   landmarks: number;
   headings: number;
   links: number;
   buttons: number;
   formControls: number;
}

export interface AuditTreeSummary {
   pageTitle: string;
   firstHeading: string | undefined;
   counts: AuditTreeCounts;
   headingLevels: number[];
   /** Every distinct role in the tree, sorted, so a caller can look one up in the APG. */
   roles: string[];
}

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

function walkNodes(nodes: AriaTreeNode[], visit: (node: AriaTreeNode) => void): void {
   for (const node of nodes) {
      visit(node);
      walkNodes(node.children, visit);
   }
}

function buildEmptyCounts(): AuditTreeCounts {
   return { landmarks: 0, headings: 0, links: 0, buttons: 0, formControls: 0 };
}

function tallyNode(counts: AuditTreeCounts, node: AriaTreeNode): void {
   if (LANDMARK_ROLES.has(node.role)) {
      counts.landmarks += 1;
   }
   if (node.role === 'heading') {
      counts.headings += 1;
   }
   if (node.role === 'link') {
      counts.links += 1;
   }
   if (node.role === 'button') {
      counts.buttons += 1;
   }
   if (FORM_CONTROL_ROLES.has(node.role)) {
      counts.formControls += 1;
   }
}

/**
 * Summarizes an accessibility tree: landmark, heading, link, button, and control counts,
 * plus every distinct role the page uses.
 */
export function summarizeAccessibilityTree(
   nodes: AriaTreeNode[],
   pageTitle: string,
): AuditTreeSummary {
   const counts = buildEmptyCounts();
   const headingLevels: number[] = [];
   const roles = new Set<string>();
   let firstHeading: string | undefined = undefined;

   walkNodes(nodes, (node) => {
      tallyNode(counts, node);
      roles.add(node.role);
      if (node.role === 'heading') {
         if (node.level !== undefined) {
            headingLevels.push(node.level);
         }
         firstHeading ??= node.name;
      }
   });

   return {
      pageTitle,
      firstHeading,
      counts,
      headingLevels,
      roles: [...roles].toSorted((left, right) => left.localeCompare(right)),
   };
}

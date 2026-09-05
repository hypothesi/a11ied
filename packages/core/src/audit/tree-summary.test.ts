import { describe, expect, it } from 'vitest';

import type { AriaTreeNode } from '../tree/parse.js';
import { summarizeAccessibilityTree } from './tree-summary.js';

const HEADING_LEVEL_ONE = 1;
const HEADING_LEVEL_TWO = 2;

const NODES: AriaTreeNode[] = [
   {
      role: 'navigation',
      children: [{ role: 'link', name: 'Home', children: [] }],
   },
   {
      role: 'main',
      children: [
         { role: 'heading', name: 'Welcome', level: 1, children: [] },
         { role: 'heading', name: 'Details', level: 2, children: [] },
         { role: 'textbox', name: 'Email', children: [] },
         { role: 'button', name: 'Submit', children: [] },
      ],
   },
];

describe('summarizeAccessibilityTree', () => {
   it('counts landmarks, headings, links, buttons, and form controls', () => {
      const summary = summarizeAccessibilityTree(NODES, 'Example page');

      expect(summary.pageTitle).toBe('Example page');
      expect(summary.firstHeading).toBe('Welcome');
      expect(summary.headingLevels).toEqual([HEADING_LEVEL_ONE, HEADING_LEVEL_TWO]);
      expect(summary.counts).toEqual({
         landmarks: 2,
         headings: 2,
         links: 1,
         buttons: 1,
         formControls: 1,
      });
   });

   it('reports no first heading when there are none', () => {
      const summary = summarizeAccessibilityTree(
         [{ role: 'paragraph', text: 'hi', children: [] }],
         'No headings',
      );
      expect(summary.firstHeading).toBeUndefined();
      expect(summary.counts.headings).toBe(0);
   });
});

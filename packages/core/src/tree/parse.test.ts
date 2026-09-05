import { describe, expect, it } from 'vitest';

import { filterAriaTree, parseAriaSnapshot, serializeAriaTree } from './parse.js';

const EXAMPLE_COM_SNAPSHOT = [
   '- heading "Example Domain" [level=1]',
   '- paragraph: This domain is for use in documentation examples without needing permission. Avoid use in operations.',
   '- paragraph:',
   '  - link "Learn more":',
   '    - /url: https://iana.org/domains/example',
].join('\n');

const NAV_MAIN_SNAPSHOT = [
   '- navigation:',
   '  - link "A":',
   '    - /url: /a',
   '  - link "B":',
   '    - /url: /b',
   '- main:',
   '  - heading "Title" [level=1]',
   '  - list:',
   '    - listitem: one',
   '    - listitem: two',
   '  - button "Click"',
].join('\n');

describe('parseAriaSnapshot', () => {
   it('parses roles, names, levels, and text content', () => {
      const nodes = parseAriaSnapshot(EXAMPLE_COM_SNAPSHOT);

      expect(nodes).toEqual([
         { role: 'heading', name: 'Example Domain', level: 1, children: [] },
         {
            role: 'paragraph',
            text: 'This domain is for use in documentation examples without needing permission. Avoid use in operations.',
            children: [],
         },
         {
            role: 'paragraph',
            children: [{ role: 'link', name: 'Learn more', children: [] }],
         },
      ]);
   });

   it('nests children under their parent role and drops /url property lines', () => {
      const nodes = parseAriaSnapshot(NAV_MAIN_SNAPSHOT);

      expect(nodes.map((node) => node.role)).toEqual(['navigation', 'main']);
      expect(nodes[0]).toEqual({
         role: 'navigation',
         children: [
            { role: 'link', name: 'A', children: [] },
            { role: 'link', name: 'B', children: [] },
         ],
      });
      expect(nodes[1]?.role).toBe('main');
      expect(nodes[1]?.children.map((child) => child.role)).toEqual([
         'heading',
         'list',
         'button',
      ]);
   });
});

describe('filterAriaTree', () => {
   it('keeps a matching node and its ancestors, dropping unrelated branches', () => {
      const nodes = parseAriaSnapshot(NAV_MAIN_SNAPSHOT);
      const filtered = filterAriaTree(nodes, (node) => node.role === 'button');

      expect(filtered).toEqual([
         { role: 'main', children: [{ role: 'button', name: 'Click', children: [] }] },
      ]);
   });

   it('keeps every node matching a role filter across branches', () => {
      const nodes = parseAriaSnapshot(NAV_MAIN_SNAPSHOT);
      const filtered = filterAriaTree(nodes, (node) => node.role === 'link');

      expect(filtered).toEqual([
         {
            role: 'navigation',
            children: [
               { role: 'link', name: 'A', children: [] },
               { role: 'link', name: 'B', children: [] },
            ],
         },
      ]);
   });
});

describe('serializeAriaTree', () => {
   it('round-trips a filtered tree back into readable indented lines', () => {
      const nodes = parseAriaSnapshot(NAV_MAIN_SNAPSHOT);
      const filtered = filterAriaTree(nodes, (node) => node.role === 'heading');

      expect(serializeAriaTree(filtered)).toBe('- main:\n  - heading "Title" [level=1]');
   });
});

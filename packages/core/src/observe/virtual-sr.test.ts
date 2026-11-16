import { describe, expect, it } from 'vitest';
import type { AriaTreeNode } from '../tree/parse.js';
import { withLoadedPage } from '../browser/shared-browser.js';
import {
   buildVirtualSrSummaryFromNodes,
   collectVirtualSrSummary,
   discoverInteractiveCandidates,
} from './virtual-sr.js';

const BROWSER_TEST_TIMEOUT_MS = 90_000;

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
   <head><title>Fixture</title></head>
   <body>
      <header><h1>Welcome</h1></header>
      <nav aria-label="Main"><a href="/pricing">Pricing</a></nav>
      <input aria-label="Email" />
      <div role="status">Saved</div>
   </body>
</html>`;

const CANDIDATES_HTML = `<!DOCTYPE html>
<html lang="en">
   <head><title>Candidates</title></head>
   <body>
      <button id="menu-btn" aria-expanded="false">Menu</button>
      <button id="tab-2" role="tab" aria-selected="false">Details</button>
      <form id="signup">
         <button id="submit-btn" type="submit">Submit</button>
      </form>
   </body>
</html>`;

describe('buildVirtualSrSummaryFromNodes', () => {
   it('summarizes headings, landmarks, links, controls, and live regions in reading order', () => {
      const nodes: AriaTreeNode[] = [
         {
            role: 'banner',
            children: [{ role: 'heading', name: 'Welcome', level: 1, children: [] }],
         },
         {
            role: 'navigation',
            name: 'Main',
            children: [{ role: 'link', name: 'Pricing', children: [] }],
         },
         { role: 'textbox', name: 'Email', children: [] },
         { role: 'status', text: 'Saved', children: [] },
      ];

      const summary = buildVirtualSrSummaryFromNodes(nodes);

      expect(summary.provenance).toStrictEqual('virtual-dom');
      expect(summary.headings).toStrictEqual(['h1: Welcome']);
      expect(summary.landmarks).toStrictEqual(['banner', 'navigation: Main']);
      expect(summary.links).toStrictEqual(['Pricing']);
      expect(summary.formControls).toStrictEqual(['textbox: Email']);
      expect(summary.liveRegions).toStrictEqual(['status']);
      expect(summary.spokenOrder).toStrictEqual([
         'banner',
         'heading "Welcome" level 1',
         'navigation "Main"',
         'link "Pricing"',
         'textbox "Email"',
         'Saved',
      ]);
   });
});

describe('collectVirtualSrSummary', () => {
   it(
      'captures the YAML, parsed nodes, and virtual SR summary for a loaded page',
      async () => {
         await withLoadedPage({ kind: 'html', html: FIXTURE_HTML }, async (page) => {
            const { yaml, nodes, summary } = await collectVirtualSrSummary(page);

            expect(yaml).toContain('heading "Welcome"');

            expect(nodes.length).toBeGreaterThan(0);
            expect(summary.provenance).toStrictEqual('virtual-dom');
            expect(summary.headings).toStrictEqual(['h1: Welcome']);
            expect(summary.landmarks).toStrictEqual(['banner', 'navigation: Main']);
            expect(summary.links).toStrictEqual(['Pricing']);
            expect(summary.formControls).toStrictEqual(['textbox: Email']);
            expect(summary.liveRegions).toStrictEqual(['status']);
            expect(summary.spokenOrder).toStrictEqual([
               'banner',
               'heading "Welcome" level 1',
               'navigation "Main"',
               'link "Pricing"',
               'textbox "Email"',
               'Saved',
            ]);
         });
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

describe('quoted snapshot names', () => {
   it(
      'retains colon-containing links from actual browser snapshots in summaries',
      async () => {
         const html =
            '<!doctype html><html><body><a href="/">Created By: Fireside Development LLC</a></body></html>';
         await withLoadedPage({ kind: 'html', html }, async (page) => {
            const { nodes, summary } = await collectVirtualSrSummary(page);

            expect(nodes).toStrictEqual([
               {
                  role: 'link',
                  name: 'Created By: Fireside Development LLC',
                  children: [],
               },
            ]);
            expect(summary.links).toStrictEqual(['Created By: Fireside Development LLC']);
            expect(summary.spokenOrder).toStrictEqual([
               'link "Created By: Fireside Development LLC"',
            ]);
         });
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

describe('discoverInteractiveCandidates', () => {
   it(
      'discovers disclosure, tab, and form candidates with click setup steps',
      async () => {
         await withLoadedPage({ kind: 'html', html: CANDIDATES_HTML }, async (page) => {
            const candidates = await discoverInteractiveCandidates(page);

            const byKind = new Map(
               candidates.map((candidate) => [candidate.kind, candidate]),
            );
            const disclosure = byKind.get('disclosure'),
               form = byKind.get('form'),
               tab = byKind.get('tab');

            expect(disclosure).toBeDefined();
            expect(disclosure?.selector).toStrictEqual('#menu-btn');
            expect(disclosure?.label).toStrictEqual('Menu');
            expect(disclosure?.suggestedSetup).toStrictEqual([
               { action: 'click', selector: '#menu-btn' },
            ]);

            expect(tab).toBeDefined();
            expect(tab?.selector).toStrictEqual('#tab-2');
            expect(tab?.label).toStrictEqual('Details');
            expect(tab?.suggestedSetup).toStrictEqual([
               { action: 'click', selector: '#tab-2' },
            ]);

            expect(form).toBeDefined();
            expect(form?.selector).toStrictEqual('#signup');
            expect(form?.label).toStrictEqual('Submit');
            expect(form?.suggestedSetup).toStrictEqual([
               { action: 'click', selector: '#submit-btn' },
            ]);
         });
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

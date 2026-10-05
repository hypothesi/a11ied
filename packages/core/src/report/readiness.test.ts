import { describe, expect, it } from 'vitest';

import { assertReportReady } from './readiness.js';
import { buildReportTestAudit, buildReportTestInventory } from './test-fixtures.js';

describe('report readiness', () => {
   it('allows sampled-out pages but blocks unfinished pages in a full audit', () => {
      const inventory = buildReportTestInventory();
      const [representative] = inventory.pages;
      if (!representative) {
         throw new Error('The fixture has no page.');
      }
      inventory.run.optionsChosen.auditMode = 'sampled';
      representative.auditStatus = 'error';
      representative.error = {
         code: 'blocked',
         message: 'The selected page could not be reached.',
      };
      inventory.run.optionsChosen.selectedPageIds = [representative.pageId];
      inventory.pages.push({
         ...representative,
         pageId: 'other-b2c3d4e5',
         url: 'https://example.test/other',
         finalUrl: 'https://example.test/other',
         auditStatus: 'not-tested',
      });
      const reports = [{ pageId: representative.pageId, report: buildReportTestAudit() }];

      expect(() => {
         assertReportReady(inventory, reports);
      }).not.toThrow();
      inventory.run.optionsChosen.auditMode = 'full';

      expect(() => {
         assertReportReady(inventory, reports);
      }).toThrow('Finish the selected page assessment');
   });

   it('rejects missing results and unfinished procedures even when marked audited', () => {
      const inventory = buildReportTestInventory(),
         report = buildReportTestAudit();
      const [criterion] = report.criteria;
      if (!criterion) {
         throw new Error('The fixture has no criterion.');
      }
      criterion.pending = true;

      expect(() => {
         assertReportReady(inventory, []);
      }).toThrow('missing results or pending procedures');
      expect(() => {
         assertReportReady(inventory, [{ pageId: 'home-a1b2c3d4', report }]);
      }).toThrow('missing results or pending procedures');
   });
});

describe('report error explanations', () => {
   it('requires an explicit reason for an error page', () => {
      const inventory = buildReportTestInventory();
      const [page] = inventory.pages;
      if (!page) {
         throw new Error('The fixture has no page.');
      }
      page.auditStatus = 'error';

      expect(() => {
         assertReportReady(inventory, []);
      }).toThrow('Record why');
      page.error = { code: 'unavailable', message: 'The page could not be loaded.' };

      expect(() => {
         assertReportReady(inventory, []);
      }).not.toThrow();
   });
});

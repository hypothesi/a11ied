import { describe, expect, it } from 'vitest';

import { reportModelSchema } from './report.js';

describe('reportModelSchema', () => {
   it('keeps untested outcomes explicit', () => {
      const model = reportModelSchema.parse({
         version: '1',
         title: 'Audit',
         generatedAt: '2026-09-16T12:00:00.000Z',
         startUrl: 'https://example.test/',
         scope: 'site',
         discovery: { complete: true, gaps: [], discoveredPages: 1, auditedPages: 0 },
         methodology: {
            automated: true,
            hybrid: false,
            manual: false,
            statement: 'Automated checks only.',
         },
         totals: {
            outcomes: {
               passed: 0,
               failed: 0,
               cantTell: 0,
               notTested: 1,
               inapplicable: 0,
            },
            violations: { minor: 0, moderate: 0, serious: 0, critical: 0 },
         },
         templates: [],
         pages: [],
         warnings: [],
      });

      expect(model.totals.outcomes.notTested).toStrictEqual(1);
   });
});

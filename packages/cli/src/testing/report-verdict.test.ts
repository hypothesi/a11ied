import { afterEach, describe, expect, it, vi } from 'vitest';
import { cliExitCodes, type ReportFinding } from '#contracts';
import * as core from '#core';
import { buildReportTestInventory } from '../../../core/src/report/test-fixtures.js';
import { handleReportBuildAction } from '../commands/report-actions.js';

vi.mock('#core', async (importOriginal) => {
   const original = await importOriginal<typeof core>();
   return { ...original, buildReportBundle: vi.fn() };
});

afterEach(() => {
   vi.clearAllMocks();
});

function mockFinding(
   impact: ReportFinding['impact'],
   source: ReportFinding['source'],
): void {
   const model = core.buildReportModel(buildReportTestInventory(), []);
   const page = model.pages[0];
   if (!page) {
      throw new Error('The report fixture needs a page.');
   }
   page.findings.push({
      source,
      impact,
      title: 'Observed failure',
      description: 'Recorded impact',
      guidance: '',
      criterionIds: ['2.1.2'],
      selectors: [],
      reproduction: [],
      artifactLinks: [],
   });
   vi.mocked(core.buildReportBundle).mockResolvedValue({ model, outputFiles: [] });
}

describe('report finding exit codes', () => {
   it.each(['axe', 'behavioral'] as const)(
      'fails for %s findings with unassessed severity at any threshold',
      async (source) => {
         mockFinding('unknown', source);
         const options = {
            inventory: 'inventory.json',
            resultsDir: 'pages',
            out: 'report',
            formats: 'json',
            draft: true,
         };
         const normal = await handleReportBuildAction(options);
         const critical = await handleReportBuildAction({
            ...options,
            failOn: 'critical',
         });

         expect(normal.exitCode).toStrictEqual(cliExitCodes.assertion);
         expect(critical.exitCode).toStrictEqual(cliExitCodes.assertion);
      },
   );

   it('applies the selected threshold to explicitly assessed behavioral severity', async () => {
      mockFinding('moderate', 'behavioral');
      const options = {
         inventory: 'inventory.json',
         resultsDir: 'pages',
         out: 'report',
         formats: 'json',
         draft: true,
      };
      const normal = await handleReportBuildAction(options);
      const critical = await handleReportBuildAction({ ...options, failOn: 'critical' });

      expect(normal.exitCode).toStrictEqual(cliExitCodes.assertion);
      expect(critical.exitCode).toStrictEqual(cliExitCodes.success);
   });
});

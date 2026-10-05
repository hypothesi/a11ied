import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cliOutputEnvelopeSchema, reportModelSchema } from '#contracts';
import { writeReportTestDraft } from '../../../core/src/report/test-fixtures.js';
import { EXIT_SUCCESS, EXIT_USAGE, runCli } from './setup.js';

const EXPECTED_DRAFT_WARNINGS = 2;

let directory = '',
   inventoryPath = '',
   resultsDir = '';

beforeEach(async () => {
   directory = await mkdtemp(resolve(tmpdir(), 'a11ied-report-draft-'));
   ({ inventoryPath, resultsDir } = await writeReportTestDraft(directory));
});

afterEach(async () => {
   await rm(directory, { recursive: true, force: true });
});

function getArguments(out: string): string[] {
   return [
      'report',
      'build',
      '--inventory',
      inventoryPath,
      '--results-dir',
      resultsDir,
      '--out',
      out,
      '--formats',
      'html,earl',
      '--json',
   ];
}

describe('draft report CLI', () => {
   it('keeps the completion gate for final reports', async () => {
      const out = resolve(directory, 'final'),
         result = await runCli(getArguments(out));

      expect(result.status).toStrictEqual(EXIT_USAGE);
      await expect(access(out)).rejects.toThrow();
   });

   it('renders available results without changing saved progress or counting aliases', async () => {
      const out = resolve(directory, 'draft'),
         saved = await readFile(inventoryPath, 'utf8');
      const result = await runCli([...getArguments(out), '--draft']);
      const envelope = cliOutputEnvelopeSchema.parse(JSON.parse(result.stdout)),
         html = await readFile(resolve(out, 'report.html'), 'utf8'),
         model = reportModelSchema.parse(envelope.result);

      expect(result.status).toStrictEqual(EXIT_SUCCESS);
      expect(model).toMatchObject({
         status: 'draft',
         discovery: { auditedPages: 0 },
         totals: { outcomes: { notTested: 55 } },
         pages: [
            { auditStatus: 'in-progress' },
            { auditStatus: 'in-progress', criteria: [] },
            { auditStatus: 'skipped-duplicate', criteria: [] },
            { auditStatus: 'not-tested', criteria: [] },
         ],
      });
      expect(model.warnings).toHaveLength(EXPECTED_DRAFT_WARNINGS);
      expect(model.warnings[0]).toMatch(/^unscanned-b2c3d4e5: ENOENT:/);
      expect(model.warnings).toContain(
         'No coordinated assessment was supplied. Scanner results and recorded judgments do not establish complete audit coverage.',
      );
      expect(html).toContain('Draft assessment.');
      expect(html).toContain('pending manual checks remain incomplete');
      expect(await readFile(inventoryPath, 'utf8')).toStrictEqual(saved);
      expect(JSON.parse(await readFile(resolve(out, 'report.json'), 'utf8'))).to.eql(
         model,
      );
      await expect(access(resolve(out, 'report.earl.json'))).resolves.toBeUndefined();
   });
});

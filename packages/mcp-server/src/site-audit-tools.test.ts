import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { reportModelSchema } from '@a11ied/contracts';
import { writeReportTestDraft } from '../../core/src/report/test-fixtures.js';

import { ONE_MINUTE_MS, withHarness } from './testing/harness.js';

const auditResultSchema = z.object({
   result: z.object({
      criteria: z.array(z.object({ level: z.string() })),
      axe: z.object({ selection: z.object({ kind: z.string(), level: z.string() }) }),
      recorded: z.array(z.object({ outcome: z.string() })),
   }),
});

describe('site audit MCP tools', () => {
   it('registers discovery and report tools', async () => {
      await withHarness(async (harness) => {
         const { tools } = await harness.client.listTools(),
            names = tools.map((tool) => tool.name);

         expect(names).toContain('audit_discover');
         expect(names).toContain('report_build');
      });
   });
});

describe('MCP draft reports', () => {
   it('uses the same draft status, available results, and final gate as the CLI', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'a11ied-mcp-draft-'));
      try {
         const paths = await writeReportTestDraft(directory);
         await withHarness(async (harness) => {
            const input = {
               ...paths,
               outDir: join(directory, 'report'),
               formats: ['html'],
            };
            const final = await harness.client.callTool({
               name: 'report_build',
               arguments: input,
            });
            const draft = await harness.client.callTool({
               name: 'report_build',
               arguments: { ...input, draft: true },
            });

            expect(final.isError).toStrictEqual(true);
            expect(draft.isError).toBeFalsy();
            expect(
               reportModelSchema.parse(
                  JSON.parse(await readFile(join(input.outDir, 'report.json'), 'utf8')),
               ),
            ).toMatchObject({
               status: 'draft',
               discovery: { auditedPages: 0 },
               totals: { outcomes: { notTested: 55 } },
            });
         });
      } finally {
         await rm(directory, { recursive: true, force: true });
      }
   });
});

describe('MCP audit evidence and level', () => {
   it(
      'applies the requested level and reads only the selected run evidence',
      async () => {
         const directory = await mkdtemp(join(tmpdir(), 'a11ied-mcp-evidence-'));
         try {
            await withHarness(async (harness) => {
               const html = '<title>Fixture</title><main><h1>Fixture</h1></main>',
                  resultsFile = join(directory, 'run.jsonl');
               await harness.client.callTool({
                  name: 'record_result',
                  arguments: {
                     html,
                     criterionId: '3.3.8',
                     procedureId: 'auth_flow_probe',
                     outcome: 'failed',
                     resultsFile,
                  },
               });
               const audited = await harness.client.callTool({
                     name: 'audit',
                     arguments: { html, level: 'AA', resultsFile },
                  }),
                  fresh = await harness.client.callTool({
                     name: 'audit',
                     arguments: {
                        html,
                        level: 'AA',
                        resultsFile: join(directory, 'fresh.jsonl'),
                     },
                  }),
                  payload = auditResultSchema.parse(audited.structuredContent);

               expect(audited.isError).toBeFalsy();
               expect(
                  payload.result.criteria.some((criterion) => criterion.level === 'AAA'),
               ).toStrictEqual(false);
               expect(payload.result.axe.selection).to.eql({
                  kind: 'level',
                  level: 'AA',
               });
               expect(payload.result.recorded).toHaveLength(1);
               expect(
                  auditResultSchema.parse(fresh.structuredContent).result.recorded,
               ).to.eql([]);
            });
         } finally {
            await rm(directory, { recursive: true, force: true });
         }
      },
      ONE_MINUTE_MS,
   );
});

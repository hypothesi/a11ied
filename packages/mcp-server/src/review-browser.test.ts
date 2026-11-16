import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { observationReceiptSchema, verdictProposalSchema } from '@a11ied/contracts';
import { createBundleRef } from '@a11ied/verdict';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getObservationCacheDir, readCachedObservationBundle } from '@a11ied/observe';
import {
   getInvalidContentText,
   BASIC_PAGE,
   ONE_MINUTE_MS,
   TITLE_PRESENT_PAGE,
   TITLE_MISSING_PAGE,
   withHarness,
} from './testing/harness.js';

const observationSummarySchema = z.object({
   fingerprint: z.string(),
   digest: z.string(),
   data: z.object({ title: z.string() }),
});

describe('MCP review browser transport', () => {
   it(
      'collects URL evidence through MCP, reads cached slices, and refreshes after an error',
      async () => {
         const runDir = await mkdtemp(join(tmpdir(), 'a11ied-mcp-browser-review-'));
         try {
            await withHarness(async ({ client }) => {
               const started = await client.callTool({
                  name: 'review_start',
                  arguments: {
                     runDir,
                     target: pathToFileURL(BASIC_PAGE).href,
                     criterionIds: ['2.4.2'],
                  },
               });

               expect(started.isError).toBeFalsy();
               const cached = await client.callTool({
                  name: 'review.observe',
                  arguments: { runDir, stateId: 'initial', slice: 'facts' },
               });

               expect(cached.isError).toBeFalsy();
               const first = observationSummarySchema.parse(cached.structuredContent);
               const receiptPath = join(
                  getObservationCacheDir(runDir, first.fingerprint),
                  'capture-receipt.json',
               );
               const receipt = observationReceiptSchema.parse(
                  JSON.parse(await readFile(receiptPath, 'utf8')),
               );

               expect(first.data.title).toBe('Basic page');
               const summary = getInvalidContentText(cached.content);
               const payloadText = JSON.stringify(cached.structuredContent);

               expect(summary).toContain('structuredContent');
               expect(summary.length).toBeLessThan(payloadText.length / 10);
               expect(summary).not.toContain(first.fingerprint);
               expect(receipt.digest).toBe(first.digest);
               const captured = await client.callTool({
                  name: 'review_observe',
                  arguments: {
                     runDir,
                     stateId: 'initial',
                     capture: { condition: 'reflow320', actions: [] },
                  },
               });

               expect(captured.isError).toBeFalsy();
               expect(captured.structuredContent).toMatchObject({
                  fingerprint: first.fingerprint,
                  data: {
                     capture: { observation: { width: 320 }, rootDigest: first.digest },
                  },
               });
               const failed = await client.callTool({
                  name: 'review_observe',
                  arguments: { runDir, stateId: 'unknown', refresh: true },
               });

               expect(failed.isError).toBe(true);
               const refreshed = await client.callTool({
                  name: 'review_observe',
                  arguments: {
                     runDir,
                     stateId: 'initial',
                     slice: 'facts',
                     refresh: true,
                  },
               });

               expect(refreshed.isError).toBeFalsy();
               const second = observationSummarySchema.parse(refreshed.structuredContent);

               expect(second.data.title).toBe('Basic page');
               expect(second.fingerprint).not.toBe(first.fingerprint);
            });
         } finally {
            await rm(runDir, { recursive: true, force: true });
         }
      },
      ONE_MINUTE_MS,
   );
});

const titlePacketSchema = z.object({
   packet: z.object({
      stateId: z.string(),
      checks: z
         .array(z.object({ procedureId: z.string(), procedureVersion: z.string() }))
         .min(1),
   }),
});
const titleObservationSchema = observationSummarySchema.extend({
   data: z.object({
      title: z.string(),
      headings: z.array(z.object({ text: z.string() })).min(1),
   }),
});
const EXPECTED_TITLE_PROOF_RECORDS = 3;

async function assessCollectedTitle(input: {
   client: Client;
   runDir: string;
   stateId: string;
   title: string;
   heading: string;
   outcome: 'passed' | 'failed';
}): Promise<void> {
   const agentId = `title-worker-${input.stateId}`;
   const claimed = await input.client.callTool({
      name: 'review.next',
      arguments: {
         runDir: input.runDir,
         stateId: input.stateId,
         agentId,
         count: 1,
      },
   });
   const packet = titlePacketSchema.parse(claimed.structuredContent).packet;
   const observed = await input.client.callTool({
      name: 'review.observe',
      arguments: {
         runDir: input.runDir,
         stateId: input.stateId,
         slice: 'facts',
      },
   });
   const observation = titleObservationSchema.parse(observed.structuredContent);
   const bundle = await readCachedObservationBundle(
      input.runDir,
      observation.fingerprint,
   );
   const check = packet.checks[0];
   if (!bundle || !check) {
      throw new Error('Missing genuine collected title evidence.');
   }

   expect(packet.stateId).toStrictEqual(input.stateId);
   expect(observation.data.title).toStrictEqual(input.title);
   expect(observation.data.headings[0]?.text).toStrictEqual(input.heading);
   expect(bundle.transcript.provenance).toStrictEqual('virtual-dom');
   const evidence = (['facts', 'transcript', 'collectionTrace'] as const).map((section) =>
      createBundleRef(bundle, section),
   );
   const proposal = verdictProposalSchema.parse({
      stateId: input.stateId,
      criterionId: '2.4.2',
      procedureId: check.procedureId,
      outcome: input.outcome,
      method: 'virtual-sr',
      evidence,
      rationale: input.title
         ? `The collected title identifies ${input.heading}.`
         : 'The collected help document has an empty title.',
      assessment: {
         version: check.procedureVersion,
         actions: [
            {
               index: 0,
               outcome: input.outcome,
               observation: `After loading ${bundle.targetUrl}, the actual document title is ${JSON.stringify(input.title)}.`,
               evidence,
            },
            {
               index: 1,
               outcome: input.outcome,
               observation: input.title
                  ? `The title identifies the topic shown by the actual heading ${input.heading}.`
                  : `An empty title does not identify the help topic shown by the actual heading ${input.heading}.`,
               evidence,
            },
         ],
      },
      repro: input.title
         ? []
         : [`Open ${bundle.targetUrl}.`, 'Inspect the empty document title.'],
   });
   const judged = await input.client.callTool({
      name: 'review.judge',
      arguments: {
         runDir: input.runDir,
         agentId,
         verdicts: [proposal],
      },
   });

   expect(judged.isError).toBeFalsy();
   expect(judged.structuredContent).toMatchObject({ closedCount: 1 });
}

describe('Real browser title review end to end', () => {
   it(
      'collects two pages, judges them through independent workers and reports one confirmed failure with both proof methods',
      async () => {
         const runDir = await mkdtemp(join(tmpdir(), 'a11ied-real-title-pilot-'));
         try {
            await withHarness(async ({ client }) => {
               const started = await client.callTool({
                  name: 'review.start',
                  arguments: {
                     runDir,
                     criterionIds: ['2.4.2'],
                     concurrency: 2,
                     states: [
                        {
                           stateId: 'settings',
                           targetUrl: pathToFileURL(TITLE_PRESENT_PAGE).href,
                        },
                        {
                           stateId: 'help',
                           targetUrl: pathToFileURL(TITLE_MISSING_PAGE).href,
                        },
                     ],
                  },
               });

               expect(started.isError).toBeFalsy();
               await Promise.all([
                  assessCollectedTitle({
                     client,
                     runDir,
                     stateId: 'settings',
                     title: 'Account preferences | Workflow pilot',
                     heading: 'Account preferences',
                     outcome: 'passed',
                  }),
                  assessCollectedTitle({
                     client,
                     runDir,
                     stateId: 'help',
                     title: '',
                     heading: 'Account help',
                     outcome: 'failed',
                  }),
               ]);
               const final = await client.callTool({
                  name: 'review.report',
                  arguments: { runDir, draft: false },
               });

               expect(final.isError).toBeFalsy();
               expect(final.structuredContent).toMatchObject({
                  report: {
                     isDraft: false,
                     snapshot: {
                        expectedChecks: 2,
                        completeChecks: 2,
                        unresolvedChecks: 0,
                        assessments: expect.any(Array),
                     },
                     executiveSummary: {
                        failingCriteriaCount: 1,
                        seriousFindingsCount: 1,
                     },
                     methodologyDisclosure: {
                        assistiveTechnology: { virtualDomCount: 2, nativeSrCount: 0 },
                     },
                  },
               });
               const records = z
                  .object({
                     report: z.object({
                        snapshot: z.object({ assessments: z.array(z.unknown()) }),
                     }),
                  })
                  .parse(final.structuredContent);

               expect(records.report.snapshot.assessments).toHaveLength(
                  EXPECTED_TITLE_PROOF_RECORDS,
               );
            });
         } finally {
            await rm(runDir, { recursive: true, force: true });
         }
      },
      ONE_MINUTE_MS,
   );
});

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EvidenceRecord } from '@a11ied/contracts';
import {
   appendEvidence,
   buildSubjectKey,
   listPendingCriteria,
   resolveDocumentTarget,
} from '@a11ied/core';
import { getTestMethod, WcagEngineNotFoundError } from '@a11ied/wcag-engine';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   pageTargetInputSchema,
   readOnlyAnnotations,
} from '../lib/shared.js';

/** The strategy artifact names this for a criterion axe covers; a person did not run axe. */
const AUTOMATED_PROCEDURE_ID = 'axe_scan';
const DEFAULT_PROCEDURE_ID = 'manual_review';

const recordInputSchema = pageTargetInputSchema.extend({
   criterionId: z
      .string()
      .min(1)
      .describe('The WCAG success criterion the result is for, such as 2.4.4.'),
   outcome: z
      .enum(['passed', 'failed', 'cantTell', 'inapplicable'])
      .describe('What the check found.'),
   mode: z
      .enum(['manual', 'semiAutomatic'])
      .optional()
      .describe(
         'manual when a person judged it alone, semiAutomatic with tool help. Defaults to semiAutomatic.',
      ),
   procedureId: z
      .string()
      .min(1)
      .optional()
      .describe('Which check was performed. Defaults to the one the criterion names.'),
   pointer: z
      .string()
      .min(1)
      .optional()
      .describe('CSS selector for the element that was judged.'),
   note: z.string().optional().describe('Why the result is what it is.'),
   assertedBy: z
      .string()
      .min(1)
      .optional()
      .describe('Who or what recorded it. Defaults to the calling agent name.'),
   resultsFile: z
      .string()
      .min(1)
      .optional()
      .describe('Where to store results. Defaults to .a11ied/evidence.jsonl.'),
});

const pendingInputSchema = pageTargetInputSchema.extend({
   level: z
      .string()
      .min(1)
      .optional()
      .describe('Restrict to one WCAG level: A, AA, or AAA.'),
   wcagVersion: z.string().min(1).optional().describe('Defaults to 2.2.'),
   resultsFile: z.string().min(1).optional(),
});

async function resolveSubject(input: {
   target?: string | undefined;
   html?: string | undefined;
}): Promise<string> {
   const resolved = await resolveDocumentTarget({
      ...(input.target === undefined ? {} : { target: input.target }),
      ...(input.html === undefined ? {} : { html: input.html }),
   });
   return buildSubjectKey(resolved);
}

function pickProcedureId(criterionId: string, wcagVersion?: string): string {
   try {
      const lookup = wcagVersion === undefined ? {} : { version: wcagVersion };
      const { procedureIds } = getTestMethod(criterionId, lookup).strategy;
      const performable = procedureIds.find(
         (procedureId: string) => procedureId !== AUTOMATED_PROCEDURE_ID,
      );
      return performable ?? DEFAULT_PROCEDURE_ID;
   } catch (error) {
      if (error instanceof WcagEngineNotFoundError) {
         return DEFAULT_PROCEDURE_ID;
      }
      throw error;
   }
}

function registerRecordTool(server: McpServer): void {
   server.registerTool(
      'record_result',
      {
         title: 'Record a manual accessibility result',
         description:
            'Record what you found for a WCAG criterion that a11ied cannot check automatically, so it reaches the same ' +
            'report as the axe results. Use it after you have actually inspected the page for that criterion: read the ' +
            'accessibility tree, drove the screen reader, or looked at the rendered page. Call list_pending_results first ' +
            'to see which criteria still need you. Recording the same criterion twice replaces the earlier result.',
         inputSchema: recordInputSchema,
         annotations: activeAnnotations,
      },
      async (input) => {
         const subject = await resolveSubject(input);
         const record: EvidenceRecord = {
            subject,
            test: {
               kind: 'criterion',
               criterionId: input.criterionId,
               procedureId: input.procedureId ?? pickProcedureId(input.criterionId),
            },
            outcome: input.outcome,
            mode: input.mode ?? 'semiAutomatic',
            recordedAt: new Date().toISOString(),
            ...(input.pointer === undefined ? {} : { pointer: input.pointer }),
            ...(input.note === undefined ? {} : { note: input.note }),
            ...(input.assertedBy === undefined ? {} : { assertedBy: input.assertedBy }),
         };
         const file = await appendEvidence(record, { file: input.resultsFile });

         return createToolResponse({
            target: { kind: 'url', value: subject },
            result: { record, file },
         });
      },
   );
}

function registerPendingTool(server: McpServer): void {
   server.registerTool(
      'list_pending_results',
      {
         title: 'List checks that still need a person',
         description:
            'List the WCAG criteria for a target that axe cannot decide and that have no recorded result yet. Each entry ' +
            'carries the procedure to perform. This reads the WCAG data and the results file and never opens a browser, ' +
            'so it is cheap to call between checks. Record what you find with record_result.',
         inputSchema: pendingInputSchema,
         annotations: readOnlyAnnotations,
      },
      async (input) => {
         const subject = await resolveSubject(input);
         const pending = await listPendingCriteria({
            subject,
            file: input.resultsFile,
            level: input.level,
            wcagVersion: input.wcagVersion,
         });

         return createToolResponse({
            target: { kind: 'url', value: subject },
            result: { subject, pending, count: pending.length },
         });
      },
   );
}

/** Registers the tools an agent uses to report checks a11ied cannot automate. */
export function registerEvidenceTools(server: McpServer): void {
   registerRecordTool(server);
   registerPendingTool(server);
}

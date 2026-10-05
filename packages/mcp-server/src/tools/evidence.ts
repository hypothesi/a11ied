import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
   evidenceFindingSchema,
   evidenceProvenanceSchema,
   type EvidenceRecord,
} from '@a11ied/contracts';
import {
   recordEvidence,
   resolveEvidenceProcedure,
   buildSubjectKey,
   listPendingCriteria,
   resolveDocumentTarget,
} from '@a11ied/core';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   pageTargetInputSchema,
   readOnlyAnnotations,
} from '../lib/shared.js';

/** The strategy artifact names this for a criterion axe covers; a person did not run axe. */
const recordInputSchema = pageTargetInputSchema.extend({
   finding: evidenceFindingSchema.optional(),
   provenance: evidenceProvenanceSchema.optional(),
   runFile: z.string().min(1).optional(),
   wcagVersion: z.string().min(1).optional(),
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
   storageStatePath: z.string().min(1).optional(),
   runFile: z.string().min(1).optional(),
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

function registerRecordTool(server: McpServer): void {
   server.registerTool(
      'record_result',
      {
         title: 'Record a manual accessibility result',
         description:
            'Record what you found for a WCAG criterion that a11ied cannot check automatically, so it reaches the same ' +
            'report as the axe results. Use it after you have actually inspected the page for that criterion: read the ' +
            'accessibility tree, drove the screen reader, or looked at the rendered page. Call list_pending_results first ' +
            'to see the remaining procedures. Recording the same procedure and element again replaces its earlier result.',
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
               procedureId: resolveEvidenceProcedure({
                  criterionId: input.criterionId,
                  procedureId: input.procedureId,
                  wcagVersion: input.wcagVersion,
               }).procedureId,
            },
            outcome: input.outcome,
            mode: input.mode ?? 'semiAutomatic',
            recordedAt: new Date().toISOString(),
            ...(input.provenance ? { provenance: input.provenance } : {}),
            ...(input.finding ? { finding: input.finding } : {}),
            ...(input.pointer === undefined ? {} : { pointer: input.pointer }),
            ...(input.note === undefined ? {} : { note: input.note }),
            ...(input.assertedBy === undefined ? {} : { assertedBy: input.assertedBy }),
         };
         const accepted = await recordEvidence(record, {
            file: input.resultsFile,
            runFile: input.runFile,
            wcagVersion: input.wcagVersion,
         });

         return createToolResponse({
            target: { kind: 'url', value: subject },
            result: accepted,
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
            'List WCAG criteria with unrecorded manual procedures for a target. Each entry lists the remaining procedures. ' +
            'This reads WCAG data and the evidence file without opening a browser. Record results with record_result.',
         inputSchema: pendingInputSchema,
         annotations: readOnlyAnnotations,
      },
      async (input) => {
         const subject = await resolveSubject(input);
         const pending = await listPendingCriteria({
            subject,
            file: input.resultsFile,
            runFile: input.runFile,
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

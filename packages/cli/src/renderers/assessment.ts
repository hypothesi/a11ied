import { z } from 'zod';
import type { CliOutputEnvelope } from '#contracts';

const progressPageSchema = z.object({
   items: z.array(
      z.object({
         id: z.string(),
         label: z.string(),
         total: z.number(),
         assessed: z.number(),
         unresolved: z.number(),
      }),
   ),
   total: z.number(),
   nextOffset: z.number().optional(),
});
const textResultSchema = z.object({
   file: z.string(),
   evidenceFile: z.string(),
   complete: z.boolean(),
   coverage: z.object({
      total: z.number(),
      attempted: z.number(),
      assessed: z.number(),
      unresolved: z.number(),
   }),
   guidance: z.string(),
   mutation: z
      .object({
         revision: z.number(),
         stateId: z.string().optional(),
         journeyId: z.string().optional(),
         checkId: z.string().optional(),
      })
      .optional(),
   issues: z.object({
      items: z.array(
         z.object({
            code: z.string(),
            message: z.string(),
            checkId: z.string().optional(),
            criterionId: z.string().optional(),
         }),
      ),
      total: z.number(),
      nextOffset: z.number().optional(),
   }),
   progress: z.object({
      states: progressPageSchema,
      pages: progressPageSchema,
      journeys: progressPageSchema,
   }),
   next: z
      .object({
         check: z.object({
            checkId: z.string(),
            criterionId: z.string(),
            environmentId: z.string(),
         }),
         procedure: z.object({
            title: z.string(),
            setup: z.array(z.string()),
            actions: z.array(z.string()),
            requiredEvidence: z.array(z.string()),
         }),
      })
      .optional(),
});

function getStatusCommand(file: string, offset: number): string {
   const replacement = process.platform === 'win32' ? "''" : String.raw`'\''`;
   return `a1 audit status '${file.replaceAll("'", replacement)}' --offset ${offset}`;
}

function appendProgress(input: {
   lines: string[];
   label: string;
   page: z.infer<typeof progressPageSchema>;
   file: string;
}): void {
   const { lines, label, page, file } = input;
   if (page.total === 0) {
      return;
   }
   lines.push('', `${label} (${page.total}):`);
   lines.push(
      ...page.items.map(
         (item) =>
            `  * ${item.label} [${item.id}]: ${item.assessed} of ${item.total} assessed; ${item.unresolved} unresolved.`,
      ),
   );
   if (page.nextOffset !== undefined) {
      lines.push(
         `More ${label.toLowerCase()}: ${getStatusCommand(file, page.nextOffset)}`,
      );
   }
}

function appendCoverage(lines: string[], result: z.infer<typeof textResultSchema>): void {
   if (result.mutation) {
      const identity =
         result.mutation.stateId ?? result.mutation.journeyId ?? result.mutation.checkId;
      if (identity) {
         lines.push(`Saved: ${identity} (revision ${result.mutation.revision}).`);
      }
   }
   lines.push('', `Coverage issues (${result.issues.total}):`);
   lines.push(
      ...result.issues.items.map(
         (issue) =>
            `  * ${issue.checkId ?? issue.criterionId ?? issue.code}: ${issue.message}`,
      ),
   );
   if (result.issues.nextOffset !== undefined) {
      lines.push(
         `More issues: ${getStatusCommand(result.file, result.issues.nextOffset)}`,
      );
   }
   appendProgress({
      lines,
      label: 'States',
      page: result.progress.states,
      file: result.file,
   });
   appendProgress({
      lines,
      label: 'Pages',
      page: result.progress.pages,
      file: result.file,
   });
   appendProgress({
      lines,
      label: 'Journeys',
      page: result.progress.journeys,
      file: result.file,
   });
}

/**
 * Keep the shell output actionable while the JSON response preserves structured evidence
 * requirements.
 */
export function renderAssessmentText(envelope: CliOutputEnvelope): string {
   const result = textResultSchema.parse(envelope.result);
   const lines = [
      `Assessment ${result.complete ? 'complete' : 'in progress'}.`,
      `Run: ${result.file}`,
      `Evidence: ${result.evidenceFile}`,
      `Assessed ${result.coverage.assessed} of ${result.coverage.total} checks; ${result.coverage.unresolved} unresolved.`,
   ];
   appendCoverage(lines, result);
   if (result.next) {
      const { check, procedure } = result.next;
      lines.push(
         '',
         `Next: WCAG ${check.criterionId} - ${procedure.title}`,
         `Check: ${check.checkId}`,
         `Environment: ${check.environmentId}`,
         'Setup:',
      );
      lines.push(...procedure.setup.map((step) => `  * ${step}`));
      lines.push('Actions:');
      lines.push(...procedure.actions.map((step) => `  * ${step}`));
      lines.push(`Required evidence: ${procedure.requiredEvidence.join(', ')}`);
   }
   lines.push('', result.guidance);
   return lines.join('\n');
}

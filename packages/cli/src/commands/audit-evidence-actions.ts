import {
   evidenceModeSchema,
   evidenceOutcomeSchema,
   type EvidenceMode,
   type EvidenceOutcome,
   type EvidenceRecord,
} from '#contracts';
import { CliUsageError } from '#core';

import { resolvePageTarget } from '../lib/resolvers.js';
import type { CommandExecution } from '../lib/helpers.js';

/** The procedure recorded when the criterion's strategy names none. */
const DEFAULT_PROCEDURE_ID = 'manual_review';

/**
 * The strategy artifact names `axe_scan` for a criterion axe already covers. A person
 * recording a result did not run axe, so storing their outcome under `axe_scan` would put
 * a human judgment into the report as an automated one.
 */
const AUTOMATED_PROCEDURE_ID = 'axe_scan';

export interface EvidenceActionOptions {
   criterion?: string;
   outcome?: string;
   procedure?: string;
   mode?: string;
   pointer?: string;
   note?: string;
   by?: string;
   results?: string;
   level?: string;
   wcag?: string;
   json?: boolean;
   verbose?: boolean;
   timeout?: string;
   html?: string;
}

function parseOutcome(value: string | undefined): EvidenceOutcome {
   const parsed = evidenceOutcomeSchema.safeParse(value);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         'Provide --outcome: passed, failed, cantTell, or inapplicable.',
         { field: 'outcome', value: value ?? undefined },
      );
   }
   return parsed.data;
}

function parseMode(value: string | undefined): EvidenceMode {
   if (value === undefined) {
      return 'semiAutomatic';
   }
   const parsed = evidenceModeSchema.safeParse(value);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         'Provide --mode: manual or semiAutomatic.',
         { field: 'mode', value },
      );
   }
   return parsed.data;
}

function requireCriterion(value: string | undefined): string {
   if (!value) {
      throw new CliUsageError(
         'validation-error',
         'Provide --criterion, such as --criterion 2.4.4.',
         { field: 'criterion' },
      );
   }
   return value;
}

/**
 * Resolves the target the same way `a1 audit` does, then keys on the canonical string.
 * Without this, `https://x.com` and `https://x.com/` record against different keys and
 * the recorded result silently never reaches the report.
 */
async function resolveSubject(
   target: string | undefined,
   options: EvidenceActionOptions,
): Promise<string> {
   const { stripFragment } = await import('#core');
   const resolved = await resolvePageTarget({
      ...(target === undefined ? {} : { target }),
      ...(options.html === undefined ? {} : { html: options.html }),
   });
   return stripFragment(resolved.reportTarget.resolvedUrl);
}

function buildRecord(input: {
   subject: string;
   criterionId: string;
   procedureId: string;
   options: EvidenceActionOptions;
}): EvidenceRecord {
   const { options } = input;
   const record: EvidenceRecord = {
      subject: input.subject,
      criterionId: input.criterionId,
      procedureId: input.procedureId,
      outcome: parseOutcome(options.outcome),
      mode: parseMode(options.mode),
      recordedAt: new Date().toISOString(),
   };

   return {
      ...record,
      ...(options.pointer === undefined ? {} : { pointer: options.pointer }),
      ...(options.note === undefined ? {} : { note: options.note }),
      ...(options.by === undefined ? {} : { assertedBy: options.by }),
   };
}

/** Picks the procedure named on the flag, else the first one a person can perform. */
async function resolveProcedureId(
   criterionId: string,
   options: EvidenceActionOptions,
): Promise<string> {
   if (options.procedure) {
      return options.procedure;
   }

   const { getCoverage, WcagEngineNotFoundError } = await import('@a11ied/wcag-engine');
   try {
      const lookupOptions = options.wcag === undefined ? {} : { version: options.wcag };
      const { procedureIds } = getCoverage(criterionId, lookupOptions).strategy;
      const performable = procedureIds.find((id) => id !== AUTOMATED_PROCEDURE_ID);
      return performable ?? DEFAULT_PROCEDURE_ID;
   } catch (error) {
      if (error instanceof WcagEngineNotFoundError) {
         throw new CliUsageError(
            'validation-error',
            `No WCAG criterion "${criterionId}".`,
            { field: 'criterion', value: criterionId },
         );
      }
      throw error;
   }
}

/** Records one result for a check a11ied cannot automate. */
export async function handleRecordAction(
   target: string | undefined,
   options: EvidenceActionOptions,
): Promise<CommandExecution> {
   const { appendEvidence } = await import('#core');
   const criterionId = requireCriterion(options.criterion);
   const subject = await resolveSubject(target, options);
   const record = buildRecord({
      subject,
      criterionId,
      procedureId: await resolveProcedureId(criterionId, options),
      options,
   });
   const file = await appendEvidence(record, { file: options.results });

   return {
      target: { kind: 'url', value: subject },
      result: { record, file },
   };
}

/** Lists criteria for one target that still need a person. */
export async function handlePendingAction(
   target: string | undefined,
   options: EvidenceActionOptions,
): Promise<CommandExecution> {
   const { listPendingCriteria } = await import('#core');
   const subject = await resolveSubject(target, options);
   const pending = await listPendingCriteria({
      subject,
      file: options.results,
      level: options.level,
      wcagVersion: options.wcag,
   });

   return {
      target: { kind: 'url', value: subject },
      result: { subject, pending, count: pending.length },
   };
}

/** Drops recorded results for one target. */
export async function handleClearAction(
   target: string | undefined,
   options: EvidenceActionOptions,
): Promise<CommandExecution> {
   const { clearEvidence } = await import('#core');
   const subject = await resolveSubject(target, options);
   const removed = await clearEvidence(subject, { file: options.results });

   return {
      target: { kind: 'url', value: subject },
      result: { subject, removed },
   };
}

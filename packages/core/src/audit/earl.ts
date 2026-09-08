import type {
   EarlAssertionInput,
   EarlProfile,
   EarlReport,
   EvidenceRecord,
} from '@a11ied/contracts';
import { buildEarlReport } from '@a11ied/earl';
import { getCriterion, WcagEngineNotFoundError } from '@a11ied/wcag-engine';

import { buildA11iedAssertor, listAxeEarlAssertions } from '../axe/earl.js';
import type { AuditReport } from './runtime.js';

/** EARL writes a success criterion as its slug, and the report stores its number. */
function listCriterionSlug(criterionId: string, wcagVersion: string): string[] {
   try {
      return [getCriterion(criterionId, { version: wcagVersion }).criterion.slug];
   } catch (error) {
      if (error instanceof WcagEngineNotFoundError) {
         return [];
      }
      throw error;
   }
}

function toAssertion(record: EvidenceRecord, wcagVersion: string): EarlAssertionInput {
   const assertion: EarlAssertionInput = {
      subject: record.subject,
      outcome: record.outcome,
      mode: record.mode,
      procedure: {
         title: record.procedureId,
         criterionSlugs: listCriterionSlug(record.criterionId, wcagVersion),
      },
   };

   if (record.pointer === undefined) {
      return assertion;
   }
   return { ...assertion, pointer: record.pointer };
}

export interface AuditEarlReportOptions {
   profile: EarlProfile;
   version: string;
}

/**
 * Builds one EARL 1.0 report holding both what axe decided and what a person or an agent
 * recorded, for `a1 audit --format earl`.
 *
 * A recorded result keeps its own `mode`, `earl:manual` or `earl:semiAutomatic`, so a
 * reader can tell a human judgment from an automated one. Its `test.title` is the
 * procedure that was performed, not an axe rule id.
 */
export function buildAuditEarlReport(
   report: AuditReport,
   options: AuditEarlReportOptions,
): EarlReport {
   const wcagVersion = report.axe.wcagVersion;

   return buildEarlReport({
      assertions: [
         ...listAxeEarlAssertions(report.axe, options.profile),
         ...report.recorded.map((record) => toAssertion(record, wcagVersion)),
      ],
      assertor: buildA11iedAssertor(options.version),
   });
}

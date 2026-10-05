import type {
   EvidenceRecord,
   EvidenceStrategy,
   PendingCriterion,
} from '@a11ied/contracts';
import {
   getTestMethod,
   listCriteriaByLevel,
   WcagEngineNotFoundError,
} from '@a11ied/wcag-engine';

import { readEvidenceForSubject, type EvidenceStoreOptions } from './store.js';
import { getCriterionEvidence } from './criteria.js';
import { isVerifiedEvidence } from './validation.js';

const LEVELS = ['A', 'AA', 'AAA'] as const;

/**
 * The criterion ids with a recorded result for one target.
 *
 * A pattern row result is skipped, so a judgment about one row of an ARIA example never
 * counts as coverage of a success criterion.
 */
export function listRecordedCriterionIds(records: EvidenceRecord[]): Set<string> {
   const ids = new Set<string>();
   for (const record of records) {
      if (record.test.kind === 'criterion' && isVerifiedEvidence(record)) {
         ids.add(record.test.criterionId);
      }
   }
   return ids;
}

/** A criterion axe cannot decide on its own needs a person or an agent. */
function needsAPerson(evidenceMode: string): boolean {
   return evidenceMode !== 'automated';
}

function readStrategy(
   criterionId: string,
   version: string,
): EvidenceStrategy | undefined {
   try {
      return getTestMethod(criterionId, { version }).strategy;
   } catch (error) {
      if (error instanceof WcagEngineNotFoundError) {
         return undefined;
      }
      throw error;
   }
}

function buildPending(input: {
   criterionId: string;
   title: string;
   level: string;
   records: EvidenceRecord[];
   version: string;
}): PendingCriterion | undefined {
   const strategy = readStrategy(input.criterionId, input.version);
   if (!strategy || !needsAPerson(strategy.preferredEvidenceMode)) {
      return undefined;
   }
   const { pendingProcedureIds } = getCriterionEvidence({
      criterionId: input.criterionId,
      records: input.records,
      strategy,
   });
   if (pendingProcedureIds.length === 0) {
      return undefined;
   }

   return {
      criterionId: input.criterionId,
      title: input.title,
      level: input.level,
      evidenceMode: strategy.preferredEvidenceMode,
      procedureIds: pendingProcedureIds,
   };
}

export interface ListPendingCriteriaInput extends EvidenceStoreOptions {
   subject: string;
   /** Restrict to one conformance level. Omit to list A, AA, and AAA. */
   level?: string | undefined;
   wcagVersion?: string | undefined;
}

/**
 * Lists criteria for one target that still have unrecorded manual procedures.
 *
 * This reads the WCAG strategy artifact and the evidence file. It never opens a browser,
 * so an agent can call it between checks without paying for a page load. `a1 audit`
 * answers a different question, what axe found, and it does load the page.
 */
export async function listPendingCriteria(
   input: ListPendingCriteriaInput,
): Promise<PendingCriterion[]> {
   const records = await readEvidenceForSubject(input.subject, input);
   const levels = input.level ? [input.level] : [...LEVELS];
   const version = input.wcagVersion ?? '2.2';

   return levels
      .flatMap((level) => listCriteriaByLevel(level, version).criteria)
      .flatMap((criterion) => {
         const pending = buildPending({
            criterionId: criterion.id,
            title: criterion.title,
            level: criterion.level,
            records,
            version,
         });
         return pending ? [pending] : [];
      });
}

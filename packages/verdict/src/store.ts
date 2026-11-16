import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
   verdictSchema,
   type PageVerdict,
   type CriterionId,
   type Verdict,
   type VerdictImpact,
} from '@a11ied/contracts';

import { isAcceptedVerdict } from './admission-state.js';
import { WCAG_22_AA_CRITERIA } from './criteria.js';
import { listReviewObligations } from './obligations.js';
import { appendLine, withPathLock, writeAtomic } from '@a11ied/observe';

import { listLatestVerdicts } from './verdict-identity.js';
export { computeVerdictId, listLatestVerdicts } from './verdict-identity.js';

export function getVerdictStorePath(runDir: string): string {
   return join(resolve(runDir), 'verdicts.jsonl');
}

/** Append a proposal; persistence alone never establishes evidence acceptance. */
export async function recordVerdict(runDir: string, verdict: Verdict): Promise<Verdict> {
   const validated = verdictSchema.parse(verdict);
   await appendLine(getVerdictStorePath(runDir), validated);
   return validated;
}

function parseVerdictJournal(body: string): { records: Verdict[]; interrupted: boolean } {
   const records: Verdict[] = [];
   let interrupted = false;
   const lines = body.split('\n');
   for (const [index, line] of lines.entries()) {
      if (line.trim() === '') {
         continue;
      }
      try {
         records.push(verdictSchema.parse(JSON.parse(line)));
      } catch (error) {
         if (
            !(error instanceof SyntaxError) ||
            index !== lines.length - 1 ||
            body.endsWith('\n')
         ) {
            throw error;
         }
         interrupted = true;
      }
   }
   return { records, interrupted };
}

/**
 * Read the JSONL store; the latest record per check key wins. Missing file reads as
 * empty.
 */
export async function readVerdicts(runDir: string): Promise<Verdict[]> {
   const path = getVerdictStorePath(runDir);
   return withPathLock(path, async () => {
      let body = '';
      try {
         body = await readFile(path, 'utf8');
      } catch (error) {
         if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return [];
         }
         throw error;
      }

      const { interrupted, records } = parseVerdictJournal(body);
      if (interrupted) {
         const prefix = body.slice(0, body.lastIndexOf('\n') + 1);
         await writeAtomic(
            join(runDir, `verdicts-interrupted-${randomUUID()}.jsonl`),
            body,
         );
         await writeAtomic(path, prefix);
      } else if (body && !body.endsWith('\n')) {
         await writeAtomic(path, `${body}\n`);
      }
      return listLatestVerdicts(records);
   });
}

const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const;

/**
 * `cantTell` counts with `needsReview`: both are unresolved and need human or native-SR
 * judgment.
 */
function isNeedsReviewVerdict(verdict: Verdict): boolean {
   return verdict.outcome === 'needsReview' || verdict.outcome === 'cantTell';
}

function computeHighestImpact(candidates: readonly Verdict[]): VerdictImpact | undefined {
   let highest: VerdictImpact | undefined = undefined;
   for (const verdict of candidates) {
      if (verdict.impact === undefined) {
         continue;
      }
      if (
         highest === undefined ||
         IMPACT_ORDER.indexOf(verdict.impact) < IMPACT_ORDER.indexOf(highest)
      ) {
         highest = verdict.impact;
      }
   }
   return highest;
}

interface PageVerdictStateInput {
   stateId: string;
   targetUrl: string;
   excluded?: boolean | undefined;
}

interface PageVerdictStatusInput {
   state: PageVerdictStateInput;
   verdicts: readonly Verdict[];
   failingCount: number;
   needsReviewCount: number;
   excludedCount: number;
   totalChecks: number;
}

function computePageStatus({
   state,
   verdicts,
   failingCount,
   needsReviewCount,
   excludedCount,
   totalChecks,
}: PageVerdictStatusInput): PageVerdict['status'] {
   const allVerdictsExcluded = totalChecks > 0 && excludedCount === totalChecks;
   if (state.excluded || allVerdictsExcluded) {
      return 'excluded';
   }
   if (verdicts.length === 0) {
      return 'unstarted';
   }
   if (failingCount > 0) {
      return 'failing';
   }
   if (needsReviewCount > 0) {
      return 'passing-so-far';
   }
   return 'passed';
}

/** Compute one page verdict per state from all verdicts recorded across the run. */
export function computePageVerdicts(
   states: readonly {
      stateId: string;
      targetUrl: string;
      excluded?: boolean | undefined;
   }[],
   verdicts: readonly Verdict[],
   criterionIds: readonly CriterionId[] = WCAG_22_AA_CRITERIA,
): PageVerdict[] {
   const currentVerdicts = listLatestVerdicts(verdicts);
   const obligations = listReviewObligations({
      states,
      verdicts: currentVerdicts,
      criterionIds,
   });
   return states.map((state) => {
      const stateVerdicts = currentVerdicts.filter(
         (verdict) =>
            verdict.stateId === state.stateId &&
            criterionIds.includes(verdict.criterionId),
      );
      const failingVerdicts = stateVerdicts.filter(
         (verdict) => verdict.outcome === 'failed' && isAcceptedVerdict(verdict, state),
      );
      const stateObligations = obligations.filter(
         (obligation) => obligation.stateId === state.stateId,
      );
      const needsReviewCount = stateObligations.filter(
         (obligation) => !obligation.complete,
      ).length;
      const excludedCount = stateObligations.filter(
         (obligation) => obligation.complete && obligation.outcome === 'excluded',
      ).length;
      const passedCount = stateObligations.filter(
         (obligation) => obligation.complete && obligation.outcome === 'passed',
      ).length;

      const highestImpact = computeHighestImpact([
         ...failingVerdicts,
         ...stateVerdicts.filter((verdict) => isNeedsReviewVerdict(verdict)),
      ]);
      const status = computePageStatus({
         state,
         verdicts: stateVerdicts,
         failingCount: failingVerdicts.length,
         needsReviewCount,
         excludedCount,
         totalChecks: stateObligations.length,
      });

      return {
         stateId: state.stateId,
         targetUrl: state.targetUrl,
         status,
         failingCount: failingVerdicts.length,
         passedCount,
         needsReviewCount,
         excludedCount,
         highestImpact,
      };
   });
}

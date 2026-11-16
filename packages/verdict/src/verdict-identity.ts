import { createHash } from 'node:crypto';
import type { Verdict } from '@a11ied/contracts';

const VERDICT_ID_HASH_LENGTH = 16;

export function computeVerdictId(input: {
   criterionId: string;
   stateId: string;
   procedureId?: string;
}): string {
   const digest = createHash('sha256')
      .update(`${input.criterionId}|${input.stateId}|${input.procedureId ?? ''}`)
      .digest('hex')
      .slice(0, VERDICT_ID_HASH_LENGTH);
   return `v-${digest}`;
}

/**
 * Key of one check: criterion + state + procedure, matching the idempotence contract
 * (FR-1).
 */
function getVerdictCheckKey(verdict: Verdict): string {
   return JSON.stringify([
      verdict.criterionId,
      verdict.stateId,
      verdict.procedureId ?? '',
   ]);
}

export function listLatestVerdicts(verdicts: readonly Verdict[]): Verdict[] {
   const latest = new Map<string, Verdict>();
   for (const verdict of verdicts) {
      const key = getVerdictCheckKey(verdict);
      latest.delete(key);
      latest.set(key, verdict);
   }
   return [...latest.values()];
}

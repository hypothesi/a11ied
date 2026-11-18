import { addEvent, run, selectAll, type Audit } from './db.js';
import { priorResultRowSchema } from './rows.js';
import type { z } from 'zod';

export type PriorResult = z.infer<typeof priorResultRowSchema>;

/**
 * Puts a unit back in the queue with a fresh attempt count. Its recorded outcomes move to
 * priorResults, replacing any older set, so the next worker can start from them instead
 * of from nothing. Callers hold the transaction.
 */
export function resetUnit(
   audit: Audit,
   input: { unitId: string; actor: string; reason: string },
): void {
   run(
      audit,
      'DELETE FROM priorResults WHERE unitId = ? AND EXISTS (SELECT 1 FROM results WHERE unitId = ?)',
      input.unitId,
      input.unitId,
   );
   run(
      audit,
      'INSERT INTO priorResults (unitId, criterion, outcome, note, worker, recordedAt, reopenReason) SELECT unitId, criterion, outcome, note, worker, recordedAt, ? FROM results WHERE unitId = ?',
      input.reason,
      input.unitId,
   );
   run(audit, 'DELETE FROM results WHERE unitId = ?', input.unitId);
   run(audit, 'DELETE FROM states WHERE unitId = ?', input.unitId);
   run(
      audit,
      "UPDATE units SET status = 'pending', worker = NULL, leaseExpiresAt = NULL, attempts = 0, finishedAt = NULL, reason = '', summary = '' WHERE id = ?",
      input.unitId,
   );
   addEvent(audit, {
      actor: input.actor,
      type: 'unit-reopened',
      unitId: input.unitId,
      message: `Reopened ${input.unitId}: ${input.reason}`,
   });
}

/** The outcomes a unit had before it was last reopened, or none. */
export function listPriorResults(audit: Audit, unitID: string): PriorResult[] {
   return selectAll(
      audit,
      priorResultRowSchema,
      'SELECT criterion, outcome, note, worker, recordedAt, reopenReason FROM priorResults WHERE unitId = ? ORDER BY criterion',
      unitID,
   );
}

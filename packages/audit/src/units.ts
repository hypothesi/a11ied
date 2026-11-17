import {
   addEvent,
   run,
   selectAll,
   selectOne,
   SQL_NULL,
   transact,
   type Audit,
} from './db.js';
import { AuditError } from './errors.js';
import { TEST_PASSES } from './passes.js';
import { unitRowSchema } from './rows.js';
import type { Unit } from './schema.js';
import { SITE_PAGE_ID } from './pages.js';

/** How long a claim lasts without any sign of life from its worker. */
export const DEFAULT_LEASE_MINUTES = 20;

/** A unit abandoned this many times is blocked for a person to look at. */
export const MAX_ATTEMPTS = 3;

const MS_PER_MINUTE = 60_000;
const UNIT_COLUMNS =
   'u.id, u.pageId, u.pass, u.criteria, u.status, u.worker, u.leaseExpiresAt, u.attempts, u.startedAt, u.finishedAt, u.reason, u.summary';
const ACTIVE_UNITS = `SELECT ${UNIT_COLUMNS} FROM units u JOIN pages s ON s.id = u.pageId WHERE s.status = 'active'`;

export interface ClaimRequest {
   worker: string;
   /** Only claim units in these passes. */
   passes?: readonly string[] | undefined;
   /** Never claim units in these passes. */
   excludePasses?: readonly string[] | undefined;
   /** Only claim units on this page. */
   pageId?: string | undefined;
   /** Claim this exact unit. */
   unitId?: string | undefined;
   leaseMinutes?: number | undefined;
}

/** Lists the units that count toward the audit: those on pages still in scope. */
export function listUnits(audit: Audit): Unit[] {
   return selectAll(audit, unitRowSchema, `${ACTIVE_UNITS} ORDER BY s.seq, u.id`);
}

export function getUnit(audit: Audit, unitId: string): Unit {
   const unit = selectOne(
      audit,
      unitRowSchema,
      `SELECT ${UNIT_COLUMNS} FROM units u WHERE u.id = ?`,
      unitId,
   );
   if (!unit) {
      throw new AuditError(
         'unit-not-found',
         `No unit "${unitId}". Run a1 audit status --units to list them.`,
      );
   }
   return unit;
}

function leaseEnd(audit: Audit, minutes: number): string {
   return new Date(audit.now().getTime() + minutes * MS_PER_MINUTE).toISOString();
}

/**
 * Returns units whose worker went quiet to the queue. A unit that has been abandoned
 * `MAX_ATTEMPTS` times is blocked instead, because something about it defeats workers.
 */
export function recoverExpiredLeases(audit: Audit): Unit[] {
   const nowIso = audit.now().toISOString();
   const expired = listUnits(audit).filter(
      (unit) =>
         unit.status === 'claimed' &&
         unit.leaseExpiresAt !== null &&
         unit.leaseExpiresAt < nowIso,
   );
   for (const unit of expired) {
      const exhausted = unit.attempts >= MAX_ATTEMPTS;
      const reason = exhausted
         ? `Abandoned ${String(unit.attempts)} times: each worker's lease expired without a submission. Check the activity log before reopening.`
         : '';
      run(
         audit,
         'UPDATE units SET status = ?, worker = NULL, leaseExpiresAt = NULL, reason = ? WHERE id = ?',
         exhausted ? 'blocked' : 'pending',
         reason,
         unit.id,
      );
      addEvent(audit, {
         actor: 'system',
         type: exhausted ? 'unit-blocked' : 'lease-expired',
         unitId: unit.id,
         message: exhausted
            ? `${unit.id} blocked after ${String(unit.attempts)} abandoned attempts`
            : `${unit.id} returned to the queue: ${unit.worker ?? 'worker'} stopped responding`,
      });
   }
   return expired;
}

function matchesRequest(unit: Unit, request: ClaimRequest): boolean {
   if (request.unitId !== undefined) {
      return unit.id === request.unitId;
   }
   if (request.pageId !== undefined && unit.pageId !== request.pageId) {
      return false;
   }
   if (
      request.passes &&
      request.passes.length > 0 &&
      !request.passes.includes(unit.pass)
   ) {
      return false;
   }
   return !(request.excludePasses ?? []).includes(unit.pass);
}

function passOrder(passId: string): number {
   return TEST_PASSES.findIndex((pass) => pass.id === passId);
}

/**
 * Picks the pending unit a worker should take: stay on the page it just worked on,
 * otherwise spread workers across pages, and leave site-wide units until last.
 */
function choosePending(units: Unit[], request: ClaimRequest): Unit | undefined {
   const lastPage = units
      .filter((unit) => unit.worker === request.worker && unit.finishedAt !== null)
      .toSorted((left, right) =>
         (right.finishedAt ?? '').localeCompare(left.finishedAt ?? ''),
      )[0]?.pageId;
   const busy = new Map<string, number>();
   for (const unit of units) {
      if (unit.status === 'claimed') {
         busy.set(unit.pageId, (busy.get(unit.pageId) ?? 0) + 1);
      }
   }
   const rank = (unit: Unit): number[] => [
      unit.pageId === SITE_PAGE_ID ? 1 : 0,
      unit.pageId === lastPage ? 0 : 1,
      busy.get(unit.pageId) ?? 0,
      units.findIndex((each) => each.pageId === unit.pageId),
      passOrder(unit.pass),
   ];
   return units
      .filter((unit) => unit.status === 'pending' && matchesRequest(unit, request))
      .toSorted((left, right) => {
         const leftRank = rank(left);
         const rightRank = rank(right);
         const index = leftRank.findIndex((value, at) => value !== rightRank[at]);
         return index === -1 ? 0 : (leftRank[index] ?? 0) - (rightRank[index] ?? 0);
      })[0];
}

function assertClaimable(unit: Unit, request: ClaimRequest): void {
   if (unit.status === 'pending' || unit.worker === request.worker) {
      return;
   }
   const detail =
      unit.status === 'claimed'
         ? `claimed by ${unit.worker ?? 'another worker'}`
         : unit.status;
   throw new AuditError(
      'unit-unavailable',
      `${unit.id} is ${detail}. Use a1 audit reopen ${unit.id} to run it again.`,
   );
}

/**
 * Hands a worker its next unit. A worker that already holds a unit gets that unit back,
 * so a worker that lost its context resumes instead of starting something new.
 */
export function claimNext(audit: Audit, request: ClaimRequest): Unit | undefined {
   return transact(audit, () => {
      recoverExpiredLeases(audit);
      const units = listUnits(audit);
      if (request.unitId !== undefined) {
         assertClaimable(getUnit(audit, request.unitId), request);
      }
      const held = units.find(
         (unit) =>
            unit.status === 'claimed' &&
            unit.worker === request.worker &&
            (request.unitId === undefined || unit.id === request.unitId),
      );
      const chosen = held ?? choosePending(units, request);
      if (!chosen) {
         return;
      }
      const startedAt = audit.now().toISOString();
      run(
         audit,
         "UPDATE units SET status = 'claimed', worker = ?, leaseExpiresAt = ?, attempts = attempts + ?, startedAt = COALESCE(?, startedAt), reason = '' WHERE id = ?",
         request.worker,
         leaseEnd(audit, request.leaseMinutes ?? DEFAULT_LEASE_MINUTES),
         held ? 0 : 1,
         held ? SQL_NULL : startedAt,
         chosen.id,
      );
      addEvent(audit, {
         actor: request.worker,
         type: held ? 'unit-resumed' : 'unit-claimed',
         unitId: chosen.id,
         message: held ? `Resumed ${chosen.id}` : `Claimed ${chosen.id}`,
      });
      return getUnit(audit, chosen.id);
   });
}

/** Fails unless `worker` currently holds the unit. */
export function assertHeldBy(unit: Unit, worker: string): void {
   if (unit.status === 'claimed' && unit.worker === worker) {
      return;
   }
   const holder =
      unit.status === 'claimed'
         ? `claimed by ${unit.worker ?? 'another worker'}`
         : unit.status;
   throw new AuditError(
      'unit-not-held',
      `${unit.id} is ${holder}, not claimed by ${worker}. Run a1 audit next --worker ${worker} to get your current unit.`,
   );
}

/** Extends a worker's lease and optionally logs what it is doing. */
export function reportProgress(
   audit: Audit,
   input: { unitId: string; worker: string; message?: string | undefined },
   leaseMinutes = DEFAULT_LEASE_MINUTES,
): Unit {
   return transact(audit, () => {
      assertHeldBy(getUnit(audit, input.unitId), input.worker);
      run(
         audit,
         'UPDATE units SET leaseExpiresAt = ? WHERE id = ?',
         leaseEnd(audit, leaseMinutes),
         input.unitId,
      );
      if (input.message) {
         addEvent(audit, {
            actor: input.worker,
            type: 'progress',
            unitId: input.unitId,
            message: input.message,
         });
      }
      return getUnit(audit, input.unitId);
   });
}

/** Parks a unit that needs a person: a login, a missing build, an unauthorized action. */
export function blockUnit(
   audit: Audit,
   input: { unitId: string; actor: string; reason: string },
): Unit {
   return transact(audit, () => {
      const unit = getUnit(audit, input.unitId);
      if (unit.status === 'done') {
         throw new AuditError('unit-done', `${unit.id} is already done.`);
      }
      run(
         audit,
         "UPDATE units SET status = 'blocked', worker = NULL, leaseExpiresAt = NULL, reason = ? WHERE id = ?",
         input.reason,
         unit.id,
      );
      addEvent(audit, {
         actor: input.actor,
         type: 'unit-blocked',
         unitId: unit.id,
         message: `Blocked ${unit.id}: ${input.reason}`,
      });
      return getUnit(audit, unit.id);
   });
}

/**
 * Puts a unit back in the queue with a fresh attempt count. Reopening a finished unit
 * discards its recorded outcomes; its findings stay for the next worker to confirm.
 */
export function reopenUnit(
   audit: Audit,
   input: { unitId: string; actor: string; reason: string },
): Unit {
   return transact(audit, () => {
      const unit = getUnit(audit, input.unitId);
      run(audit, 'DELETE FROM results WHERE unitId = ?', unit.id);
      run(
         audit,
         "UPDATE units SET status = 'pending', worker = NULL, leaseExpiresAt = NULL, attempts = 0, finishedAt = NULL, reason = '', summary = '' WHERE id = ?",
         unit.id,
      );
      addEvent(audit, {
         actor: input.actor,
         type: 'unit-reopened',
         unitId: unit.id,
         message: `Reopened ${unit.id}: ${input.reason}`,
      });
      return getUnit(audit, unit.id);
   });
}

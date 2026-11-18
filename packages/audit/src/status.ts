import { getConfig, selectAll, type Audit } from './db.js';
import { failsCriterion, listFindings, type FindingRecord } from './findings.js';
import { TEST_PASSES } from './passes.js';
import { eventRowSchema, resultRowSchema } from './rows.js';
import type {
   AuditConfig,
   AuditEvent,
   CriterionResult,
   Outcome,
   Severity,
   AuditPage,
   Unit,
   UnitStatus,
} from './schema.js';
import { listActivePages, listPages } from './pages.js';
import { listUnits } from './units.js';

const DEFAULT_EVENT_LIMIT = 15;
const MS_PER_MINUTE = 60_000;
const PERCENT = 100;
const MIN_UNITS_FOR_ETA = 3;
const MEDIAN_DIVISOR = 2;

/**
 * Where one criterion stands across the audit. `pending` means work remains, and
 * `not-evaluated` means no unit covers it, for example a cross-page criterion in an audit
 * of a single page.
 */
export type CriterionStanding = Outcome | 'pending' | 'not-evaluated';

export interface PageOutcome {
   pageId: string;
   criterion: string;
   outcome: Outcome | 'pending';
   note: string;
   unitId: string;
}

export interface CriterionRollup {
   criterion: string;
   standing: CriterionStanding;
   pages: PageOutcome[];
   findingIds: string[];
}

export interface WorkerActivity {
   worker: string;
   unitId: string;
   minutesActive: number;
   leaseMinutesLeft: number;
}

export interface PassProgress {
   pass: string;
   title: string;
   total: number;
   done: number;
   claimed: number;
   blocked: number;
   pending: number;
}

export interface AuditStatus {
   config: AuditConfig;
   dir: string;
   phase: 'setup' | 'in-progress' | 'needs-attention' | 'complete';
   pages: { active: number; excluded: number };
   units: Record<UnitStatus, number> & { total: number; percentDone: number };
   passes: PassProgress[];
   workers: WorkerActivity[];
   blocked: Unit[];
   findings: Record<Severity, number> & { total: number };
   criteria: Record<CriterionStanding, number> & { total: number };
   /** Estimated minutes left at the recent completion rate, when it can be estimated. */
   etaMinutes: number | undefined;
   recentEvents: AuditEvent[];
}

export function listResults(audit: Audit): CriterionResult[] {
   return selectAll(
      audit,
      resultRowSchema,
      "SELECT r.pageId, r.criterion, r.outcome, r.note, r.unitId, r.worker, r.recordedAt FROM results r JOIN pages s ON s.id = r.pageId WHERE s.status = 'active'",
   );
}

export function listEvents(
   audit: Audit,
   options: { limit?: number; unitId?: string | undefined } = {},
): AuditEvent[] {
   const limit = options.limit ?? DEFAULT_EVENT_LIMIT;
   const rows =
      options.unitId === undefined
         ? selectAll(
              audit,
              eventRowSchema,
              'SELECT id, at, actor, type, unitId, message FROM events ORDER BY id DESC LIMIT ?',
              limit,
           )
         : selectAll(
              audit,
              eventRowSchema,
              'SELECT id, at, actor, type, unitId, message FROM events WHERE unitId = ? ORDER BY id DESC LIMIT ?',
              options.unitId,
              limit,
           );
   return rows.toReversed();
}

/**
 * Works out each criterion's outcome on each page. An open finding always means fail,
 * even before the owning unit is finished or when its worker recorded something else.
 */
export function listPageOutcomes(audit: Audit): PageOutcome[] {
   const results = listResults(audit);
   const findings = listFindings(audit);
   return listUnits(audit).flatMap((unit) =>
      unit.criteria.map((criterion) => {
         const result = results.find(
            (each) => each.pageId === unit.pageId && each.criterion === criterion,
         );
         const hasOpenFinding = findings.some(
            (finding) =>
               failsCriterion(finding, criterion) &&
               finding.open.some((instance) => instance.pageId === unit.pageId),
         );
         return {
            pageId: unit.pageId,
            criterion,
            outcome: hasOpenFinding ? ('fail' as const) : (result?.outcome ?? 'pending'),
            note: result?.note ?? '',
            unitId: unit.id,
         };
      }),
   );
}

function rollUp(outcomes: readonly PageOutcome[]): CriterionStanding {
   const present = new Set<CriterionStanding>(outcomes.map((each) => each.outcome));
   const order: CriterionStanding[] = [
      'fail',
      'pending',
      'cannot-tell',
      'pass',
      'not-applicable',
   ];
   return order.find((standing) => present.has(standing)) ?? 'not-evaluated';
}

/** Rolls page outcomes up to one standing per criterion in scope. */
export function listCriterionRollups(audit: Audit): CriterionRollup[] {
   const outcomes = listPageOutcomes(audit);
   const findings = listFindings(audit);
   return getConfig(audit).criteria.map((criterion) => {
      const pages = outcomes.filter((each) => each.criterion === criterion);
      return {
         criterion,
         standing: rollUp(pages),
         pages,
         findingIds: findings
            .filter((finding) => failsCriterion(finding, criterion))
            .map((finding) => finding.id),
      };
   });
}

function countUnits(units: readonly Unit[]): AuditStatus['units'] {
   const count = (status: UnitStatus): number =>
      units.filter((unit) => unit.status === status).length;
   const done = count('done');
   return {
      total: units.length,
      pending: count('pending'),
      claimed: count('claimed'),
      done,
      blocked: count('blocked'),
      percentDone: units.length === 0 ? 0 : Math.round((done / units.length) * PERCENT),
   };
}

function countFindings(findings: readonly FindingRecord[]): AuditStatus['findings'] {
   const count = (severity: Severity): number =>
      findings.filter((finding) => finding.severity === severity).length;
   return {
      total: findings.length,
      critical: count('critical'),
      serious: count('serious'),
      moderate: count('moderate'),
      minor: count('minor'),
   };
}

function countCriteria(rollups: readonly CriterionRollup[]): AuditStatus['criteria'] {
   const count = (standing: CriterionStanding): number =>
      rollups.filter((rollup) => rollup.standing === standing).length;
   return {
      total: rollups.length,
      pass: count('pass'),
      fail: count('fail'),
      'not-applicable': count('not-applicable'),
      'cannot-tell': count('cannot-tell'),
      pending: count('pending'),
      'not-evaluated': count('not-evaluated'),
   };
}

function listPassProgress(units: readonly Unit[]): PassProgress[] {
   return TEST_PASSES.map((pass) => {
      const own = units.filter((unit) => unit.pass === pass.id);
      const counts = countUnits(own);
      return {
         pass: pass.id,
         title: pass.title,
         total: counts.total,
         done: counts.done,
         claimed: counts.claimed,
         blocked: counts.blocked,
         pending: counts.pending,
      };
   }).filter((progress) => progress.total > 0);
}

function minutesBetween(from: string | null, to: Date): number {
   return from === null
      ? 0
      : Math.round((to.getTime() - new Date(from).getTime()) / MS_PER_MINUTE);
}

function listWorkers(units: readonly Unit[], now: Date): WorkerActivity[] {
   return units
      .filter((unit) => unit.status === 'claimed')
      .map((unit) => ({
         worker: unit.worker ?? 'unknown',
         unitId: unit.id,
         minutesActive: minutesBetween(unit.startedAt, now),
         leaseMinutesLeft: -minutesBetween(unit.leaseExpiresAt, now),
      }));
}

/**
 * Estimates the minutes left from the median time a finished unit took and the number of
 * workers active now. The median ignores a unit that sat claimed across a long pause.
 * With too few finished units there is no estimate.
 */
function estimateEta(units: readonly Unit[], now: Date): number | undefined {
   const durations = units
      .filter((unit) => unit.status === 'done' && unit.startedAt !== null)
      .map((unit) =>
         Math.max(minutesBetween(unit.startedAt, new Date(unit.finishedAt ?? now)), 1),
      )
      .toSorted((left, right) => left - right);
   const remaining = units.filter(
      (unit) => unit.status === 'pending' || unit.status === 'claimed',
   ).length;
   if (remaining === 0) {
      return 0;
   }
   const median = durations[Math.floor(durations.length / MEDIAN_DIVISOR)];
   if (median === undefined || durations.length < MIN_UNITS_FOR_ETA) {
      return undefined;
   }
   const workers = Math.max(units.filter((unit) => unit.status === 'claimed').length, 1);
   return Math.round((median * remaining) / workers);
}

function resolvePhase(
   units: AuditStatus['units'],
   pages: readonly AuditPage[],
): AuditStatus['phase'] {
   if (pages.length === 0 || units.total === 0) {
      return 'setup';
   }
   if (units.pending + units.claimed > 0) {
      return 'in-progress';
   }
   return units.blocked > 0 ? 'needs-attention' : 'complete';
}

/** Builds the progress picture that `a1 audit status` and the dashboard show. */
export function getAuditStatus(audit: Audit, eventLimit?: number): AuditStatus {
   const now = audit.now();
   const units = listUnits(audit);
   const active = listActivePages(audit);
   const unitCounts = countUnits(units);
   return {
      config: getConfig(audit),
      dir: audit.dir,
      phase: resolvePhase(unitCounts, active),
      pages: {
         active: active.length,
         excluded: listPages(audit).filter((page) => page.status === 'excluded').length,
      },
      units: unitCounts,
      passes: listPassProgress(units),
      workers: listWorkers(units, now),
      blocked: units.filter((unit) => unit.status === 'blocked'),
      findings: countFindings(listFindings(audit)),
      criteria: countCriteria(listCriterionRollups(audit)),
      etaMinutes: estimateEta(units, now),
      recentEvents: listEvents(
         audit,
         eventLimit === undefined ? {} : { limit: eventLimit },
      ),
   };
}

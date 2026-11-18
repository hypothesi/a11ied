import { getConfig, type Audit } from '../db.js';
import { listFindings, SEVERITY_ORDER, type FindingRecord } from '../findings.js';
import { listLimitations } from '../limitations.js';
import { getTestPass } from '../passes.js';
import type { AuditConfig, AuditPage, Unit } from '../schema.js';
import { getCriterionInfo, type CriterionInfo } from '../scope.js';
import {
   getAuditStatus,
   listCriterionRollups,
   type AuditStatus,
   type CriterionStanding,
   type PageOutcome,
} from '../status.js';
import { listPages } from '../pages.js';
import { listPageStates, type PageState } from '../states.js';
import { listUnits } from '../units.js';

export interface ReportOccurrence {
   pageId: string;
   pageName: string;
   location: string;
   detail: string;
   evidence: string[];
}

export interface ReportFinding {
   id: string;
   title: string;
   severity: FindingRecord['severity'];
   criterion: CriterionInfo;
   /** Other criteria the same defect fails. */
   alsoFails: CriterionInfo[];
   description: string;
   impact: string;
   recommendation: string;
   source: FindingRecord['source'];
   occurrences: ReportOccurrence[];
   pageCount: number;
}

export interface ReportCriterion {
   info: CriterionInfo;
   standing: CriterionStanding;
   findingIds: string[];
   outcomes: PageOutcome[];
}

/** Something the audit could not establish, and why. */
export interface ReportGap {
   criterion: string | undefined;
   pageId: string;
   pageName: string;
   reason: string;
}

export interface ReportPage extends AuditPage {
   /** Names of the states some test pass put this page in and judged. */
   statesTested: string[];
   unitsDone: number;
   unitsTotal: number;
   findingCount: number;
}

export type ReportVerdict = 'fails' | 'no-failures' | 'incomplete';

export interface AuditReport {
   config: AuditConfig;
   generatedAt: string;
   /** True when every unit is done. Otherwise the report is interim. */
   final: boolean;
   verdict: ReportVerdict;
   status: AuditStatus;
   findings: ReportFinding[];
   criteria: ReportCriterion[];
   gaps: ReportGap[];
   pages: ReportPage[];
   excluded: AuditPage[];
}

function toReportFinding(
   finding: FindingRecord,
   config: AuditConfig,
   names: ReadonlyMap<string, string>,
): ReportFinding {
   return {
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      criterion: getCriterionInfo(finding.criterion, config.wcagVersion),
      alsoFails: finding.related.map((criterion) =>
         getCriterionInfo(criterion, config.wcagVersion),
      ),
      description: finding.description,
      impact: finding.impact,
      recommendation: finding.recommendation,
      source: finding.source,
      occurrences: finding.open.map((instance) => ({
         pageId: instance.pageId,
         pageName: names.get(instance.pageId) ?? instance.pageId,
         location: instance.location,
         detail: instance.detail,
         evidence: instance.evidence,
      })),
      pageCount: new Set(finding.open.map((instance) => instance.pageId)).size,
   };
}

/** Orders findings by severity, then by how many pages they affect. */
function byPriority(left: ReportFinding, right: ReportFinding): number {
   const severity =
      SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity);
   return severity === 0 ? right.pageCount - left.pageCount : severity;
}

function describeUnfinishedUnit(unit: Unit): string {
   const pass = getTestPass(unit.pass)?.title ?? unit.pass;
   return `"${pass}" was blocked: ${unit.reason}`;
}

function listGaps(
   criteria: readonly ReportCriterion[],
   units: readonly Unit[],
   names: ReadonlyMap<string, string>,
): ReportGap[] {
   const unverified = criteria.flatMap((criterion) =>
      criterion.outcomes
         .filter((outcome) => outcome.outcome === 'cannot-tell')
         .map((outcome) => ({
            criterion: criterion.info.id,
            pageId: outcome.pageId,
            pageName: names.get(outcome.pageId) ?? outcome.pageId,
            reason: outcome.note,
         })),
   );
   const blocked = units
      .filter((unit) => unit.status === 'blocked')
      .map((unit) => ({
         criterion: undefined,
         pageId: unit.pageId,
         pageName: names.get(unit.pageId) ?? unit.pageId,
         reason: `${describeUnfinishedUnit(unit)} Criteria not decided: ${unit.criteria.join(', ')}.`,
      }));
   const waiting = units.filter(
      (unit) => unit.status === 'pending' || unit.status === 'claimed',
   );
   // One line per page keeps an interim report readable while most work is still queued.
   const unfinished = [...new Set(waiting.map((unit) => unit.pageId))].map((pageId) => {
      const passes = waiting
         .filter((unit) => unit.pageId === pageId)
         .map((unit) => unit.pass);
      return {
         criterion: undefined,
         pageId,
         pageName: names.get(pageId) ?? pageId,
         reason: `${String(passes.length)} test ${passes.length === 1 ? 'pass has' : 'passes have'} not been completed: ${passes.join(', ')}.`,
      };
   });
   const uncovered = criteria
      .filter((criterion) => criterion.standing === 'not-evaluated')
      .map((criterion) => ({
         criterion: criterion.info.id,
         pageId: '',
         pageName: 'Whole audit',
         reason:
            getTestPass(criterion.info.pass)?.scope === 'site'
               ? 'Needs at least two pages or screens to compare; this audit covers one.'
               : 'No page in this audit was assigned the test pass that covers it.',
      }));
   return [...unverified, ...blocked, ...unfinished, ...uncovered];
}

/** A state no test pass judged, with the first reason given for leaving it out. */
function listUntestedStateGaps(
   states: readonly PageState[],
   names: ReadonlyMap<string, string>,
): ReportGap[] {
   const tested = new Set(
      states
         .filter((state) => state.tested)
         .map((state) => `${state.pageId}:${state.name}`),
   );
   const seen = new Set<string>();
   return states.flatMap((state) => {
      const key = `${state.pageId}:${state.name}`;
      if (state.tested || tested.has(key) || seen.has(key)) {
         return [];
      }
      seen.add(key);
      return [
         {
            criterion: undefined,
            pageId: state.pageId,
            pageName: names.get(state.pageId) ?? state.pageId,
            reason: `State "${state.name}" was not tested: ${state.note}`,
         },
      ];
   });
}

function toReportPage(
   page: AuditPage,
   context: {
      units: readonly Unit[];
      findings: readonly ReportFinding[];
      states: readonly PageState[];
   },
): ReportPage {
   const { units, findings, states } = context;
   const own = units.filter((unit) => unit.pageId === page.id);
   return {
      ...page,
      statesTested: [
         ...new Set(
            states
               .filter((state) => state.pageId === page.id && state.tested)
               .map((state) => state.name),
         ),
      ],
      unitsDone: own.filter((unit) => unit.status === 'done').length,
      unitsTotal: own.length,
      findingCount: findings.filter((finding) =>
         finding.occurrences.some((occurrence) => occurrence.pageId === page.id),
      ).length,
   };
}

function resolveVerdict(status: AuditStatus): ReportVerdict {
   if (status.criteria.fail > 0) {
      return 'fails';
   }
   const undecided =
      status.criteria.pending +
      status.criteria['cannot-tell'] +
      status.criteria['not-evaluated'];
   return undecided > 0 || status.phase !== 'complete' ? 'incomplete' : 'no-failures';
}

/** Collects everything a report shows into one plain structure. */
const WHOLE_AUDIT = 'All pages and screens';

function listLimitationGaps(audit: Audit): ReportGap[] {
   return listLimitations(audit).map((limitation) => ({
      criterion: limitation.criterion,
      pageId: 'audit',
      pageName: WHOLE_AUDIT,
      reason: limitation.text,
   }));
}

export function buildAuditReport(audit: Audit): AuditReport {
   const config = getConfig(audit);
   const all = listPages(audit);
   const names = new Map(all.map((page) => [page.id, page.name]));
   const units = listUnits(audit);
   const status = getAuditStatus(audit);
   const states = listPageStates(audit);
   const findings = listFindings(audit)
      .map((finding) => toReportFinding(finding, config, names))
      .toSorted(byPriority);
   const criteria = listCriterionRollups(audit).map((rollup) => ({
      info: getCriterionInfo(rollup.criterion, config.wcagVersion),
      standing: rollup.standing,
      findingIds: rollup.findingIds,
      outcomes: rollup.pages,
   }));
   return {
      config,
      generatedAt: audit.now().toISOString(),
      final: status.phase === 'complete',
      verdict: resolveVerdict(status),
      status,
      findings,
      criteria,
      gaps: [
         ...listLimitationGaps(audit),
         ...listGaps(criteria, units, names),
         ...listUntestedStateGaps(states, names),
      ],
      pages: all
         .filter((page) => page.status === 'active' && page.kind !== 'site')
         .map((page) => toReportPage(page, { units, findings, states })),
      excluded: all.filter((page) => page.status === 'excluded'),
   };
}

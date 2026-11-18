import { getCriterion, getTestMethod, listCriteriaByLevel } from '@a11ied/wcag-engine';
import { AuditError } from './errors.js';
import { getPassIdForCriterion, getTestPass, listTestPassIds } from './passes.js';
import type { ConformanceLevel } from './schema.js';

const LEVEL_ORDER: readonly ConformanceLevel[] = ['A', 'AA', 'AAA'];

export interface CriterionInfo {
   id: string;
   title: string;
   level: string;
   summary: string;
   url: string;
   pass: string;
   /** What the criterion applies to, from the curated procedure catalog. */
   appliesTo: string;
   /** The checks an auditor performs. */
   checks: string[];
   failsWhen: string;
   notApplicableWhen: string;
}

const AXE_PROCEDURE_ID = 'axe_scan';

/** Reads the judging guidance for a criterion. Criteria without a procedure get none. */
function getGuidance(
   criterionId: string,
   wcagVersion: string,
): Pick<CriterionInfo, 'appliesTo' | 'checks' | 'failsWhen' | 'notApplicableWhen'> {
   const procedure = getTestMethod(criterionId, {
      version: wcagVersion,
   }).strategy.procedures.find((entry) => entry.procedureId !== AXE_PROCEDURE_ID);
   return {
      appliesTo: procedure?.applicability ?? '',
      checks: procedure?.actions ?? [],
      failsWhen: procedure?.evaluation.failed ?? '',
      notApplicableWhen: procedure?.evaluation.inapplicable ?? '',
   };
}

export interface ScopeRequest {
   wcagVersion: string;
   level: ConformanceLevel;
   /** Limit the audit to these criteria. Numbers or slugs. */
   criteria?: readonly string[] | undefined;
   /** Limit the audit to the criteria owned by these passes. */
   passes?: readonly string[] | undefined;
}

/** Orders criterion numbers numerically, so 1.4.10 follows 1.4.9. */
export function compareCriteria(left: string, right: string): number {
   const leftParts = left.split('.').map(Number);
   const rightParts = right.split('.').map(Number);
   for (const [index, part] of leftParts.entries()) {
      const difference = part - (rightParts[index] ?? 0);
      if (difference !== 0) {
         return difference;
      }
   }
   return 0;
}

export function getCriterionInfo(
   criterionId: string,
   wcagVersion: string,
): CriterionInfo {
   const { criterion } = getCriterion(criterionId, { version: wcagVersion });
   return {
      id: criterion.id,
      title: criterion.title,
      level: criterion.level,
      summary: criterion.summary,
      url: criterion.understandingUrl,
      pass: getPassIdForCriterion(criterion.id),
      ...getGuidance(criterion.id, wcagVersion),
   };
}

function listLevelCriteria(wcagVersion: string, level: ConformanceLevel): string[] {
   const levels = LEVEL_ORDER.slice(0, LEVEL_ORDER.indexOf(level) + 1);
   return levels.flatMap((each) =>
      listCriteriaByLevel(each, wcagVersion).criteria.map((criterion) => criterion.id),
   );
}

function resolveRequested(request: ScopeRequest): string[] {
   const problems: string[] = [];
   const resolved: string[] = [];
   for (const lookup of request.criteria ?? []) {
      try {
         resolved.push(getCriterionInfo(lookup, request.wcagVersion).id);
      } catch {
         problems.push(
            `"${lookup}" is not a WCAG ${request.wcagVersion} success criterion.`,
         );
      }
   }
   if (problems.length > 0) {
      throw new AuditError('unknown-criterion', problems.join(' '), problems);
   }
   return resolved;
}

function assertKnownPasses(passes: readonly string[]): void {
   const unknown = passes.filter((passId) => getTestPass(passId) === undefined);
   if (unknown.length > 0) {
      throw new AuditError(
         'unknown-pass',
         `Unknown test pass: ${unknown.join(', ')}. Use one of: ${listTestPassIds().join(', ')}.`,
      );
   }
}

/**
 * Resolves what an audit covers into a fixed, ordered list of criterion ids. Explicit
 * criteria win over the level; a pass filter then narrows either.
 */
export function resolveScopeCriteria(request: ScopeRequest): string[] {
   const passes = request.passes ?? [];
   assertKnownPasses(passes);
   const requested = resolveRequested(request);
   const base =
      requested.length > 0
         ? requested
         : listLevelCriteria(request.wcagVersion, request.level);
   const narrowed =
      passes.length > 0
         ? base.filter((criterion) => passes.includes(getPassIdForCriterion(criterion)))
         : base;
   if (narrowed.length === 0) {
      throw new AuditError(
         'empty-scope',
         'No success criteria match this scope. Check --criteria, --passes, and --level.',
      );
   }
   return [...new Set(narrowed)].toSorted(compareCriteria);
}

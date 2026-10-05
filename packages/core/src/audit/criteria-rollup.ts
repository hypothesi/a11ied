import type {
   AxeRunResult,
   EvidenceRecord,
   ReportOutcome,
   WcagLevel,
   WcagVersion,
} from '@a11ied/contracts';
import { getTestMethod, listCriteriaByLevel } from '@a11ied/wcag-engine';

import { getCriterionEvidence } from '../evidence/criteria.js';

export interface AuditCriterionRollup {
   id: string;
   title: string;
   level: string;
   axeVerdict: 'fail' | 'pass' | 'incomplete' | 'not-covered';
   relevance: string;
   testMethod: string;
   /** `automated`, `hybrid`, or `manual`, from the WCAG strategy artifact. */
   evidenceMode: string;
   /** The checks a person can perform for this criterion. */
   procedureIds: string[];
   /** True while a required manual procedure has no recorded result. */
   pending: boolean;
   pendingProcedureIds?: string[] | undefined;
   /** The outcome a person or an agent recorded, when there is one. */
   recordedOutcome?: string | undefined;
}

function listAllCriteria(
   version: WcagVersion,
   maxLevel: WcagLevel = 'AAA',
): Array<{ id: string; title: string; level: string }> {
   const levels = ['A', 'AA', 'AAA'] as const;
   const included = levels.slice(0, levels.indexOf(maxLevel) + 1);
   return included.flatMap((level) =>
      listCriteriaByLevel(level, version).criteria.map((criterion) => ({
         id: criterion.id,
         title: criterion.title,
         level: criterion.level,
      })),
   );
}

function resolveAxeVerdict(
   axeRuleIds: string[],
   axe: AxeRunResult | undefined,
): AuditCriterionRollup['axeVerdict'] {
   if (!axe || axeRuleIds.length === 0) {
      return 'not-covered';
   }
   const ruleIdSet = new Set(axeRuleIds);
   if (axe.violations.some((rule) => ruleIdSet.has(rule.id))) {
      return 'fail';
   }
   if (axe.incomplete.some((rule) => ruleIdSet.has(rule.id))) {
      return 'incomplete';
   }
   const checked = new Set([...axe.passes, ...axe.inapplicable].map((rule) => rule.id));
   if (axeRuleIds.every((id) => checked.has(id))) {
      return 'pass';
   }
   return 'not-covered';
}

/** A passing scanner rule never establishes a whole criterion's outcome. */
export function getCriterionOutcome(criterion: AuditCriterionRollup): ReportOutcome {
   if (criterion.axeVerdict === 'fail' || criterion.recordedOutcome === 'failed') {
      return 'failed';
   }
   if (
      criterion.axeVerdict === 'incomplete' ||
      criterion.recordedOutcome === 'cantTell'
   ) {
      return 'cantTell';
   }
   if (criterion.pending) {
      return 'notTested';
   }
   if (
      criterion.procedureIds.includes('axe_scan') &&
      criterion.axeVerdict === 'not-covered'
   ) {
      return 'notTested';
   }
   if (
      criterion.recordedOutcome === 'passed' ||
      criterion.recordedOutcome === 'inapplicable'
   ) {
      return criterion.recordedOutcome;
   }
   return 'notTested';
}

function buildRollupEntry(input: {
   criterion: { id: string; title: string; level: string };
   args: {
      version: WcagVersion;
      axe?: AxeRunResult;
      relevanceStates: Record<string, string>;
   };
   recorded: EvidenceRecord[];
}): AuditCriterionRollup {
   const { args, criterion, recorded } = input;
   const lookup = getTestMethod(criterion.id, { version: args.version });
   const { strategy } = lookup;
   const { pendingProcedureIds, recordedOutcome } = getCriterionEvidence({
      criterionId: criterion.id,
      records: recorded,
      strategy,
   });
   const axeVerdict = resolveAxeVerdict(lookup.testMethod.axeRuleIds, args.axe);
   if (lookup.testMethod.axeRuleIds.length > 0 && axeVerdict === 'not-covered') {
      pendingProcedureIds.push('axe_scan');
   }
   const entry: AuditCriterionRollup = {
      id: criterion.id,
      title: criterion.title,
      level: criterion.level,
      axeVerdict,
      relevance: args.relevanceStates[criterion.id] ?? 'not-detected',
      testMethod: lookup.testMethod.method,
      evidenceMode: strategy.preferredEvidenceMode,
      procedureIds: strategy.procedureIds,
      pending: pendingProcedureIds.length > 0,
      pendingProcedureIds,
   };

   if (recordedOutcome === undefined) {
      return entry;
   }
   return { ...entry, recordedOutcome };
}

/**
 * Rolls up every WCAG criterion's axe verdict, relevance, test method, and whether it
 * still needs a person.
 *
 * A criterion stays pending until every required manual procedure has evidence.
 */
export function buildCriteriaRollup(args: {
   version: WcagVersion;
   level?: WcagLevel | undefined;
   axe?: AxeRunResult;
   relevanceStates: Record<string, string>;
   recorded?: EvidenceRecord[];
}): AuditCriterionRollup[] {
   const recorded = args.recorded ?? [];

   return listAllCriteria(args.version, args.level).map((criterion) =>
      buildRollupEntry({ criterion, args, recorded }),
   );
}

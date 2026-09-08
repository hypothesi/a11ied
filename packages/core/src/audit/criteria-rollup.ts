import type { AxeRunResult, WcagVersion } from '@a11ied/contracts';
import { getTestMethod, listCriteriaByLevel } from '@a11ied/wcag-engine';

export interface AuditCriterionRollup {
   id: string;
   title: string;
   level: string;
   axeVerdict: 'fail' | 'pass' | 'not-covered';
   relevance: string;
   testMethod: string;
   /** `automated`, `hybrid`, or `manual`, from the WCAG strategy artifact. */
   evidenceMode: string;
   /** The checks a person can perform for this criterion. */
   procedureIds: string[];
   /**
    * True when axe cannot decide this criterion and nobody has recorded a result. This is
    * the work still left for a person or an agent.
    */
   pending: boolean;
   /** The outcome a person or an agent recorded, when there is one. */
   recordedOutcome?: string;
}

function listAllCriteria(
   version: WcagVersion,
): Array<{ id: string; title: string; level: string }> {
   return (['A', 'AA', 'AAA'] as const).flatMap((level) =>
      listCriteriaByLevel(level, version).criteria.map((criterion) => ({
         id: criterion.id,
         title: criterion.title,
         level: criterion.level,
      })),
   );
}

function resolveAxeVerdict(
   axeRuleIds: string[],
   axe: AxeRunResult,
): 'fail' | 'pass' | 'not-covered' {
   if (axeRuleIds.length === 0) {
      return 'not-covered';
   }
   const ruleIdSet = new Set(axeRuleIds);
   if (axe.violations.some((rule) => ruleIdSet.has(rule.id))) {
      return 'fail';
   }
   if (axe.passes.some((rule) => ruleIdSet.has(rule.id))) {
      return 'pass';
   }
   return 'not-covered';
}

function buildRollupEntry(input: {
   criterion: { id: string; title: string; level: string };
   args: {
      version: WcagVersion;
      axe: AxeRunResult;
      relevanceStates: Record<string, string>;
   };
   recordedOutcome: string | undefined;
}): AuditCriterionRollup {
   const { args, criterion, recordedOutcome } = input;
   const lookup = getTestMethod(criterion.id, { version: args.version });
   const { strategy } = lookup;
   const entry: AuditCriterionRollup = {
      id: criterion.id,
      title: criterion.title,
      level: criterion.level,
      axeVerdict: resolveAxeVerdict(lookup.testMethod.axeRuleIds, args.axe),
      relevance: args.relevanceStates[criterion.id] ?? 'not-detected',
      testMethod: lookup.testMethod.method,
      evidenceMode: strategy.preferredEvidenceMode,
      procedureIds: strategy.procedureIds,
      pending:
         strategy.preferredEvidenceMode !== 'automated' && recordedOutcome === undefined,
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
 * `recordedOutcomes` maps a criterion id to the outcome someone recorded for this target.
 * Pass an empty record when there are none.
 */
export function buildCriteriaRollup(args: {
   version: WcagVersion;
   axe: AxeRunResult;
   relevanceStates: Record<string, string>;
   recordedOutcomes?: Record<string, string>;
}): AuditCriterionRollup[] {
   const recorded = args.recordedOutcomes ?? {};

   return listAllCriteria(args.version).map((criterion) =>
      buildRollupEntry({ criterion, args, recordedOutcome: recorded[criterion.id] }),
   );
}

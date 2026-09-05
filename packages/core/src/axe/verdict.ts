import type {
   AxeBaseline,
   AxeFailOnImpact,
   AxeImpact,
   AxeRuleResult,
   AxeVerdict,
   AxeVerdictFinding,
} from '@a11ied/contracts';

/** Default `--fail-on` threshold: any violation, of any impact, fails the run. */
export const DEFAULT_FAIL_ON_IMPACT: AxeFailOnImpact = 'minor';

const IMPACT_ORDER: Record<AxeFailOnImpact, number> = {
   minor: 1,
   moderate: 2,
   serious: 3,
   critical: 4,
};

/** Builds one baseline key from a rule id and the css target of one violating node. */
export function buildFindingKey(ruleId: string, target: string[]): string {
   return `${ruleId}::${target.join(' ')}`;
}

/** An impact with no severity, or at/above `failOn`, counts toward the verdict. */
function meetsFailOnThreshold(impact: AxeImpact, failOn: AxeFailOnImpact): boolean {
   if (!impact) {
      return true;
   }
   return IMPACT_ORDER[impact] >= IMPACT_ORDER[failOn];
}

interface EvaluateAxeVerdictInput {
   violations: AxeRuleResult[];
   failOn: AxeFailOnImpact;
   baseline?: AxeBaseline;
}

function collectFindings(input: EvaluateAxeVerdictInput): {
   totalViolationNodes: number;
   baselinedCount: number;
   failingFindings: AxeVerdictFinding[];
} {
   const baselineSet = new Set(input.baseline?.acceptedFindings);
   const failingFindings: AxeVerdictFinding[] = [];
   let totalViolationNodes = 0;
   let baselinedCount = 0;

   for (const rule of input.violations) {
      for (const node of rule.nodes) {
         totalViolationNodes += 1;
         if (baselineSet.has(buildFindingKey(rule.id, node.target))) {
            baselinedCount += 1;
            continue;
         }
         if (meetsFailOnThreshold(rule.impact, input.failOn)) {
            failingFindings.push({
               ruleId: rule.id,
               impact: rule.impact,
               target: node.target,
            });
         }
      }
   }

   return { totalViolationNodes, baselinedCount, failingFindings };
}

/**
 * Decides whether an axe scan passes: a violation node counts against the verdict unless
 * it is in the baseline or its impact falls below `failOn`.
 */
export function evaluateAxeVerdict(input: EvaluateAxeVerdictInput): AxeVerdict {
   const { totalViolationNodes, baselinedCount, failingFindings } =
      collectFindings(input);

   return {
      failOn: input.failOn,
      totalViolationNodes,
      baselinedCount,
      failingFindings,
      passed: failingFindings.length === 0,
   };
}

/** Builds a baseline that accepts every violation node found in this scan. */
export function buildBaselineFromViolations(violations: AxeRuleResult[]): AxeBaseline {
   const acceptedFindings = violations.flatMap((rule) =>
      rule.nodes.map((node) => buildFindingKey(rule.id, node.target)),
   );
   return { acceptedFindings: acceptedFindings.toSorted() };
}

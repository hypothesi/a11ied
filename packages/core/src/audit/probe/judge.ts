import type { AxeRuleResult } from '@a11ied/contracts';
import { operableProbes } from './probes-operable.js';
import { perceivableProbes } from './probes-perceivable.js';
import { understandableProbes } from './probes-understandable.js';
import {
   fail,
   needsReview,
   type Judgement,
   type Probe,
   type ProbeInput,
} from './probe-types.js';

const PROBES: Record<string, Probe> = {
   ...perceivableProbes,
   ...operableProbes,
   ...understandableProbes,
};

/** Rules whose probe adds detail axe does not carry. */
const AXE_DETAIL_PROBES = new Set(['1.4.3']);

function findViolation(
   criterionId: string,
   input: ProbeInput,
): AxeRuleResult | undefined {
   const tag = `wcag${criterionId.replaceAll('.', '')}`;
   return input.axe?.violations.find((rule) => rule.tags.includes(tag));
}

/** True when a criterion has a probe, so a driver knows it can decide it. */
export function hasProbe(criterionId: string): boolean {
   return criterionId in PROBES;
}

/** Axe violations tagged with the criterion win; otherwise its probe decides. */
export function judgeCriterion(criterionId: string, input: ProbeInput): Judgement {
   const violation = findViolation(criterionId, input);
   if (violation && !AXE_DETAIL_PROBES.has(criterionId)) {
      const target = violation.nodes[0]?.target.join(' ') ?? 'the page';
      return fail({
         rationale: `axe rule ${violation.id}: ${violation.help}. ${String(violation.nodes.length)} node(s), for example ${target}.`,
         title: `${violation.help} (${violation.id})`,
         userImpact: violation.description,
         remediation: `See ${violation.helpUrl}.`,
         impact: violation.impact ?? 'moderate',
      });
   }
   const probe = PROBES[criterionId];
   return probe
      ? probe(input)
      : needsReview(`No automated probe covers ${criterionId}; it needs a person.`);
}

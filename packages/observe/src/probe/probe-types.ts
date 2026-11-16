import type { AxeRunResult, EvidenceFinding, EvidenceOutcome } from '@a11ied/contracts';
import type { PageFacts, TabStop } from './page-facts.js';

export interface Judgement {
   outcome: EvidenceOutcome;
   rationale: string;
   finding?: EvidenceFinding;
}

/** Facts that only make sense across every audited page. */
export interface SiteFacts {
   hasSitemap: boolean;
   navSignatures: string[];
   helpSignatures: string[];
}

export interface ProbeInput {
   facts: PageFacts;
   axe: AxeRunResult | undefined;
   site: SiteFacts;
}

export type Probe = (input: ProbeInput) => Judgement;

export function pass(rationale: string): Judgement {
   return { outcome: 'passed', rationale };
}

export function notApplicable(rationale: string): Judgement {
   return { outcome: 'inapplicable', rationale };
}

/** The probe saw something it cannot judge alone, so a person has to decide. */
export function needsReview(rationale: string): Judgement {
   return { outcome: 'cantTell', rationale };
}

export function fail(input: {
   rationale: string;
   title: string;
   userImpact: string;
   remediation: string;
   impact?: EvidenceFinding['impact'];
}): Judgement {
   const { rationale, title, userImpact, remediation, impact } = input;
   return {
      outcome: 'failed',
      rationale,
      finding: { title, userImpact, remediation, ...(impact ? { impact } : {}) },
   };
}

export function getTabStops(facts: PageFacts): TabStop[] {
   return facts.tabStops.filter((stop): stop is TabStop => stop !== null);
}

/**
 * Visible tab stops up to the first repeat, so the order wrapping to the top is not a
 * jump.
 */
export function getFirstPass(facts: PageFacts): TabStop[] {
   const seen = new Set<string>();
   const firstPass: TabStop[] = [];
   for (const stop of getTabStops(facts).filter((entry) => !entry.hiddenFocus)) {
      if (seen.has(stop.id)) {
         break;
      }
      seen.add(stop.id);
      firstPass.push(stop);
   }
   return firstPass;
}

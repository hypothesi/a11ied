import {
   assessmentProcedureSchema,
   type AssessmentProcedure,
   type EvidenceStrategy,
   type NormalizedCriterion,
   type ProcedureCoverage,
} from '@a11ied/contracts';
import { z } from 'zod';

import curated from '../../data/curated/desktop-procedures.json' with { type: 'json' };

const seedSchema = z.object({
   scope: z.enum(['site', 'journey', 'state']).optional(),
   applicability: z.string().min(1),
   actions: z.array(z.string().min(1)).min(1),
   passed: z.string().min(1),
   failed: z.string().min(1),
   inapplicable: z.string().min(1),
   limitations: z.array(z.string()).optional(),
});
const seeds = z.record(z.string(), seedSchema).parse(curated);

const COMMON_LIMITATIONS = [
   'Results apply only to the states, environment, language, and complete processes actually observed.',
   'Simulated screen reader output does not verify VoiceOver or NVDA behavior.',
   'Inspect all normative exceptions; informative techniques and APG examples are supporting guidance, not conformance requirements.',
];

function getSources(criterion: NormalizedCriterion): AssessmentProcedure['sources'] {
   return [
      {
         kind: 'normative',
         url: `https://www.w3.org/TR/WCAG${criterion.wcagVersion.replace('.', '')}/#${criterion.slug}`,
      },
      { kind: 'informative', url: criterion.understandingUrl },
   ];
}

function buildBehavioralProcedure(input: {
   criterion: NormalizedCriterion;
   procedureId: string;
   seed: z.infer<typeof seedSchema>;
}): AssessmentProcedure {
   const { criterion, procedureId, seed } = input;
   return assessmentProcedureSchema.parse({
      criterionId: criterion.id,
      procedureId,
      title: `Assess ${criterion.title}`,
      scope: seed.scope ?? 'state',
      applicability: seed.applicability,
      actions: seed.actions,
      evaluation: {
         passed: seed.passed,
         failed: seed.failed,
         inapplicable: seed.inapplicable,
         cantTell:
            'Required objects, branches, tools, measurements, or context were unavailable. Record what was attempted and why.',
      },
      limitations: [...COMMON_LIMITATIONS, ...(seed.limitations ?? [])],
      sources: getSources(criterion),
   });
}

function buildScannerProcedure(criterion: NormalizedCriterion): AssessmentProcedure {
   return assessmentProcedureSchema.parse({
      criterionId: criterion.id,
      procedureId: 'axe_scan',
      title: `Run mapped scanner checks for ${criterion.title}`,
      scope: 'state',
      applicability: 'A rendered web document supports the mapped axe rules.',
      actions: [
         'Run all mapped axe rules against the page and keep the violations and the checks axe could not decide.',
      ],
      evaluation: {
         passed:
            'All mapped rules resolve with passes or inapplicable results. This completes the scanner procedure only.',
         failed:
            'A mapped rule detects a criterion failure with a reproducible violating object.',
         inapplicable: 'All mapped rules report inapplicable in the observed document.',
         cantTell:
            'A mapped rule is missing, incomplete, or cannot run in this environment.',
      },
      limitations: [
         'Scanner success cannot establish a whole-criterion pass.',
         'Axe does not assess native desktop controls.',
      ],
      sources: getSources(criterion),
   });
}

/**
 * Curated checks cover A/AA; selectable criteria without guidance expose an explicit
 * blocker.
 */
export function buildAssessmentProcedures(input: {
   criterion: NormalizedCriterion;
   procedureIds: string[];
}): { procedureIds: string[]; procedures: AssessmentProcedure[]; coverageGap?: string } {
   const seed = seeds[input.criterion.id];
   const hasNamedProcedure = input.procedureIds.some(
      (id) => id !== 'axe_scan' && id !== 'manual_review',
   );
   const procedureIds = [
      ...new Set(
         input.procedureIds
            .filter((id) => id !== 'manual_review' || !hasNamedProcedure)
            .map((id) =>
               id === 'manual_review'
                  ? `wcag_${input.criterion.id.replaceAll('.', '_')}`
                  : id,
            ),
      ),
   ];
   const procedures = procedureIds.flatMap((procedureId) => {
      if (procedureId === 'axe_scan') {
         return [buildScannerProcedure(input.criterion)];
      }
      return seed
         ? [buildBehavioralProcedure({ criterion: input.criterion, procedureId, seed })]
         : [];
   });
   if (!seed) {
      return {
         procedureIds: procedures.map((procedure) => procedure.procedureId),
         procedures,
         coverageGap: `No curated desktop assessment procedure covers WCAG ${input.criterion.wcagVersion} ${input.criterion.id}.`,
      };
   }
   return { procedureIds, procedures };
}

/** Report catalog completeness independently of scanner mapping counts. */
export function getProcedureCoverage(strategies: EvidenceStrategy[]): ProcedureCoverage {
   return {
      definedCriterionIds: strategies
         .filter((strategy) => !strategy.coverageGap)
         .map((strategy) => strategy.criterionId),
      gapCriterionIds: strategies
         .filter((strategy) => strategy.coverageGap)
         .map((strategy) => strategy.criterionId),
   };
}

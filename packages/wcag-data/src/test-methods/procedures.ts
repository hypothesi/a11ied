import {
   assessmentProcedureSchema,
   assessmentEvidenceKindSchema,
   assessmentCapabilitySchema,
   type AssessmentCapability,
   type AssessmentEvidenceKind,
   type AssessmentProcedure,
   type AssessmentScope,
   type NormalizedCriterion,
   type EvidenceStrategy,
   type ProcedureCoverage,
} from '@a11ied/contracts';
import { z } from 'zod';

import curated from '../../data/curated/desktop-procedures.json' with { type: 'json' };

const seedSchema = z.object({
   family: z.enum([
      'structure',
      'media',
      'content',
      'visual',
      'measurement',
      'keyboard',
      'form',
      'pointer',
      'markup',
   ]),
   scope: z.enum(['site', 'journey', 'state']).optional(),
   applicability: z.string().min(1),
   actions: z.array(z.string().min(1)).min(1),
   passed: z.string().min(1),
   failed: z.string().min(1),
   inapplicable: z.string().min(1),
   limitations: z.array(z.string()).optional(),
   requiredEvidence: z.array(assessmentEvidenceKindSchema).optional(),
   requiredCapabilities: z.array(assessmentCapabilitySchema).optional(),
});
const seeds = z.record(z.string(), seedSchema).parse(curated);
const PROCEDURE_VERSION = '1';
const COMMON_LIMITATIONS = [
   'Results apply only to the recorded states, environment, language, and complete processes actually observed.',
   'Inspect all normative exceptions; informative techniques and APG examples are supporting guidance, not conformance requirements.',
];

interface FamilyRequirements {
   capabilities: AssessmentCapability[];
   evidence: AssessmentEvidenceKind[];
}

const OBSERVATION_EVIDENCE: AssessmentEvidenceKind[] = ['action-trace', 'observation'];
const READER_REQUIREMENTS: FamilyRequirements = {
   capabilities: ['rendered-ui', 'real-reader', 'speech', 'keyboard'],
   evidence: [...OBSERVATION_EVIDENCE, 'speech'],
};
const VISUAL_REQUIREMENTS: FamilyRequirements = {
   capabilities: ['rendered-ui', 'screenshot'],
   evidence: [...OBSERVATION_EVIDENCE, 'screenshot'],
};
const FAMILY_REQUIREMENTS: Record<
   z.infer<typeof seedSchema>['family'],
   FamilyRequirements
> = {
   structure: READER_REQUIREMENTS,
   form: READER_REQUIREMENTS,
   content: VISUAL_REQUIREMENTS,
   visual: VISUAL_REQUIREMENTS,
   media: {
      capabilities: ['rendered-ui', 'audio', 'keyboard'],
      evidence: [...OBSERVATION_EVIDENCE, 'media'],
   },
   markup: {
      capabilities: ['rendered-ui', 'dom', 'markup-validation'],
      evidence: OBSERVATION_EVIDENCE,
   },
   keyboard: {
      capabilities: [...VISUAL_REQUIREMENTS.capabilities, 'keyboard'],
      evidence: VISUAL_REQUIREMENTS.evidence,
   },
   pointer: {
      capabilities: [...VISUAL_REQUIREMENTS.capabilities, 'pointer'],
      evidence: VISUAL_REQUIREMENTS.evidence,
   },
   measurement: {
      capabilities: [...VISUAL_REQUIREMENTS.capabilities, 'measurement'],
      evidence: [...VISUAL_REQUIREMENTS.evidence, 'measurement'],
   },
};

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
   const { criterion, procedureId, seed } = input,
      requirements = FAMILY_REQUIREMENTS[seed.family];
   const scope: AssessmentScope = seed.scope ?? 'state';
   return assessmentProcedureSchema.parse({
      criterionId: criterion.id,
      procedureId,
      version: PROCEDURE_VERSION,
      title: `Assess ${criterion.title}`,
      scope,
      applicability: seed.applicability,
      requiredCapabilities: [
         ...new Set([...requirements.capabilities, ...(seed.requiredCapabilities ?? [])]),
      ],
      setup: [
         'Bind the intended target and environment; capture the initial state and a fresh action checkpoint.',
         'Inventory applicable objects and branches across the scoped states; use authorized test data for mutations.',
         'Read the normative source below before evaluating its requirements and exceptions.',
      ],
      actions: seed.actions,
      requiredEvidence: [
         ...new Set([...requirements.evidence, ...(seed.requiredEvidence ?? [])]),
      ],
      evaluation: {
         passed: seed.passed,
         failed: seed.failed,
         inapplicable: seed.inapplicable,
         cantTell:
            'Required objects, branches, capabilities, measurements, or context remain unavailable. Record what was attempted and why.',
      },
      recovery: [
         'On target or observation failure, stop input, save the attempt, and rebind the verified target before retrying.',
         'Do not replay a submission. Inspect its saved result and restore only reversible state with the existing action policy.',
      ],
      limitations: [...COMMON_LIMITATIONS, ...(seed.limitations ?? [])],
      sources: getSources(criterion),
   });
}

function buildScannerProcedure(criterion: NormalizedCriterion): AssessmentProcedure {
   return assessmentProcedureSchema.parse({
      criterionId: criterion.id,
      procedureId: 'axe_scan',
      version: PROCEDURE_VERSION,
      title: `Run mapped scanner checks for ${criterion.title}`,
      scope: 'state',
      applicability: 'A rendered web document supports the mapped axe rules.',
      requiredCapabilities: ['rendered-ui', 'dom'],
      setup: ['Bind the observed document and capture its current state fingerprint.'],
      actions: [
         'Run all mapped axe rules against this observed state and retain passes, violations, incomplete, and inapplicable results.',
      ],
      requiredEvidence: ['action-trace', 'observation'],
      evaluation: {
         passed:
            'All mapped rules resolve with passes or inapplicable results. This completes the scanner procedure only.',
         failed:
            'A mapped rule detects a criterion failure with a reproducible violating object.',
         inapplicable: 'All mapped rules report inapplicable in the observed document.',
         cantTell:
            'A mapped rule is missing, incomplete, or cannot run in this environment.',
      },
      recovery: [
         'Retry only after confirming the intended state; invalidate results after a state change.',
      ],
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

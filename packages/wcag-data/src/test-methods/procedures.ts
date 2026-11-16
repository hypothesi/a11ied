import {
   assessmentCapabilitySchema,
   assessmentEvidenceKindSchema,
   assessmentProcedureSchema,
   blockerCodeSchema,
   inapplicabilityKindSchema,
   procedureActionTemplateSchema,
   type AssessmentCapability,
   type AssessmentEvidenceKind,
   type AssessmentProcedure,
   type AssessmentScope,
   type BlockerCode,
   type EvidenceStrategy,
   type InapplicabilityKind,
   type NormalizedCriterion,
   type ProcedureActionTemplate,
   type ProcedureCoverage,
   type ProcedureDoneDefinition,
} from '@a11ied/contracts';
import { z } from 'zod';

import curated from '../../data/curated/desktop-procedures.json' with { type: 'json' };

const TIER_0 = 0;
const TIER_1 = 1;
const TIER_2 = 2;
const TIER_3 = 3;

type ProcedureTier = typeof TIER_0 | typeof TIER_1 | typeof TIER_2 | typeof TIER_3;

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
   tier: z
      .union([z.literal(TIER_0), z.literal(TIER_1), z.literal(TIER_2), z.literal(TIER_3)])
      .optional(),
   toolCalls: z.array(procedureActionTemplateSchema).optional(),
   inapplicabilityKind: inapplicabilityKindSchema.optional(),
   allowedBlockerCodes: z.array(blockerCodeSchema).optional(),
});
const seeds = z.record(z.string(), seedSchema).parse(curated);
const PROCEDURE_VERSION = '1';

const CRITERION_INAPPLICABILITY_KIND: Readonly<Record<string, InapplicabilityKind>> = {
   '1.2.1': 'media-absence',
   '1.2.2': 'media-absence',
   '1.2.3': 'media-absence',
   '1.2.4': 'media-absence',
   '1.2.5': 'media-absence',
   '1.4.2': 'media-absence',
   '1.3.5': 'no-form',
   '3.2.2': 'no-form',
   '3.3.1': 'no-form',
   '3.3.2': 'no-form',
   '3.3.3': 'no-form',
   '3.3.4': 'no-form',
   '3.3.7': 'no-form',
   '3.3.8': 'no-authentication',
   '4.1.3': 'no-live-region',
   '2.2.1': 'no-timed-event',
   '2.2.2': 'no-animation',
   '2.3.1': 'no-animation',
   '2.4.5': 'no-multipage-context',
   '3.2.3': 'no-multipage-context',
   '3.2.4': 'no-multipage-context',
   '3.2.6': 'no-multipage-context',
   '2.5.1': 'no-multipoint-gesture',
   '2.5.7': 'no-dragging',
};

const TIER_0_CRITERIA: ReadonlySet<string> = new Set(['2.4.2', '3.1.1', '4.1.1']);
const TIER_1_CRITERIA: ReadonlySet<string> = new Set([
   '1.3.4',
   '1.4.4',
   '1.4.10',
   '1.4.12',
   '2.1.4',
   '2.2.1',
   '2.2.2',
   '2.3.1',
   '2.4.7',
   '2.4.11',
   '2.5.4',
   '2.5.8',
]);

function getProcedureTier(criterionId: string, seedTier?: ProcedureTier): ProcedureTier {
   if (seedTier !== undefined) {
      return seedTier;
   }
   if (TIER_0_CRITERIA.has(criterionId)) {
      return TIER_0;
   }
   if (TIER_1_CRITERIA.has(criterionId)) {
      return TIER_1;
   }
   return TIER_2;
}

const DEFAULT_ALLOWED_BLOCKER_CODES: readonly BlockerCode[] = [
   'capability-unsupported',
   'external-submission-unauthorized',
   'auth-credentials-missing',
   'third-party-out-of-scope',
   'hardware-sensor-unavailable',
   'human-judgment-required',
];

const STRUCTURE_FORM_TOOL_CALLS: readonly ProcedureActionTemplate[] = [
   {
      tool: 'review.next',
      expect:
         'Inspect ObservationBundle.transcript (spokenOrder, headings, landmarks, links, formControls) and accessibility tree.',
   },
   {
      tool: 'sr_action',
      args: { action: 'walk' },
      expect:
         'Walk interactive state or verify spoken role/name/value announcements when DOM transcript is insufficient.',
      capturesArtifact: true,
   },
   {
      tool: 'review.judge',
      expect:
         'Record passed, failed, inapplicable, or cantTell verdict with ObservationRef pointers.',
   },
];

const VISUAL_CONTENT_TOOL_CALLS: readonly ProcedureActionTemplate[] = [
   {
      tool: 'review.next',
      expect:
         'Inspect current DOM facts, relevant visual observations, and the baseline screenshot for this procedure.',
   },
   {
      tool: 'review.judge',
      expect:
         'Record each required action outcome with snapshot-bound evidence and the measurements required by this procedure.',
   },
];

const MEASUREMENT_TOOL_CALLS: readonly ProcedureActionTemplate[] = [
   {
      tool: 'review.next',
      expect:
         'Inspect ObservationBundle.viewports (reflow320, zoom200, portrait, textSpacingClipped) and smallTargets measurements.',
   },
   {
      tool: 'review.judge',
      expect: 'Record verdict with px/ms/Hz MeasurementRecord entries.',
   },
];

const KEYBOARD_TOOL_CALLS: readonly ProcedureActionTemplate[] = [
   {
      tool: 'review.next',
      expect:
         'Inspect ObservationBundle tabStops, focus-visible contrast samples, and trapSuspected flags.',
   },
   {
      tool: 'sr_action',
      args: { action: 'press', key: 'Tab' },
      expect: 'Verify interactive keyboard operation on custom widgets.',
      capturesArtifact: true,
   },
   {
      tool: 'review.judge',
      expect: 'Record verdict with keyboard and focus evidence.',
   },
];

const POINTER_TOOL_CALLS: readonly ProcedureActionTemplate[] = [
   {
      tool: 'review.next',
      expect:
         'Inspect ObservationBundle pointer facts, touch target dimensions, and gesture event listeners.',
   },
   {
      tool: 'review.judge',
      expect: 'Record verdict with pointer gesture or target-size evidence.',
   },
];

const MEDIA_TOOL_CALLS: readonly ProcedureActionTemplate[] = [
   {
      tool: 'review.next',
      expect:
         'Inspect ObservationBundle facts.media (video, audio, embeds, autoplay) and instrumented media plays.',
   },
   {
      tool: 'review.judge',
      expect:
         'Record verdict with media alternatives, captions, or audio description evidence.',
   },
];

const MARKUP_TOOL_CALLS: readonly ProcedureActionTemplate[] = [
   {
      tool: 'review.next',
      expect:
         'Inspect ObservationBundle DOM tree, markup validation errors, and parsed elements.',
   },
   {
      tool: 'review.judge',
      expect: 'Record verdict with markup validity and well-formedness evidence.',
   },
];

const FAMILY_TOOL_CALLS: Readonly<
   Record<z.infer<typeof seedSchema>['family'], readonly ProcedureActionTemplate[]>
> = {
   structure: STRUCTURE_FORM_TOOL_CALLS,
   form: STRUCTURE_FORM_TOOL_CALLS,
   visual: VISUAL_CONTENT_TOOL_CALLS,
   content: VISUAL_CONTENT_TOOL_CALLS,
   measurement: MEASUREMENT_TOOL_CALLS,
   keyboard: KEYBOARD_TOOL_CALLS,
   pointer: POINTER_TOOL_CALLS,
   media: MEDIA_TOOL_CALLS,
   markup: MARKUP_TOOL_CALLS,
};
const COMMON_LIMITATIONS = [
   'Results apply only to the recorded states, environment, language, and complete processes actually observed.',
   'Virtual-reader evidence is valid for audits but does not verify VoiceOver or NVDA behavior.',
   'Inspect all normative exceptions; informative techniques and APG examples are supporting guidance, not conformance requirements.',
];

interface FamilyRequirements {
   capabilities: AssessmentCapability[];
   evidence: AssessmentEvidenceKind[];
}

const OBSERVATION_EVIDENCE: AssessmentEvidenceKind[] = ['action-trace', 'observation'];
const READER_REQUIREMENTS: FamilyRequirements = {
   capabilities: ['rendered-ui', 'screen-reader', 'speech', 'keyboard'],
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

function getProcedureToolCalls(input: {
   scope: AssessmentScope;
   seed: z.infer<typeof seedSchema>;
}): ProcedureActionTemplate[] {
   const { scope, seed } = input;
   if (scope === 'site' || scope === 'journey') {
      return [
         {
            tool: 'audit_assessment',
            args: { action: 'next', scopes: [scope], count: 1 },
            expect:
               scope === 'site'
                  ? 'Use the linked coordinator file and inspect every participating state in the claimed site environment.'
                  : 'Use the linked coordinator file and inspect the claimed ordered journey, including actual transition evidence.',
         },
         {
            tool: 'record_result',
            expect:
               'After executing all procedure actions, submit their explicit outcomes with runFile, current state digests and registered producer artifacts. The run journal is the default results file.',
         },
         {
            tool: 'audit_assessment',
            args: { action: 'evaluate' },
            expect:
               'Complete the claimed check using the verified evidence ID returned by record_result and its actual outcome.',
         },
      ];
   }
   return seed.toolCalls ? [...seed.toolCalls] : [...FAMILY_TOOL_CALLS[seed.family]];
}

function buildBehavioralProcedure(input: {
   criterion: NormalizedCriterion;
   procedureId: string;
   seed: z.infer<typeof seedSchema>;
}): AssessmentProcedure {
   const { criterion, procedureId, seed } = input;
   const requirements = FAMILY_REQUIREMENTS[seed.family];
   const scope: AssessmentScope = seed.scope ?? 'state';
   const inapplicabilityKind =
      seed.inapplicabilityKind ?? CRITERION_INAPPLICABILITY_KIND[criterion.id];
   const tier = getProcedureTier(criterion.id, seed.tier);
   const toolCalls = getProcedureToolCalls({ scope, seed });
   const done: ProcedureDoneDefinition = {
      passed: seed.passed,
      failed: seed.failed,
      inapplicable: seed.inapplicable,
      cantTell:
         'Required objects, branches, capabilities, measurements, or context remain unavailable. Record what was attempted and a valid blockerCode.',
      allowedBlockerCodes: seed.allowedBlockerCodes
         ? [...seed.allowedBlockerCodes]
         : [...DEFAULT_ALLOWED_BLOCKER_CODES],
      ...(inapplicabilityKind ? { inapplicabilityKind } : {}),
   };

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
      ...(inapplicabilityKind
         ? {
              inapplicability: {
                 kind: inapplicabilityKind,
                 requiredCapabilities:
                    inapplicabilityKind === 'media-absence'
                       ? ['rendered-ui', 'dom']
                       : [
                            ...new Set([
                               ...requirements.capabilities,
                               ...(seed.requiredCapabilities ?? []),
                               'rendered-ui',
                               'dom',
                            ]),
                         ],
                 requiredEvidence:
                    inapplicabilityKind === 'media-absence'
                       ? ['action-trace', 'observation', 'media']
                       : [
                            ...new Set([
                               ...requirements.evidence,
                               ...(seed.requiredEvidence ?? []),
                            ]),
                         ],
              },
           }
         : {}),
      tier,
      toolCalls,
      done,
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
      tier: 0,
      toolCalls: [
         {
            tool: 'review.start',
            expect:
               'Run mapped axe-core rules against the observed state and record deterministic violations.',
         },
      ],
      done: {
         passed:
            'All mapped rules resolve with passes or inapplicable results. This completes the scanner procedure only.',
         failed:
            'A mapped rule detects a criterion failure with a reproducible violating object.',
         inapplicable: 'All mapped rules report inapplicable in the observed document.',
         cantTell:
            'A mapped rule is missing, incomplete, or cannot run in this environment.',
         allowedBlockerCodes: [...DEFAULT_ALLOWED_BLOCKER_CODES],
      },
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

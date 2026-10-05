import { z } from 'zod';
import { assessmentEvidenceKindSchema } from './assessment.js';
import { wcagVersionSchema } from './core.js';
import { driverActionRequestSchema } from './driver-actions.js';

/**
 * The outcomes a person or an agent can record. `untested` is missing on purpose: not
 * recording a result already means untested, and a stored `untested` row would be
 * indistinguishable from one nobody ever looked at.
 */
export const evidenceOutcomeSchema = z.enum([
   'passed',
   'failed',
   'cantTell',
   'inapplicable',
]);
export type EvidenceOutcome = z.infer<typeof evidenceOutcomeSchema>;

/**
 * A result a person reached alone is `manual`. One reached with tool help is
 * `semiAutomatic`.
 */
export const evidenceModeSchema = z.enum(['manual', 'semiAutomatic']);
export type EvidenceMode = z.infer<typeof evidenceModeSchema>;

/** Notes are bounded for readable reports. Filesystem locks protect complete records. */
export const EVIDENCE_NOTE_MAX_LENGTH = 2000;

export const evidenceFindingSchema = z.object({
   title: z.string().trim().min(1).max(EVIDENCE_NOTE_MAX_LENGTH),
   userImpact: z.string().trim().min(1).max(EVIDENCE_NOTE_MAX_LENGTH),
   remediation: z.string().trim().min(1).max(EVIDENCE_NOTE_MAX_LENGTH).optional(),
   impact: z.enum(['minor', 'moderate', 'serious', 'critical']).optional(),
});
export type EvidenceFinding = z.infer<typeof evidenceFindingSchema>;

export const evidenceStateReferenceSchema = z.object({
   stateId: z.string().min(1),
   revision: z.number().int().positive(),
   fingerprint: z.string().min(1),
});

export const evidenceSourceSchema = z.enum([
   'browser',
   'native',
   'real-reader',
   'virtual',
   'user',
]);

export const evidenceArtifactSchema = z.object({
   kind: assessmentEvidenceKindSchema,
   path: z.string().min(1),
   sha256: z.string().regex(/^[a-f0-9]{64}$/u),
   capturedAt: z.string().datetime(),
});

export const evidenceProvenanceSchema = z.object({
   version: z.literal('1'),
   runId: z.string().min(1),
   checkId: z.string().min(1),
   attempt: z.number().int().positive(),
   wcagVersion: wcagVersionSchema,
   procedureVersion: z.string().min(1),
   environmentId: z.string().min(1),
   states: z.array(evidenceStateReferenceSchema).min(1),
   actor: z.object({ kind: z.enum(['agent', 'human']), name: z.string().trim().min(1) }),
   source: evidenceSourceSchema,
   sessionId: z.string().min(1).optional(),
   actions: z
      .object({
         start: z.number().int().nonnegative(),
         end: z.number().int().nonnegative(),
         checkpoint: z.string().min(1).optional(),
      })
      .refine((range) => range.end >= range.start, 'Action range must be ordered.')
      .optional(),
   artifacts: z.array(evidenceArtifactSchema).min(1),
   rationale: z.string().trim().min(1).max(EVIDENCE_NOTE_MAX_LENGTH),
});
export type EvidenceProvenance = z.infer<typeof evidenceProvenanceSchema>;

const nonemptyObservationSchema = z.union([
   z.string().trim().min(1),
   z.object({ text: z.string().trim().min(1) }),
]);
const artifactContentSchemas = {
   observation: nonemptyObservationSchema,
   speech: nonemptyObservationSchema,
   'product-context': nonemptyObservationSchema,
   measurement: z
      .array(
         z.object({
            value: z.number().finite(),
            unit: z.string().trim().min(1),
            method: z.string().trim().min(1),
         }),
      )
      .min(1),
   media: z.object({
      transcript: z.string().trim().min(1),
      source: z.string().trim().min(1),
   }),
   'action-trace': z
      .array(
         z.object({
            index: z.number().int().nonnegative(),
            action: z.string().trim().min(1),
            request: driverActionRequestSchema.optional(),
            at: z.string().datetime(),
            stateId: z.string().min(1),
            checkpoint: z.string().min(1).optional(),
         }),
      )
      .min(1),
   screenshot: z.never(),
};

/** Non-image artifacts identify the observations they contain, independently of notes. */
export const assessmentArtifactEnvelopeSchema = z
   .object({
      version: z.literal('1'),
      runId: z.string().min(1),
      attempt: z.number().int().positive(),
      environmentId: z.string().min(1),
      states: z.array(evidenceStateReferenceSchema).min(1),
      source: evidenceSourceSchema,
      sessionId: z.string().min(1).optional(),
      capturedAt: z.string().datetime(),
      kind: assessmentEvidenceKindSchema,
      content: z
         .unknown()
         .refine(
            (value) => value !== undefined && value !== null,
            'Artifact content is required.',
         ),
   })
   .superRefine((artifact, context) => {
      const content = artifactContentSchemas[artifact.kind].safeParse(artifact.content);
      if (!content.success) {
         context.addIssue({
            code: 'custom',
            path: ['content'],
            message: `The ${artifact.kind} artifact has no usable evidence content.`,
         });
      }
   });

export const evidenceVerificationSchema = z.object({
   status: z.enum(['verified', 'unverified', 'stale']),
   reasons: z.array(z.string().min(1)),
});

/**
 * What a recorded result is about.
 *
 * A `criterion` result names the WCAG criterion and the procedure performed, drawn from
 * the `procedureIds` in the WCAG strategy artifact, because a criterion can need more
 * than one. A `patternRow` result names one row of one ARIA Authoring Practices Guide
 * example, so a person or an agent can record that a part of a pattern does not apply to
 * the component under test and have that judgment survive the next run.
 */
export const evidenceTestSchema = z.discriminatedUnion('kind', [
   z.object({
      kind: z.literal('criterion'),
      criterionId: z.string().min(1),
      procedureId: z.string().min(1),
   }),
   z.object({
      kind: z.literal('patternRow'),
      exampleId: z.string().min(1),
      rowKey: z.string().min(1),
   }),
]);
export type EvidenceTest = z.infer<typeof evidenceTestSchema>;

/**
 * One recorded result for a check a11ied cannot automate.
 *
 * `subject` is the canonical target string, so the same page recorded from different
 * spellings of its URL resolves to one row.
 */
export const evidenceRecordSchema = z.object({
   finding: evidenceFindingSchema.optional(),
   evidenceId: z.string().min(1).optional(),
   subject: z.string().min(1),
   test: evidenceTestSchema,
   outcome: evidenceOutcomeSchema,
   mode: evidenceModeSchema,
   pointer: z.string().min(1).optional(),
   note: z.string().max(EVIDENCE_NOTE_MAX_LENGTH).optional(),
   /** Who or what recorded it, such as an agent name or a person's initials. */
   assertedBy: z.string().min(1).optional(),
   recordedAt: z.string().min(1),
   /**
    * A hash of the page's accessibility tree when the check was performed. The tree is
    * used rather than the raw markup because a CSRF token or a timestamp changes the
    * markup on every load, which would report every page as changed.
    */
   subjectHash: z.string().min(1).optional(),
   provenance: evidenceProvenanceSchema.optional(),
   /** Derived again when consumed; an imported verification label is never trusted. */
   verification: evidenceVerificationSchema.optional(),
});
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

/**
 * The line shape written before a result could be about anything but a criterion. The
 * store reads it and lifts the two fields into `test`, so an existing results file keeps
 * working.
 */
export const legacyEvidenceLineSchema = z
   .object({
      criterionId: z.string().min(1),
      procedureId: z.string().min(1),
   })
   .passthrough();

/** One criterion that applies to a target and has no recorded result yet. */
export const pendingCriterionSchema = z.object({
   criterionId: z.string().min(1),
   title: z.string().min(1),
   level: z.string().min(1),
   evidenceMode: z.string().min(1),
   procedureIds: z.array(z.string()),
});
export type PendingCriterion = z.infer<typeof pendingCriterionSchema>;

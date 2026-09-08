import { z } from 'zod';

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

/**
 * A note longer than this is truncated when recorded. The cap keeps one JSON line well
 * inside a single filesystem write, so concurrent appends cannot interleave mid-record.
 */
export const EVIDENCE_NOTE_MAX_LENGTH = 2000;

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

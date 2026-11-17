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

/** Notes are bounded so a judgments file stays readable. */
export const EVIDENCE_NOTE_MAX_LENGTH = 2000;

export const mediaInventorySchema = z.object({
   url: z.string().min(1),
   video: z.number().int().nonnegative(),
   audio: z.number().int().nonnegative(),
   embeds: z.number().int().nonnegative(),
   mediaPlays: z.number().int().nonnegative(),
   audioContexts: z.number().int().nonnegative(),
   uninspectedTrees: z.number().int().nonnegative(),
   method: z.string().trim().min(1),
});
export type MediaInventory = z.infer<typeof mediaInventorySchema>;

/** The row of an ARIA Authoring Practices Guide example a judgment is about. */
export const evidenceTestSchema = z.object({
   exampleId: z.string().min(1),
   rowKey: z.string().min(1),
});
export type EvidenceTest = z.infer<typeof evidenceTestSchema>;

/**
 * One judgment recorded with `a1 pattern record`: whether a row of an APG example holds
 * for a widget, or does not apply to it.
 *
 * `subject` is the canonical target string, so the same page recorded from different
 * spellings of its URL resolves to one row.
 */
export const evidenceRecordSchema = z.object({
   subject: z.string().min(1),
   test: evidenceTestSchema,
   outcome: evidenceOutcomeSchema,
   mode: evidenceModeSchema,
   /** The selector of the widget the judgment is about. */
   pointer: z.string().min(1).optional(),
   note: z.string().max(EVIDENCE_NOTE_MAX_LENGTH).optional(),
   /** Who or what recorded it, such as an agent name or a person's initials. */
   assertedBy: z.string().min(1).optional(),
   recordedAt: z.string().min(1),
   /**
    * A hash of the page's accessibility tree when the judgment was made. The tree is used
    * rather than the raw markup because a CSRF token or a timestamp changes the markup on
    * every load, which would report every page as changed.
    */
   subjectHash: z.string().min(1).optional(),
});
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

/** What `a1 pattern record` returns: the stored judgment and the file it was written to. */
export const evidenceRecordResultSchema = z.object({
   record: evidenceRecordSchema,
   file: z.string().min(1),
});

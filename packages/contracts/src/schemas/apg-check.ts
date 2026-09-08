import { z } from 'zod';

import { evidenceOutcomeSchema } from './evidence.js';
import { w3cDocumentSourceSchema } from './wcag.js';

/**
 * What a keyboard row's probe found.
 *
 * `changed` means something observable happened. It does not mean the documented behavior
 * happened: deciding that is a judgment the tool does not make. `no-observable-effect`
 * means nothing changed on either probe, which is the one verdict the tool will defend on
 * its own.
 */
export const apgCheckRowStatusSchema = z.enum([
   'changed',
   'no-observable-effect',
   'not-testable',
]);
export type ApgCheckRowStatus = z.infer<typeof apgCheckRowStatusSchema>;

/**
 * What an attribute row's check found.
 *
 * `absent` is an observation, not a finding. Measurement against the APG's own reference
 * combobox showed `aria-activedescendant` absent while the listbox is closed, which is
 * correct behavior, so a plain absence is reported and hinted rather than failed.
 * `broken-reference` is the unambiguous case: the attribute is set and points at an id
 * the document does not have.
 */
export const apgAttributeCheckStatusSchema = z.enum([
   'present',
   'absent',
   'broken-reference',
   'not-testable',
]);
export type ApgAttributeCheckStatus = z.infer<typeof apgAttributeCheckStatusSchema>;

/** Which of the three observations differed after the key was pressed. */
export const apgObservedChangeSchema = z.enum([
   'focus',
   'ariaAttributes',
   'accessibilityTree',
]);
export type ApgObservedChange = z.infer<typeof apgObservedChangeSchema>;

/**
 * Which probe decided the row. `initial` is the press from the documented starting state.
 * `nudged` is the second press, made after moving the widget off a boundary, and it
 * exists because a listbox that loads with its first option selected correctly does
 * nothing on Up Arrow.
 */
export const apgProbeKindSchema = z.enum(['initial', 'nudged']);
export type ApgProbeKind = z.infer<typeof apgProbeKindSchema>;

/**
 * A judgment someone already recorded about this row.
 *
 * `stale` is true when the page's accessibility tree no longer hashes the same as it did
 * when the judgment was made, which means the component changed and the judgment needs
 * making again.
 */
export const recordedJudgmentSchema = z.object({
   outcome: evidenceOutcomeSchema,
   note: z.string().optional(),
   assertedBy: z.string().optional(),
   recordedAt: z.string().min(1),
   stale: z.boolean(),
});
export type RecordedJudgment = z.infer<typeof recordedJudgmentSchema>;

export const apgKeyboardCheckRowSchema = z.object({
   testId: z.string().optional(),
   rowKey: z.string().min(1),
   keys: z.array(z.string().min(1)),
   chord: z.string().optional(),
   description: z.array(z.string()),
   status: apgCheckRowStatusSchema,
   /** Why a row could not be pressed, on a `not-testable` row. */
   reason: z.string().optional(),
   focusedElement: z.string().optional(),
   observedChanges: z.array(apgObservedChangeSchema),
   decidedBy: apgProbeKindSchema.optional(),
   /**
    * What the tool is willing to record about this row. A key that changed nothing is
    * `failed`; a key that changed something is `cantTell`, because whether it was the
    * documented behavior is a judgment; a key that cannot be pressed gets nothing at all,
    * since not recording a result already means untested. Never `inapplicable`: only a
    * person or an agent decides that.
    */
   outcome: evidenceOutcomeSchema.optional(),
   /** A judgment already recorded for this row, replayed from the evidence store. */
   recorded: recordedJudgmentSchema.optional(),
});
export type ApgKeyboardCheckRow = z.infer<typeof apgKeyboardCheckRowSchema>;

export const apgAttributeCheckRowSchema = z.object({
   testId: z.string().optional(),
   rowKey: z.string().min(1),
   attribute: z.string().optional(),
   role: z.string().optional(),
   element: z.string(),
   usage: z.string(),
   status: apgAttributeCheckStatusSchema,
   reason: z.string().optional(),
   /** The value found on the page, when the attribute is present. */
   observedValue: z.string().optional(),
   outcome: evidenceOutcomeSchema.optional(),
   recorded: recordedJudgmentSchema.optional(),
});
export type ApgAttributeCheckRow = z.infer<typeof apgAttributeCheckRowSchema>;

/**
 * An attribute the example documents that the widget never sets, with the keyboard rows
 * whose description mentions it.
 *
 * This is a hint and never a verdict. It answers which parts of a pattern may not apply
 * to the component under test, with evidence rather than a guess, and leaves the decision
 * to a person or an agent.
 */
export const apgApplicabilityHintSchema = z.object({
   attribute: z.string().min(1),
   relatedRowKeys: z.array(z.string()),
});
export type ApgApplicabilityHint = z.infer<typeof apgApplicabilityHintSchema>;

export const apgCheckResultSchema = z.object({
   document: w3cDocumentSourceSchema,
   exampleId: z.string().min(1),
   patternId: z.string().min(1),
   pageUrl: z.string().url(),
   title: z.string().min(1),
   subject: z.string().min(1),
   selector: z.string().min(1),
   tableName: z.string(),
   keyboardRows: z.array(apgKeyboardCheckRowSchema),
   attributeRows: z.array(apgAttributeCheckRowSchema),
   applicabilityHints: z.array(apgApplicabilityHintSchema),
   /** Keyboard tables this run did not probe, because each documents a different state. */
   unprobedTables: z.array(z.string()),
});
export type ApgCheckResult = z.infer<typeof apgCheckResultSchema>;

import { z } from 'zod';

const MAX_NOTE_LENGTH = 600;
const MAX_TITLE_LENGTH = 120;
const MAX_TEXT_LENGTH = 1200;
const CRITERION_PATTERN = /^\d\.\d{1,2}\.\d{1,2}$/u;

export const platformSchema = z.enum(['web', 'ios', 'android']);
export type Platform = z.infer<typeof platformSchema>;

export const conformanceLevelSchema = z.enum(['A', 'AA', 'AAA']);
export type ConformanceLevel = z.infer<typeof conformanceLevelSchema>;

export const pageKindSchema = z.enum(['page', 'screen', 'state', 'flow', 'site']);
export type PageKind = z.infer<typeof pageKindSchema>;

export const severitySchema = z.enum(['critical', 'serious', 'moderate', 'minor']);
export type Severity = z.infer<typeof severitySchema>;

/**
 * The outcome of one criterion on one page. `cannot-tell` means the check could not be
 * completed, and the note says what blocked it.
 */
export const outcomeSchema = z.enum(['pass', 'fail', 'not-applicable', 'cannot-tell']);
export type Outcome = z.infer<typeof outcomeSchema>;

export const unitStatusSchema = z.enum(['pending', 'claimed', 'done', 'blocked']);
export type UnitStatus = z.infer<typeof unitStatusSchema>;

export const findingSourceSchema = z.enum(['axe', 'agent', 'human']);
export type FindingSource = z.infer<typeof findingSourceSchema>;

export const criterionIdSchema = z
   .string()
   .regex(CRITERION_PATTERN, 'Use a WCAG success criterion number such as 2.4.7.');

/** What an audit covers and the rules its workers must follow. */
export const auditConfigSchema = z.object({
   id: z.string().min(1),
   name: z.string().min(1),
   target: z.string().min(1),
   platform: platformSchema,
   wcagVersion: z.string().min(1),
   level: conformanceLevelSchema,
   /** Criterion ids in scope, resolved once when the audit is created. */
   criteria: z.array(criterionIdSchema).min(1),
   /** Restrictions every worker must respect, such as "do not submit the contact form". */
   rules: z.array(z.string().min(1)),
   /** How to reach the target: environment, credentials location, build, device. */
   access: z.string(),
   createdAt: z.string(),
});
export type AuditConfig = z.infer<typeof auditConfigSchema>;

export const criterionResultInputSchema = z.object({
   criterion: criterionIdSchema,
   outcome: outcomeSchema,
   /** What was checked and what was seen. One or two sentences. */
   note: z
      .string()
      .trim()
      .min(1, 'Say what you checked in one or two sentences.')
      .max(
         MAX_NOTE_LENGTH,
         `Keep the note under ${String(MAX_NOTE_LENGTH)} characters. Put detail in a finding.`,
      ),
});
export type CriterionResultInput = z.infer<typeof criterionResultInputSchema>;

export const findingInputSchema = z.object({
   criterion: criterionIdSchema,
   /**
    * Other criteria in scope that this same defect fails. Use it for one defect with
    * several consequences, not to bundle separate defects.
    */
   alsoFails: z.array(criterionIdSchema).default([]),
   /** Attach this occurrence to an existing finding instead of creating a new one. */
   sameAs: z.string().optional(),
   /** The defect in a few words, written so it reads the same on every affected page. */
   title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
   severity: severitySchema.optional(),
   /** What is wrong, stated as an observed fact. */
   description: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
   /** Who is affected and how. */
   impact: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
   /** The change that would fix it. */
   recommendation: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
   /** Where it occurs on this page: a visible label plus a selector or element. */
   location: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
   /** Anything specific to this occurrence, such as a measured contrast ratio. */
   detail: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
   /** Evidence file paths, relative to the audit directory or absolute. */
   evidence: z.array(z.string().min(1)).default([]),
});
export type FindingInput = z.infer<typeof findingInputSchema>;

export const dismissalInputSchema = z.object({
   finding: z.string().min(1),
   reason: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
});
export type DismissalInput = z.infer<typeof dismissalInputSchema>;

/** Everything a worker hands back for one unit. Accepted or rejected as a whole. */
export const submissionSchema = z.object({
   results: z.array(criterionResultInputSchema),
   findings: z.array(findingInputSchema).default([]),
   /** Automated or earlier findings that are wrong for this page, with the reason. */
   dismiss: z.array(dismissalInputSchema).default([]),
   /** One sentence on how the unit went, shown in the activity log. */
   summary: z.string().trim().max(MAX_NOTE_LENGTH).default(''),
});
export type Submission = z.infer<typeof submissionSchema>;
export type SubmissionInput = z.input<typeof submissionSchema>;

export interface AuditPage {
   id: string;
   kind: PageKind;
   name: string;
   /** A URL for web pages, or how to reach the screen or flow. */
   locator: string;
   /** Setup steps, credentials hints, or flow steps a worker needs. */
   notes: string;
   /** Template or feature group, used to spot shared components. */
   group: string;
   /** Pass ids to run on this page. Undefined means every pass in scope. */
   passes: string[] | undefined;
   status: 'active' | 'excluded';
   excludeReason: string;
   createdAt: string;
}

export interface Unit {
   id: string;
   pageId: string;
   pass: string;
   criteria: string[];
   status: UnitStatus;
   worker: string | null;
   leaseExpiresAt: string | null;
   attempts: number;
   startedAt: string | null;
   finishedAt: string | null;
   /** Why the unit is blocked, when it is. */
   reason: string;
   summary: string;
}

export interface CriterionResult {
   pageId: string;
   criterion: string;
   outcome: Outcome;
   note: string;
   unitId: string;
   worker: string;
   recordedAt: string;
}

export interface Finding {
   id: string;
   /** The criterion the defect most directly fails. */
   criterion: string;
   /** Other criteria the same defect fails. */
   related: string[];
   title: string;
   severity: Severity;
   description: string;
   impact: string;
   recommendation: string;
   source: FindingSource;
   /** Stable key for automatic merging, such as an axe rule id. */
   key: string;
   createdAt: string;
}

export interface FindingInstance {
   id: number;
   findingId: string;
   pageId: string;
   unitId: string | null;
   location: string;
   detail: string;
   evidence: string[];
   status: 'open' | 'dismissed';
   dismissReason: string;
   worker: string;
   createdAt: string;
}

export interface AuditEvent {
   id: number;
   at: string;
   actor: string;
   type: string;
   unitId: string | null;
   message: string;
}

export interface Signal {
   pageId: string;
   kind: string;
   data: unknown;
   collectedAt: string;
}

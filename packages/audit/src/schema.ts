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

/**
 * How to photograph one occurrence: the element, and the condition the page must be in.
 * `a1 audit submit` takes the picture, crops it to the element with some context, and
 * outlines the element, then adds the file to the finding's evidence.
 */
export const screenshotSpecSchema = z.object({
   /**
    * A Playwright selector: CSS, or `role=button[name="Menu"]`. Both reach open shadow
    * roots.
    */
   selector: z.string().trim().min(1),
   /** CSS pixels as `320x800`. Defaults to 1280x900. */
   viewport: z
      .string()
      .regex(/^\d+x\d+$/u, 'Use WIDTHxHEIGHT, such as 320x800.')
      .optional(),
   /** Browser zoom factor, such as 2 for 200 percent. */
   zoom: z.number().positive().optional(),
   /** Apply the WCAG 1.4.12 text spacing values first. */
   textSpacing: z.boolean().optional(),
   /** Click these elements in order first, to open a menu, dialog, or widget. */
   click: z.array(z.string().min(1)).default([]),
   /** Keys to press in order after clicking, such as `Tab*5`. */
   press: z.array(z.string().min(1)).default([]),
   /** Hover this element last, to show hover content. */
   hover: z.string().min(1).optional(),
});
export type ScreenshotSpec = z.infer<typeof screenshotSpecSchema>;

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
   /** A picture of this occurrence for the tool to take. See `screenshotSpecSchema`. */
   screenshot: screenshotSpecSchema.optional(),
});
export type FindingInput = z.infer<typeof findingInputSchema>;

export const dismissalInputSchema = z.object({
   finding: z.string().min(1),
   reason: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
});
export type DismissalInput = z.infer<typeof dismissalInputSchema>;

/**
 * One condition of the page that the worker put it in and judged, such as "Menu open" or
 * "Contact form after an empty submit". `covers` lists the ids of the scan's state
 * inventory items it accounts for.
 */
export const stateInputSchema = z.object({
   name: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
   covers: z.array(z.string().min(1)).default([]),
   tested: z.boolean(),
   /** How the state was reached and what was checked, or why it was not tested. */
   note: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
});
export type StateInput = z.infer<typeof stateInputSchema>;

/** Everything a worker hands back for one unit. Accepted or rejected as a whole. */
export const submissionSchema = z.object({
   results: z.array(criterionResultInputSchema),
   findings: z.array(findingInputSchema).default([]),
   /** Automated or earlier findings that are wrong for this page, with the reason. */
   dismiss: z.array(dismissalInputSchema).default([]),
   /** Every state of the page the worker tested or deliberately left out. */
   states: z.array(stateInputSchema).default([]),
   /** One sentence on how the unit went, shown in the activity log. */
   summary: z.string().trim().max(MAX_NOTE_LENGTH).default(''),
});
export type Submission = z.infer<typeof submissionSchema>;
export type SubmissionInput = z.input<typeof submissionSchema>;

/**
 * A control or region the scan found that can change what the page presents: something
 * that expands, opens, or switches content, an embedded frame or web component, or a form
 * with validation. It is a starting list for the worker, not a complete one.
 */
export const stateTriggerSchema = z.object({
   id: z.string(),
   kind: z.enum(['disclosure', 'popup', 'dialog', 'tabs', 'control', 'embedded', 'form']),
   /** What a person would call it: its accessible name or visible text. */
   label: z.string(),
   /** A Playwright selector that finds it. */
   selector: z.string(),
});
export type StateTrigger = z.infer<typeof stateTriggerSchema>;

export const stateInventorySchema = z.object({
   triggers: z.array(stateTriggerSchema),
   /** How many more were found than listed. */
   omitted: z.number().int().nonnegative().default(0),
});
export type StateInventory = z.infer<typeof stateInventorySchema>;

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

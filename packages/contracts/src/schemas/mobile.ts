import { z } from 'zod';

import {
   criterionIdSchema,
   w3cDocumentProvenanceSchema,
   w3cDocumentSourceSchema,
} from './wcag.js';

/**
 * Whether WCAG2Mobile has published guidance for a criterion yet. The document is a work
 * in progress: a `placeholder` entry names an open issue instead of guidance.
 */
export const mobileGuidanceStateSchema = z.enum(['guidance', 'placeholder']);
export type MobileGuidanceState = z.infer<typeof mobileGuidanceStateSchema>;

/**
 * WCAG2Mobile's guidance for one success criterion, keyed by the same criterion id as the
 * rest of the WCAG data. `guidance` is the prose as written, in Markdown, including the
 * restated criterion text an entry adds when mobile changes a term such as "user agent".
 * `notes` and `examples` are the document's own note and example blocks, kept apart so a
 * caller can print them as a list.
 */
export const mobileGuidanceEntrySchema = w3cDocumentProvenanceSchema.extend({
   criterionId: criterionIdSchema,
   state: mobileGuidanceStateSchema,
   guidance: z.string(),
   notes: z.array(z.string()),
   examples: z.array(z.string()),
   wcag2ictUrl: z.string().url(),
   /** The open issue tracking the missing guidance, on a `placeholder` entry. */
   openIssueUrl: z.string().url().optional(),
});
export type MobileGuidanceEntry = z.infer<typeof mobileGuidanceEntrySchema>;

/**
 * WCAG2Mobile guidance for every criterion the document covers. It is not scoped to a
 * WCAG version: the document applies WCAG 2.2 to mobile, and criterion ids are stable
 * across 2.1 and 2.2, so one file serves both.
 */
export const mobileGuidanceArtifactSchema = z.object({
   document: w3cDocumentSourceSchema,
   criteria: z.record(z.string(), mobileGuidanceEntrySchema),
});
export type MobileGuidanceArtifact = z.infer<typeof mobileGuidanceArtifactSchema>;

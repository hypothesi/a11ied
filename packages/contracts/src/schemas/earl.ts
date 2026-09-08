import { z } from 'zod';

/**
 * The five outcomes EARL defines. `cantTell` means the tool ran and could not decide.
 * `untested` means the tool ran nothing that applied to the subject, which is how a
 * report declares the edge of its own coverage.
 */
export const earlOutcomeSchema = z.enum([
   'passed',
   'failed',
   'cantTell',
   'inapplicable',
   'untested',
]);
export type EarlOutcome = z.infer<typeof earlOutcomeSchema>;

/**
 * How the result was reached. A person alone is `manual`; a person with tool help is
 * `semiAutomatic`.
 */
export const earlModeSchema = z.enum(['automatic', 'semiAutomatic', 'manual']);
export type EarlMode = z.infer<typeof earlModeSchema>;

/**
 * The procedure that produced one result. `title` identifies it inside the reporting
 * tool, such as an axe rule id. `criterionSlugs` are WCAG success criterion slugs like
 * `non-text-content`, which the report writes as `WCAG2:non-text-content`.
 */
export const earlProcedureSchema = z.object({
   title: z.string().min(1),
   url: z.string().url().optional(),
   criterionSlugs: z.array(z.string()),
});
export type EarlProcedure = z.infer<typeof earlProcedureSchema>;

/**
 * One result before it becomes an EARL assertion. Leaving `procedure` off records that
 * nothing applicable ran against `subject`, which the report writes as `earl:untested`.
 */
export const earlAssertionInputSchema = z.object({
   subject: z.string().min(1),
   outcome: earlOutcomeSchema,
   mode: earlModeSchema.optional(),
   procedure: earlProcedureSchema.optional(),
   pointer: z.string().optional(),
   info: z.string().optional(),
});
export type EarlAssertionInput = z.infer<typeof earlAssertionInputSchema>;

/**
 * Names the tool that made the assertions. `url` is a stable release page, and it becomes
 * the `assertedBy` value on every assertion.
 */
export const earlAssertorSchema = z.object({
   name: z.string().min(1),
   url: z.string().url(),
   revision: z.string().min(1),
});
export type EarlAssertor = z.infer<typeof earlAssertorSchema>;

/**
 * `act` writes one assertion per procedure per subject and no pointer, matching the
 * reports the W3C accepts. `report` writes one assertion per element with a
 * `result.pointer`, which is what a person reading results for their own site wants.
 */
export const earlProfileSchema = z.enum(['act', 'report']);
export type EarlProfile = z.infer<typeof earlProfileSchema>;

const earlSubjectSchema = z.object({
   '@type': z.tuple([z.literal('earl:TestSubject'), z.literal('sch:WebPage')]),
   source: z.string().min(1),
});

const earlTestCaseSchema = z.object({
   '@type': z.literal('TestCase'),
   title: z.string().min(1),
   '@id': z.string().url().optional(),
   isPartOf: z.array(z.string()),
});

const earlResultSchema = z.object({
   '@type': z.literal('TestResult'),
   outcome: z.string().min(1),
   pointer: z.string().optional(),
   info: z.string().optional(),
});

/** One assertion in the report graph. An assertion with no `test` carries `earl:untested`. */
export const earlAssertionSchema = z.object({
   '@type': z.literal('Assertion'),
   mode: z.string().min(1).optional(),
   subject: earlSubjectSchema,
   assertedBy: z.string().min(1),
   result: earlResultSchema,
   test: earlTestCaseSchema.optional(),
});
export type EarlAssertion = z.infer<typeof earlAssertionSchema>;

export const earlReportSchema = z.object({
   '@context': z.string().url(),
   '@graph': z.array(earlAssertionSchema),
});
export type EarlReport = z.infer<typeof earlReportSchema>;

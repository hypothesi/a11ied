import { z } from 'zod';

import { w3cDocumentSourceSchema } from './wcag.js';

/**
 * One attribute cell from an APG "Role, Property, State, and Tabindex Attributes" table.
 * `raw` is the cell as written, such as `aria-expanded="false"` or
 * `aria-controls="#IDREF"`. `value` is absent when the APG writes the attribute with no
 * value, and `isIdRef` is true when the value is the `#IDREF` placeholder rather than a
 * literal.
 */
export const apgAttributeValueSchema = z.object({
   raw: z.string().min(1),
   name: z.string().min(1),
   value: z.string().optional(),
   isIdRef: z.boolean(),
});
export type ApgAttributeValue = z.infer<typeof apgAttributeValueSchema>;

/**
 * One row of an APG keyboard support table.
 *
 * `keyGroups` holds one group per alternative and one entry per `kbd` element within a
 * group, because an APG key cell means one of two different things. `Alt + Down Arrow` is
 * a single chord, so it is `[['Alt', 'Down Arrow']]`. `Space or Enter` is two
 * alternatives, either of which satisfies the row, so it is `[['Space'], ['Enter']]`.
 * Collapsing the two cases produces a chord nobody presses.
 *
 * `testId` comes from the row's `data-test-id`. It is not unique within a file: the
 * combobox example uses `combobox-aria-expanded` on the row for `false` and again on the
 * row for `true`, so rows are addressed by position and the id is kept as a field.
 */
export const apgKeyboardRowSchema = z.object({
   testId: z.string().optional(),
   keyGroups: z.array(z.array(z.string().min(1)).min(1)).min(1),
   description: z.array(z.string()),
});
export type ApgKeyboardRow = z.infer<typeof apgKeyboardRowSchema>;

/**
 * One row of an APG attribute table. Either `role` or `attribute` is filled and the other
 * is absent: the APG leaves one of the two cells empty on every row.
 */
export const apgAttributeRowSchema = z.object({
   testId: z.string().optional(),
   role: z.string().optional(),
   attribute: apgAttributeValueSchema.optional(),
   element: z.string(),
   usage: z.string(),
});
export type ApgAttributeRow = z.infer<typeof apgAttributeRowSchema>;

/**
 * One keyboard table. `name` is the state the table documents, such as "Closed Combobox",
 * and is empty when the example has only one table and gives it no sub-heading.
 */
export const apgKeyboardTableSchema = z.object({
   name: z.string(),
   rows: z.array(apgKeyboardRowSchema),
});
export type ApgKeyboardTable = z.infer<typeof apgKeyboardTableSchema>;

export const apgAttributeTableSchema = z.object({
   name: z.string(),
   rows: z.array(apgAttributeRowSchema),
});
export type ApgAttributeTable = z.infer<typeof apgAttributeTableSchema>;

/**
 * One APG example. `sourceUrl` is the file the tables were parsed from and `pageUrl` is
 * the published page a command prints as attribution.
 *
 * Both table lists are empty for the landmark examples, which document a role with prose
 * and no tables at all.
 */
export const apgExampleSchema = z.object({
   id: z.string().min(1),
   patternId: z.string().min(1),
   title: z.string().min(1),
   pageUrl: z.string().url(),
   sourceUrl: z.string().url(),
   experimental: z.boolean(),
   keyboardTables: z.array(apgKeyboardTableSchema),
   attributeTables: z.array(apgAttributeTableSchema),
});
export type ApgExample = z.infer<typeof apgExampleSchema>;

/**
 * One section of a pattern page, such as About This Pattern or Keyboard Interaction, as
 * Markdown. The guide's own prose is what a person or an agent reads before testing a
 * widget by hand, so it is stored whole rather than reduced to the example tables.
 */
export const apgPatternSectionSchema = z.object({
   /** The section's id on the page, such as `keyboard_interaction`. */
   id: z.string().min(1),
   title: z.string().min(1),
   markdown: z.string(),
});
export type ApgPatternSection = z.infer<typeof apgPatternSectionSchema>;

export const apgPatternSchema = z.object({
   id: z.string().min(1),
   title: z.string().min(1),
   pageUrl: z.string().url(),
   /** The page's own text, in page order. Empty when the page could not be read. */
   sections: z.array(apgPatternSectionSchema),
   exampleIds: z.array(z.string().min(1)),
});
export type ApgPattern = z.infer<typeof apgPatternSchema>;

/**
 * Every APG pattern and example, with the role and attribute indexes the APG's own
 * example index publishes. The artifact is not scoped to a WCAG version: the APG
 * describes ARIA patterns, which do not change between WCAG 2.1 and 2.2.
 */
export const apgPatternsArtifactSchema = z.object({
   document: w3cDocumentSourceSchema,
   patterns: z.record(z.string(), apgPatternSchema),
   examples: z.record(z.string(), apgExampleSchema),
   roleIndex: z.record(z.string(), z.array(z.string())),
   attributeIndex: z.record(z.string(), z.array(z.string())),
});
export type ApgPatternsArtifact = z.infer<typeof apgPatternsArtifactSchema>;

/**
 * One row of a unified search. `kind` says which corpus it came from, so a caller can
 * print a mixed list without inspecting the shape of each row.
 */
export const searchResultKindSchema = z.enum([
   'criterion',
   'technique',
   'failure',
   'axe-rule',
   'pattern',
   'example',
]);
export type SearchResultKind = z.infer<typeof searchResultKindSchema>;

export const unifiedSearchRowSchema = z.object({
   kind: searchResultKindSchema,
   id: z.string().min(1),
   title: z.string().min(1),
   score: z.number(),
   /** Where the match was found, such as a criterion level or a pattern id. */
   context: z.string().optional(),
   /** The text that matched, so a reader can see why the row is here. */
   matchedOn: z.string().optional(),
});
export type UnifiedSearchRow = z.infer<typeof unifiedSearchRowSchema>;

export const unifiedSearchResultSchema = z.object({
   query: z.string(),
   rows: z.array(unifiedSearchRowSchema),
});
export type UnifiedSearchResult = z.infer<typeof unifiedSearchResultSchema>;

/** Which corpus a lookup key resolved to. */
export const apgLookupKindSchema = z.enum(['pattern', 'example']);
export type ApgLookupKind = z.infer<typeof apgLookupKindSchema>;

export const apgLookupKeySchema = z.object({
   kind: apgLookupKindSchema,
   id: z.string().min(1),
});
export type ApgLookupKey = z.infer<typeof apgLookupKeySchema>;

export const apgPatternShowResultSchema = z.object({
   document: w3cDocumentSourceSchema,
   pattern: apgPatternSchema,
   examples: z.array(apgExampleSchema),
});
export type ApgPatternShowResult = z.infer<typeof apgPatternShowResultSchema>;

export const apgExampleShowResultSchema = z.object({
   document: w3cDocumentSourceSchema,
   example: apgExampleSchema,
   pattern: apgPatternSchema,
});
export type ApgExampleShowResult = z.infer<typeof apgExampleShowResultSchema>;

/**
 * What a bare `a1 pattern <name>` resolves to. The lookup happens inside the command
 * handler rather than before it, so a name that matches nothing becomes a usage error
 * with an exit code instead of an uncaught throw.
 */
export const apgLookupResultSchema = z.discriminatedUnion('kind', [
   apgPatternShowResultSchema.extend({ kind: z.literal('pattern') }),
   apgExampleShowResultSchema.extend({ kind: z.literal('example') }),
]);
export type ApgLookupResult = z.infer<typeof apgLookupResultSchema>;

export const apgPatternSummarySchema = z.object({
   id: z.string().min(1),
   title: z.string().min(1),
   pageUrl: z.string().url(),
   exampleCount: z.number().int().nonnegative(),
});
export type ApgPatternSummary = z.infer<typeof apgPatternSummarySchema>;

export const apgPatternListResultSchema = z.object({
   document: w3cDocumentSourceSchema,
   patterns: z.array(apgPatternSummarySchema),
});
export type ApgPatternListResult = z.infer<typeof apgPatternListResultSchema>;

/**
 * The examples the APG example index files under one role or one attribute. `key` is the
 * role or attribute searched for, so a caller can print what it matched on.
 */
export const apgFindResultSchema = z.object({
   document: w3cDocumentSourceSchema,
   key: z.string().min(1),
   kind: z.enum(['role', 'attribute']),
   examples: z.array(
      z.object({
         id: z.string().min(1),
         patternId: z.string().min(1),
         title: z.string().min(1),
         pageUrl: z.string().url(),
      }),
   ),
});
export type ApgFindResult = z.infer<typeof apgFindResultSchema>;

import {
   axeRuleLookupResultSchema,
   criterionShowResultSchema,
   techniqueLookupResultSchema,
   understandingLookupResultSchema,
   type AxeRuleLookupResult,
   type CliOutputEnvelope,
   type CriterionShowResult,
   type NormalizedCriterion,
   type NormalizedTechnique,
   type W3cDocumentSource,
} from '#contracts';
import {
   badge,
   code,
   dim,
   fields,
   getTerminalWidth,
   indent,
   section,
   wrap,
} from '../lib/format.js';
import { stripHtml } from '../lib/text.js';
import {
   attributionLine,
   criterionLine,
   techniqueLine,
   type RenderOptions,
} from './shared.js';
import { failsSection, testingSection, verboseCoverageLines } from './wcag-testing.js';

export type CriterionDetailSection = 'testing' | 'fails';

const allSections: ReadonlyArray<CriterionDetailSection> = ['testing', 'fails'];

function normalizeProse(value: string): string {
   return stripHtml(value)
      .replaceAll(/[\s.]+$/g, '')
      .toLowerCase();
}

function dedupeTechniques(techniques: NormalizedTechnique[]): NormalizedTechnique[] {
   const seen = new Set<string>();
   return techniques.filter((technique) => {
      if (technique.isSynthetic || seen.has(technique.key)) {
         return false;
      }
      seen.add(technique.key);
      return true;
   });
}

/**
 * The requirement in the W3C's own words, then a plain restatement of what to do (the
 * Understanding document's In Brief or Intent opening). Neither carries a heading: the
 * text under the title already answers "what must be true" and "what does that mean".
 */
function requirementLines(
   input: {
      criterion: NormalizedCriterion;
      understandingExcerpt: string | undefined;
      understandingSource: W3cDocumentSource | undefined;
   },
   options: RenderOptions,
): string[] {
   const { criterion, understandingExcerpt, understandingSource } = input;
   const lines = ['', ...wrap(stripHtml(criterion.normativeText), 1, options.width)];
   const restatementIsNew =
      understandingExcerpt &&
      !normalizeProse(understandingExcerpt).startsWith(
         normalizeProse(criterion.normativeText),
      );
   if (restatementIsNew) {
      lines.push('', ...wrap(understandingExcerpt, 1, options.width));
      if (understandingSource) {
         lines.push('', ...wrap(attributionLine(understandingSource), 1, options.width));
      }
   }
   return lines;
}

function headerLines(
   input: {
      criterion: NormalizedCriterion;
      understandingExcerpt: string | undefined;
      understandingSource: W3cDocumentSource | undefined;
   },
   options: RenderOptions,
): string[] {
   return [
      criterionLine(input.criterion),
      dim(
         `Guideline ${input.criterion.guideline.number} ${input.criterion.guideline.title}`,
      ),
      ...requirementLines(input, options),
   ];
}

function verboseDetailLines(result: CriterionShowResult): string[] {
   const advisory = dedupeTechniques(result.criterion.advisoryTechniques);
   const advisoryLine =
      advisory.map((technique) => technique.id ?? technique.title).join(', ') || 'none';
   return [
      ...verboseCoverageLines({ coverage: result.coverage, strategy: result.strategy }),
      ...section(
         'Details',
         fields([
            ['Slug', result.criterion.slug],
            ['WCAG version', result.criterion.wcagVersion],
            ['Tags', result.criterion.tags.join(', ') || 'none'],
            ['Advisory techniques', advisoryLine],
         ]),
      ),
   ];
}

/**
 * Renders one criterion as an answer to the questions a reader has, in order: what must
 * be true, what that means for the page, how to test it, and what to do when it fails.
 * `sections` limits the output to a subset, which the interactive finder uses for its
 * hotkeys. A section with nothing to say is left out rather than printed empty.
 */
export function renderCriterionDetailLines(
   result: CriterionShowResult,
   options: RenderOptions & {
      sections?: ReadonlyArray<CriterionDetailSection> | undefined;
   },
): string[] {
   const sections = options.sections ?? allSections;
   const { criterion } = result;
   const lines = headerLines(
      {
         criterion,
         understandingExcerpt: result.understandingExcerpt,
         understandingSource: result.understandingSource,
      },
      options,
   );

   if (sections.includes('testing')) {
      lines.push(
         ...testingSection({
            criterionId: criterion.id,
            coverage: result.coverage,
            strategy: result.strategy,
            width: options.width ?? getTerminalWidth(),
         }),
      );
   }
   if (sections.includes('fails')) {
      lines.push(
         ...failsSection({
            criterionId: criterion.id,
            techniques: dedupeTechniques(criterion.techniques),
            failures: dedupeTechniques(criterion.failures),
            width: options.width ?? getTerminalWidth(),
         }),
      );
   }
   if (options.verbose) {
      lines.push(...verboseDetailLines(result));
   }
   return lines;
}

// Fallow-ignore-next-line unused-export
export function renderShowCriterionText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   return renderCriterionDetailLines(
      criterionShowResultSchema.parse(envelope.result),
      options,
   ).join('\n');
}

function criteriaSection(criteria: NormalizedCriterion[]): string[] {
   const body = criteria.map((criterion) => criterionLine(criterion));
   return section(
      `Criteria ${dim(`(${criteria.length})`)}`,
      criteria.length === 0 ? [dim('No WCAG criterion maps to this rule.')] : body,
   );
}

function fixSection(result: AxeRuleLookupResult, options: RenderOptions): string[] {
   const guidance = result.description ? wrap(result.description, 0, options.width) : [];
   const body = result.helpUrl ? [...guidance, result.helpUrl] : guidance;
   if (body.length === 0) {
      return [];
   }
   return section('Fix', body);
}

function axeRuleVerboseLines(result: AxeRuleLookupResult): string[] {
   return section(
      'Details',
      fields([
         ['Tags', result.rule.tags.join(', ') || 'none'],
         ['ACT rules', result.rule.actIds.join(', ') || 'none'],
      ]),
   );
}

// Fallow-ignore-next-line unused-export
export function renderAxeRuleText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = axeRuleLookupResultSchema.parse(envelope.result);
   const lines = [
      `${code(result.ruleId)}  ${result.help ?? dim('help text unavailable in the installed axe-core')}`,
      ...criteriaSection(result.criteria),
      ...fixSection(result, options),
   ];
   if (options.verbose) {
      lines.push(...axeRuleVerboseLines(result));
   }
   return lines.join('\n');
}

function techniqueBodySection(
   result: ReturnType<typeof techniqueLookupResultSchema.parse>,
   options: RenderOptions,
): string[] {
   if (!result.body || !result.document) {
      return [];
   }
   return [
      ...section('Body', wrap(result.body, 0, options.width)),
      '',
      attributionLine(result.document),
   ];
}

// Fallow-ignore-next-line unused-export
export function renderTechniqueText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = techniqueLookupResultSchema.parse(envelope.result);
   const { technique } = result;
   const lines = [
      ...wrap(techniqueLine(technique), 0, options.width),
      ...section(
         `Criteria ${dim(`(${result.criteria.length})`)}`,
         result.criteria.map(criterionLine),
      ),
      ...techniqueBodySection(result, options),
   ];
   if (options.verbose) {
      lines.push(
         ...indent(
            fields([
               ['Kind', badge(technique.kind)],
               ['URL', technique.url ?? 'none'],
            ]),
         ),
      );
   }
   return lines.join('\n');
}

/**
 * Full Understanding document lines: the criterion header, the whole converted body, and
 * the attribution line the W3C Document License requires on every copy. Shared by the
 * `wcag understanding` text renderer and the interactive finder's detail pane.
 */
export function understandingDetailLines(
   result: ReturnType<typeof understandingLookupResultSchema.parse>,
   options: RenderOptions,
): string[] {
   return [
      criterionLine(result.criterion),
      dim(
         `Guideline ${result.criterion.guideline.number} ${result.criterion.guideline.title}`,
      ),
      '',
      ...wrap(result.body, 0, options.width),
      '',
      attributionLine(result.document),
   ];
}

// Fallow-ignore-next-line unused-export
export function renderUnderstandingText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   return understandingDetailLines(
      understandingLookupResultSchema.parse(envelope.result),
      options,
   ).join('\n');
}

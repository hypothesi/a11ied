import {
   axeRuleLookupResultSchema,
   coverageLookupResultSchema,
   techniqueLookupResultSchema,
   type AxeRuleLookupResult,
   type CliOutputEnvelope,
   type CoverageLookupResult,
   type NormalizedCriterion,
   type NormalizedTechnique,
} from '#contracts';
import {
   badge,
   code,
   dim,
   fields,
   indent,
   listItems,
   section,
   wrap,
} from '../lib/format.js';
import { stripHtml } from '../lib/text.js';
import {
   criterionLine,
   hangingTechniqueLines,
   nextCommandLine,
   techniqueLine,
   type RenderOptions,
} from './shared.js';

export type CriterionDetailSection = 'coverage' | 'techniques' | 'failures';

const allSections: ReadonlyArray<CriterionDetailSection> = [
   'coverage',
   'techniques',
   'failures',
];

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

function techniqueLines(
   techniques: NormalizedTechnique[],
   options: RenderOptions,
): string[] {
   return techniques.flatMap((technique) => {
      const lines = hangingTechniqueLines(technique, options.width);
      if (options.verbose && technique.url) {
         lines.push(...indent([dim(technique.url)], 1));
      }
      return lines;
   });
}

function techniqueSection(
   name: string,
   techniques: NormalizedTechnique[],
   options: RenderOptions,
): string[] {
   const unique = dedupeTechniques(techniques);
   return section(
      `${name} ${dim(`(${unique.length})`)}`,
      unique.length === 0 ? [dim('none')] : techniqueLines(unique, options),
   );
}

function coverageSection(result: CoverageLookupResult, options: RenderOptions): string[] {
   const lines = fields([
      ['State', badge(result.coverage.coverageState)],
      ['axe rules', result.coverage.axeRuleIds.join(', ') || dim('none')],
      ['ACT rules', result.coverage.actRuleIds.join(', ') || dim('none')],
      ['Evidence', badge(result.strategy.preferredEvidenceMode)],
      ['Procedures', result.strategy.procedureIds.join(', ') || dim('none')],
      [
         'Next',
         nextCommandLine({ criterionId: result.criterion.id, strategy: result.strategy }),
      ],
   ]);
   if (options.verbose) {
      const notes = new Set([...result.coverage.notes, ...result.strategy.notes]);
      lines.push(...listItems([...notes]));
   }
   return section('Coverage', lines);
}

function headerLines(criterion: NormalizedCriterion, options: RenderOptions): string[] {
   const lines = [
      criterionLine(criterion),
      dim(`Guideline ${criterion.guideline.number} ${criterion.guideline.title}`),
   ];
   // Most summaries repeat the normative text, or its first sentence; print it once.
   if (
      !normalizeProse(criterion.normativeText).startsWith(
         normalizeProse(criterion.summary),
      )
   ) {
      lines.push('', ...wrap(criterion.summary, 1, options.width));
   }
   lines.push(
      ...section(
         'Normative text',
         wrap(stripHtml(criterion.normativeText), 0, options.width),
      ),
      ...section('Understanding', [criterion.understandingUrl]),
   );
   return lines;
}

function detailLines(criterion: NormalizedCriterion): string[] {
   return section(
      'Details',
      fields([
         ['Slug', criterion.slug],
         ['WCAG version', criterion.wcagVersion],
         ['Tags', criterion.tags.join(', ') || 'none'],
      ]),
   );
}

/**
 * Renders one criterion with its coverage, techniques, and failures. `sections` limits
 * the output to a subset, which the interactive finder uses for its hotkeys.
 */
export function renderCriterionDetailLines(
   result: CoverageLookupResult,
   options: RenderOptions & {
      sections?: ReadonlyArray<CriterionDetailSection> | undefined;
   },
): string[] {
   const sections = options.sections ?? allSections;
   const { criterion } = result;
   const lines = headerLines(criterion, options);

   if (sections.includes('coverage')) {
      lines.push(...coverageSection(result, options));
   }
   if (sections.includes('techniques')) {
      lines.push(...techniqueSection('Techniques', criterion.techniques, options));
      lines.push(
         ...techniqueSection(
            'Advisory techniques',
            criterion.advisoryTechniques,
            options,
         ),
      );
   }
   if (sections.includes('failures')) {
      lines.push(...techniqueSection('Failures', criterion.failures, options));
   }
   if (options.verbose) {
      lines.push(...detailLines(criterion));
   }
   return lines;
}

// Fallow-ignore-next-line unused-export
export function renderShowCriterionText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   return renderCriterionDetailLines(
      coverageLookupResultSchema.parse(envelope.result),
      options,
   ).join('\n');
}

function criterionTechniqueSummary(criterion: NormalizedCriterion): string[] {
   const ids = (techniques: NormalizedTechnique[]): string =>
      dedupeTechniques(techniques)
         .map((technique) => technique.id ?? technique.title)
         .join(', ') || dim('none');
   return fields([
      ['Techniques', ids(criterion.techniques)],
      ['Failures', ids(criterion.failures)],
      ['Show', code(`a1 wcag ${criterion.id}`)],
   ]);
}

function criteriaSection(
   criteria: NormalizedCriterion[],
   options: RenderOptions,
): string[] {
   const body = criteria.flatMap((criterion) => [
      criterionLine(criterion),
      ...indent(
         criterionTechniqueSummary(criterion).flatMap((line) =>
            wrap(line, 0, options.width),
         ),
      ),
   ]);
   return section(
      `Criteria ${dim(`(${criteria.length})`)}`,
      criteria.length === 0 ? [dim('No WCAG criterion maps to this rule.')] : body,
   );
}

function fixSection(result: AxeRuleLookupResult, options: RenderOptions): string[] {
   const guidance = result.description ? wrap(result.description, 0, options.width) : [];
   const understanding = result.criteria.map(
      (criterion) => `${code(criterion.id)}  ${criterion.understandingUrl}`,
   );
   return section('Fix', [
      ...guidance,
      ...(result.helpUrl ? [result.helpUrl] : []),
      ...understanding,
   ]);
}

// Fallow-ignore-next-line unused-export
export function renderAxeRuleText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = axeRuleLookupResultSchema.parse(envelope.result);
   const lines = [
      `${code(result.ruleId)}  ${result.help ?? dim('help text unavailable in the installed axe-core')}`,
      ...indent(
         fields([
            ['Tags', result.rule.tags.join(', ') || dim('none')],
            ['ACT rules', result.rule.actIds.join(', ') || dim('none')],
         ]),
      ),
      ...criteriaSection(result.criteria, options),
      ...fixSection(result, options),
   ];
   return lines.join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderTechniqueText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = techniqueLookupResultSchema.parse(envelope.result);
   const { technique } = result;
   return [
      ...wrap(techniqueLine(technique), 0, options.width),
      ...indent(
         fields([
            ['Kind', badge(technique.kind)],
            ['URL', technique.url ?? dim('none')],
         ]),
      ),
      ...section(
         `Criteria ${dim(`(${result.criteria.length})`)}`,
         result.criteria.map(criterionLine),
      ),
   ].join('\n');
}

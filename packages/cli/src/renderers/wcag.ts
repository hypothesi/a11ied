import type { CliOutputEnvelope } from '#contracts';
import {
   badge,
   count,
   dim,
   fields,
   indent,
   listItems,
   section,
   title,
   wrap,
} from '../lib/format.js';
import { stripHtml } from '../lib/text.js';
import { criterionLine, type CriterionSummary, type RenderOptions } from './shared.js';

const MATCH_DEPTH = 2;

// Fallow-ignore-next-line unused-export
export function renderWcagLevelsText(
   envelope: CliOutputEnvelope,
   _options: RenderOptions,
): string {
   const result = envelope.result as { version: string; levels: string[] };
   return [
      title(`WCAG ${result.version}`),
      ...indent(fields([['Levels', result.levels.join(', ')]])),
   ].join('\n');
}

function groupByGuideline(
   criteria: CriterionSummary[],
): Array<{ label: string; criteria: CriterionSummary[] }> {
   const groups = new Map<string, { label: string; criteria: CriterionSummary[] }>();

   for (const criterion of criteria) {
      const key = criterion.guideline?.number ?? '';
      const label = criterion.guideline
         ? `${criterion.guideline.number} ${criterion.guideline.title}`
         : 'Criteria';
      const group = groups.get(key) ?? { label, criteria: [] };
      group.criteria.push(criterion);
      groups.set(key, group);
   }

   return [...groups.values()];
}

// Fallow-ignore-next-line unused-export
export function renderCriteriaText(
   envelope: CliOutputEnvelope,
   _options: RenderOptions,
): string {
   const result = envelope.result as {
      version: string;
      level: string;
      criteria: CriterionSummary[];
   };
   const scope = result.level === 'all' ? 'all levels' : `level ${result.level}`;
   const lines = [
      `${title(`WCAG ${result.version}`)}  ${dim(`${scope}, ${count(result.criteria.length, 'criterion', 'criteria')}`)}`,
   ];

   for (const group of groupByGuideline(result.criteria)) {
      lines.push(...section(group.label, group.criteria.map(criterionLine)));
   }

   return lines.join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderShowCriterionText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const { criterion } = envelope.result as {
      criterion: CriterionSummary & {
         slug?: string;
         wcagVersion?: string;
         summary: string;
         normativeText: string;
         understandingUrl: string;
         tags?: string[];
      };
   };
   const lines = [criterionLine(criterion)];

   if (criterion.guideline) {
      lines.push(
         dim(`Guideline ${criterion.guideline.number} ${criterion.guideline.title}`),
      );
   }
   lines.push('', ...wrap(criterion.summary, 1));
   lines.push(...section('Normative text', wrap(stripHtml(criterion.normativeText))));
   lines.push(...section('Understanding', [criterion.understandingUrl]));

   if (options.verbose) {
      lines.push(
         ...section(
            'Details',
            fields([
               ['Slug', criterion.slug ?? 'none'],
               ['WCAG version', criterion.wcagVersion ?? 'unknown'],
               ['Tags', criterion.tags?.join(', ') || 'none'],
            ]),
         ),
      );
   }

   return lines.join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderSearchText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = envelope.result as {
      query: string;
      results: Array<{
         criterionId: string;
         title: string;
         level: string;
         score: number;
         matches?: Array<{ field: string; snippet: string }>;
      }>;
   };
   const lines = [
      `${title(`Search results for "${result.query}"`)}  ${dim(count(result.results.length, 'match', 'matches'))}`,
      '',
   ];

   for (const entry of result.results) {
      const summary = { id: entry.criterionId, title: entry.title, level: entry.level };
      lines.push(
         ...indent([`${criterionLine(summary)}  ${dim(`score ${entry.score}`)}`]),
      );
      if (options.verbose && entry.matches?.length) {
         const matchLines = entry.matches.map(
            (match) => `${dim(`${match.field}:`)} ${match.snippet}`,
         );
         lines.push(...indent(matchLines, MATCH_DEPTH));
      }
   }

   if (result.results.length === 0) {
      lines.push(...indent([dim('No criteria matched.')]));
   }

   return lines.join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderCoverageText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = envelope.result as {
      criterion: { id: string; title: string };
      coverage: { coverageState: string; axeRuleIds: string[]; actRuleIds: string[] };
      strategy: {
         preferredEvidenceMode: string;
         procedureIds: string[];
         notes?: string[];
      };
   };
   const lines = [
      criterionLine(result.criterion),
      ...section(
         'Coverage',
         fields([
            ['State', badge(result.coverage.coverageState)],
            ['axe rules', result.coverage.axeRuleIds.join(', ') || dim('none')],
            ['ACT rules', result.coverage.actRuleIds.join(', ') || dim('none')],
         ]),
      ),
      ...section(
         'Strategy',
         fields([
            ['Evidence', badge(result.strategy.preferredEvidenceMode)],
            ['Procedures', result.strategy.procedureIds.join(', ') || dim('none')],
         ]),
      ),
   ];

   if (options.verbose) {
      lines.push(...section('Strategy notes', listItems(result.strategy.notes ?? [])));
   }

   return lines.join('\n');
}

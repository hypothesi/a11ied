import {
   coverageSummaryArtifactSchema,
   criterionSearchResponseSchema,
   type CliOutputEnvelope,
} from '#contracts';
import { count, dim, indent, section, title } from '../lib/format.js';
import { criterionLine, type CriterionSummary, type RenderOptions } from './shared.js';

const MATCH_DEPTH = 2;
const SUMMARY_COLUMN_WIDTH = 11;
const SUMMARY_LEVELS = ['A', 'AA', 'AAA'] as const;

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

function summaryRow(cells: Array<string | number>): string {
   return cells
      .map((cell) => String(cell).padEnd(SUMMARY_COLUMN_WIDTH))
      .join('')
      .trimEnd();
}

// Fallow-ignore-next-line unused-export
export function renderCoverageSummaryText(
   envelope: CliOutputEnvelope,
   _options: RenderOptions,
): string {
   const summary = coverageSummaryArtifactSchema.parse(envelope.result);
   const buckets = [
      ...SUMMARY_LEVELS.map((level) => [level, summary.byLevel[level]] as const),
      ['All', summary.totals] as const,
   ];
   const table = [
      dim(summaryRow(['Level', 'Criteria', 'Automated', 'Hybrid', 'Manual', 'Unknown'])),
      ...buckets.map(([label, bucket]) =>
         summaryRow([
            label,
            bucket.criteria,
            bucket.automated,
            bucket.hybrid,
            bucket.manual,
            bucket.unknown,
         ]),
      ),
   ];
   const sources = summary.coverageSources;

   return [
      `${title(`WCAG ${summary.version} coverage`)}  ${dim(`updated ${summary.updatedAt.slice(0, 'YYYY-MM-DD'.length)}`)}`,
      ...indent(table),
      '',
      ...indent([
         `${sources.criteriaWithAxe} criteria have an axe rule, ${sources.criteriaWithAct} have an ACT rule, ${sources.criteriaWithBoth} have both.`,
      ]),
   ].join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderSearchText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = criterionSearchResponseSchema.parse(envelope.result);
   const lines = [
      `${title(`Search results for "${result.query}"`)}  ${dim(count(result.results.length, 'match', 'matches'))}`,
      '',
   ];

   for (const entry of result.results) {
      const summary = { id: entry.criterionId, title: entry.title, level: entry.level };
      lines.push(
         ...indent([`${criterionLine(summary)}  ${dim(`score ${entry.score}`)}`]),
      );
      if (options.verbose && entry.matches.length > 0) {
         const matchLines = entry.matches.map(
            (match) => `${dim(`${match.field}:`)} ${match.text}`,
         );
         lines.push(...indent(matchLines, MATCH_DEPTH));
      }
   }

   if (result.results.length === 0) {
      lines.push(...indent([dim('No criteria matched.')]));
   }

   return lines.join('\n');
}

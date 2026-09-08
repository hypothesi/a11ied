import {
   testMethodSummaryArtifactSchema,
   unifiedSearchResultSchema,
   type CliOutputEnvelope,
} from '#contracts';
import {
   count,
   dim,
   indent,
   section,
   table as renderTable,
   title,
} from '../lib/format.js';
import {
   criterionLine,
   showCriterionHintLine,
   type CriterionSummary,
   type RenderOptions,
} from './shared.js';
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
   if (result.criteria.length > 0) {
      lines.push('', showCriterionHintLine());
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
export function renderTestMethodSummaryText(
   envelope: CliOutputEnvelope,
   _options: RenderOptions,
): string {
   const summary = testMethodSummaryArtifactSchema.parse(envelope.result);
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
   const sources = summary.ruleSources;

   return [
      `${title(`WCAG ${summary.version} test methods`)}  ${dim(`updated ${summary.updatedAt.slice(0, 'YYYY-MM-DD'.length)}`)}`,
      ...indent(table),
      '',
      ...indent([
         `${sources.criteriaWithAxe} criteria have an axe rule, ${sources.criteriaWithAct} have an ACT rule, ${sources.criteriaWithBoth} have both.`,
      ]),
   ].join('\n');
}

/**
 * One ranked list across both corpora, with the kind as the first column so a reader can
 * tell a criterion from an ARIA pattern at a glance.
 */
export function renderUnifiedSearchText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const result = unifiedSearchResultSchema.parse(envelope.result);

   if (result.rows.length === 0) {
      return [
         `${title(`Search results for "${result.query}"`)}  ${dim('no matches')}`,
         '',
         ...indent([dim('Nothing in the WCAG or ARIA pattern data matched.')]),
      ].join('\n');
   }

   const rows = result.rows.map((row) => [
      dim(row.kind),
      row.id,
      row.title,
      row.context ?? '',
   ]);

   const lines = [
      `${title(`Search results for "${result.query}"`)}  ${dim(count(result.rows.length, 'match', 'matches'))}`,
      '',
      ...indent(renderTable(['Kind', 'Id', 'Title', 'Where'], rows)),
   ];

   if (options.verbose) {
      const matched = result.rows
         .filter((row) => row.matchedOn !== undefined)
         .map((row) => `${dim(`${row.id}:`)} ${row.matchedOn ?? ''}`);
      lines.push('', ...indent(matched));
   }

   lines.push(
      '',
      `${dim('Run')} a1 wcag <id> ${dim('or')} a1 pattern <id> ${dim('for one row')}`,
   );
   return lines.join('\n');
}

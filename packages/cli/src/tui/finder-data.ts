import { listWcagCriteria, searchWcagCriteria, showWcagCriterion } from '#core';
import { errorLine } from '../lib/format.js';
import {
   renderCriterionDetailLines,
   type CriterionDetailSection,
} from '../renderers/wcag-show.js';

export type FinderSection = 'all' | CriterionDetailSection;

export interface FinderRow {
   id: string;
   slug: string;
   title: string;
   level: string;
   hint: string;
}

const SEARCH_LIMIT = 50;
const sectionFilters: Readonly<
   Record<FinderSection, ReadonlyArray<CriterionDetailSection> | undefined>
> = {
   all: undefined,
   coverage: ['coverage'],
   techniques: ['techniques'],
   failures: ['failures'],
};

function listAllRows(version: string): FinderRow[] {
   return listWcagCriteria(undefined, version).criteria.map((criterion) => ({
      id: criterion.id,
      slug: criterion.slug,
      title: criterion.title,
      level: criterion.level,
      hint: '',
   }));
}

function matchHint(matches: Array<{ field: string; text: string }>): string {
   const match = matches.find(
      (entry) => entry.field === 'technique' || entry.field === 'failure',
   );
   if (!match) {
      return '';
   }
   return `${match.field}: ${match.text}`;
}

/**
 * Rows for the result list. Criterion ids and slugs match by prefix first, then the
 * ranked search over titles, summaries, techniques, failures, and tags fills the rest.
 */
export function listFinderRows(query: string, version: string): FinderRow[] {
   const trimmed = query.trim().toLowerCase();
   const all = listAllRows(version);
   if (trimmed.length === 0) {
      return all;
   }

   const direct = all.filter(
      (row) => row.id.startsWith(trimmed) || row.slug.includes(trimmed),
   );
   const directIds = new Set(direct.map((row) => row.id));
   const ranked = searchWcagCriteria(trimmed, { version, limit: SEARCH_LIMIT })
      .results.filter((result) => !directIds.has(result.criterionId))
      .map((result) => ({
         id: result.criterionId,
         slug: result.slug,
         title: result.title,
         level: result.level,
         hint: matchHint(result.matches),
      }));
   return [...direct, ...ranked];
}

/** Detail pane lines for one criterion, limited to the section a hotkey selected. */
export function buildDetailLines(input: {
   criterionId: string;
   version: string;
   section: FinderSection;
   width: number;
}): string[] {
   try {
      return renderCriterionDetailLines(
         showWcagCriterion(input.criterionId, input.version),
         { verbose: true, width: input.width, sections: sectionFilters[input.section] },
      );
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [errorLine('lookup-failed', message)];
   }
}

export function axeCommandFor(criterionId: string): string {
   return `a1 axe --criterion ${criterionId}`;
}

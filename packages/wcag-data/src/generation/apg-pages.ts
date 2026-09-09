import type { ParsedApgPatternLink } from '../sources/apg/index-pages.js';
import {
   parseApgPatternPage,
   type ParsedApgPatternPage,
} from '../sources/apg/pattern-page.js';
import type { FetchLike } from '../shared/types.js';
import { mapWithConcurrency } from '../sources/documents/pool.js';
import { errorMessage, fetchText, type ApgFetchFailure } from './apg-shared.js';

type PatternPageOutcome =
   | { kind: 'page'; patternId: string; page: ParsedApgPatternPage }
   | { kind: 'failure'; failure: ApgFetchFailure };

/**
 * Reads the published page rather than the source file in the aria-practices repository.
 * The index links to the page, whereas the source file's name does not follow the pattern
 * id: the menubar pattern lives in `menu-and-menubar-pattern.html`.
 */
async function fetchPatternPage(
   link: ParsedApgPatternLink,
   fetchImpl: FetchLike,
): Promise<PatternPageOutcome> {
   try {
      const page = parseApgPatternPage(
         await fetchText(link.pageUrl, fetchImpl),
         link.pageUrl,
         `${link.id}/index.html`,
      );
      return { kind: 'page', patternId: link.id, page };
   } catch (error) {
      return {
         kind: 'failure',
         failure: { patternId: link.id, url: link.pageUrl, message: errorMessage(error) },
      };
   }
}

/** Fetches every pattern page the index lists, keeping the ones that parsed. */
export async function fetchPatternPages(
   links: ParsedApgPatternLink[],
   options: { fetchImpl: FetchLike; concurrency: number },
): Promise<{ pages: Map<string, ParsedApgPatternPage>; failures: ApgFetchFailure[] }> {
   const outcomes = await mapWithConcurrency(
      links,
      (link) => fetchPatternPage(link, options.fetchImpl),
      { concurrency: options.concurrency },
   );
   const failures: ApgFetchFailure[] = [],
      pages = new Map<string, ParsedApgPatternPage>();
   for (const outcome of outcomes) {
      if (outcome.kind === 'page') {
         pages.set(outcome.patternId, outcome.page);
      } else {
         failures.push(outcome.failure);
      }
   }
   return { pages, failures };
}

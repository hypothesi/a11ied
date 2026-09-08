import {
   ApgParseError,
   collapseWhitespace,
   findById,
   PAGE_BASE,
   parseDocument,
   SOURCE_BASE,
} from './shared.js';

const EXAMPLE_HREF =
   /^\.\.\/patterns\/(?<pattern>[a-z0-9-]+)\/examples\/(?<example>[a-z0-9-]+)(?:\/|\.html)$/u;
const PATTERN_HREF = /^(?<pattern>[a-z0-9-]+)\/$/u;
const ROLE_INDEX_LABEL = 'examples_by_role_label';
const ATTRIBUTE_INDEX_LABEL = 'examples_by_props_label';
const EXPERIMENTAL_LIST_ID = 'examples_experimental_ul';
const KEY_CELL = 0;
const EXAMPLES_CELL = 1;

/**
 * The example index is the list every other fetch is derived from, and the pattern index
 * is where the titles come from. A page restructure that drops most of the links has to
 * fail the sync rather than write a small artifact.
 */
const MIN_EXAMPLE_COUNT = 50;
const MIN_PATTERN_COUNT = 20;

export interface ParsedApgExampleLink {
   id: string;
   patternId: string;
   title: string;
   pageUrl: string;
   sourceUrl: string;
   experimental: boolean;
}

export interface ParsedApgPatternLink {
   id: string;
   title: string;
   pageUrl: string;
}

export interface ParsedApgExampleIndex {
   examples: ParsedApgExampleLink[];
   roleIndex: Record<string, string[]>;
   attributeIndex: Record<string, string[]>;
}

function matchExampleHref(
   href: string,
): { pattern: string; example: string } | undefined {
   const match = EXAMPLE_HREF.exec(href);
   if (!match?.groups?.pattern || !match.groups.example) {
      return undefined;
   }
   return { pattern: match.groups.pattern, example: match.groups.example };
}

function collectExampleIdsFrom(root: Element | null | undefined): string[] {
   const ids: string[] = [];
   if (!root) {
      return ids;
   }
   for (const anchor of root.querySelectorAll('a[href]')) {
      const matched = matchExampleHref(anchor.getAttribute('href') ?? '');
      if (matched && !ids.includes(matched.example)) {
         ids.push(matched.example);
      }
   }
   return ids;
}

/**
 * Reads one of the index's two lookup tables: the first cell is the role or attribute,
 * and the second holds a link per example filed under it.
 */
function readIndexTable(
   doc: Document,
   labelId: string,
   fileName: string,
): Record<string, string[]> {
   const table = doc.querySelector(`table[aria-labelledby="${labelId}"]`);
   if (!table) {
      throw new ApgParseError(fileName, `no table labeled by ${labelId}`);
   }

   const index: Record<string, string[]> = {};
   for (const row of table.querySelectorAll('tbody tr')) {
      const cells = [...row.children];
      const key = collapseWhitespace(cells.at(KEY_CELL)?.textContent ?? '');
      const ids = collectExampleIdsFrom(cells.at(EXAMPLES_CELL));
      if (key.length > 0 && ids.length > 0) {
         index[key] = ids;
      }
   }
   return index;
}

function buildExampleLink(input: {
   experimental: boolean;
   example: string;
   pattern: string;
   title: string;
}): ParsedApgExampleLink {
   return {
      id: input.example,
      patternId: input.pattern,
      title: input.title,
      pageUrl: `${PAGE_BASE}/${input.pattern}/examples/${input.example}/`,
      sourceUrl: `${SOURCE_BASE}/${input.pattern}/examples/${input.example}.html`,
      experimental: input.experimental,
   };
}

function readExampleLinks(doc: Document): Map<string, ParsedApgExampleLink> {
   const experimental = new Set(
      collectExampleIdsFrom(findById(doc, EXPERIMENTAL_LIST_ID)),
   );
   const byId = new Map<string, ParsedApgExampleLink>();

   for (const anchor of doc.querySelectorAll('a[href]')) {
      const matched = matchExampleHref(anchor.getAttribute('href') ?? '');
      const title = collapseWhitespace(anchor.textContent ?? '');
      if (!matched || byId.has(matched.example) || title.length === 0) {
         continue;
      }
      byId.set(
         matched.example,
         buildExampleLink({
            experimental: experimental.has(matched.example),
            example: matched.example,
            pattern: matched.pattern,
            title,
         }),
      );
   }
   return byId;
}

/**
 * Parses the APG example index into the example list and the role and attribute indexes
 * the page publishes.
 *
 * The indexes are read from the page rather than derived from the example files, because
 * the APG builds them itself and its answer is the one a reader of the site would get.
 */
export function parseExampleIndex(
   html: string,
   fileName = 'example-index.html',
): ParsedApgExampleIndex {
   const doc = parseDocument(html);
   const byId = readExampleLinks(doc);

   if (byId.size < MIN_EXAMPLE_COUNT) {
      throw new ApgParseError(
         fileName,
         `found ${byId.size} examples, expected at least ${MIN_EXAMPLE_COUNT}`,
      );
   }

   return {
      examples: [...byId.values()],
      roleIndex: readIndexTable(doc, ROLE_INDEX_LABEL, fileName),
      attributeIndex: readIndexTable(doc, ATTRIBUTE_INDEX_LABEL, fileName),
   };
}

/**
 * Reads the pattern titles from the APG's pattern index. The titles are taken from the
 * page rather than title-cased from the slug, because the APG's own wording does not
 * follow from the slug: `accordion` is "Accordion (Sections With Show/Hide
 * Functionality)" and `alertdialog` is "Alert and Message Dialogs".
 */
export function parsePatternIndex(
   html: string,
   fileName = 'pattern-index.html',
): ParsedApgPatternLink[] {
   const doc = parseDocument(html);
   const byId = new Map<string, ParsedApgPatternLink>();

   for (const anchor of doc.querySelectorAll('a[href]')) {
      const id = PATTERN_HREF.exec(anchor.getAttribute('href') ?? '')?.groups?.pattern;
      const title = collapseWhitespace(anchor.textContent ?? '');
      if (!id || title.length === 0 || byId.has(id)) {
         continue;
      }
      byId.set(id, { id, title, pageUrl: `${PAGE_BASE}/${id}/` });
   }

   if (byId.size < MIN_PATTERN_COUNT) {
      throw new ApgParseError(
         fileName,
         `found ${byId.size} patterns, expected at least ${MIN_PATTERN_COUNT}`,
      );
   }

   return [...byId.values()];
}

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
   apgPatternsArtifactSchema,
   type ApgExample,
   type ApgPattern,
   type ApgPatternsArtifact,
} from '@a11ied/contracts';

import type {
   FetchLike,
   GeneratedArtifactWriteResult,
   GeneratedProvenanceManifest,
   WcagDataDirectories,
} from '../shared/types.js';
import { sha256, toJsonString } from '../shared/utils.js';
import { parseApgExample } from '../sources/apg/example.js';
import {
   parseExampleIndex,
   parsePatternIndex,
   type ParsedApgExampleIndex,
   type ParsedApgExampleLink,
   type ParsedApgPatternLink,
} from '../sources/apg/index-pages.js';
import { ensureWcagDataDirectories } from '../sources/definitions.js';
import { mapWithConcurrency } from '../sources/documents/pool.js';
import { writeGeneratedArtifact } from './version.js';

const DEFAULT_CONCURRENCY = 4;
const APG_PATTERNS_FILE_NAME = 'apg-patterns.json';
const MANIFEST_FILE_NAME = 'generated-provenance.json';

/** The example index and the pattern index, fetched once each alongside the examples. */
const INDEX_REQUEST_COUNT = 2;
const EXAMPLE_INDEX_URL = 'https://www.w3.org/WAI/ARIA/apg/example-index/';
const PATTERN_INDEX_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/';

/**
 * The document these tables are copied from.
 *
 * The APG is not published under `/TR/` and makes no "Status of This Document" statement
 * of its own, so this line is a description rather than a quotation. It says the thing a
 * reader of a command's output needs to know, which is how much authority the guidance
 * carries.
 */
const APG_DOCUMENT = {
   title: 'ARIA Authoring Practices Guide (APG)',
   url: 'https://www.w3.org/WAI/ARIA/apg/',
   status: 'W3C WAI resource, informative guidance that is not a W3C Recommendation',
} as const;

export interface ApgFetchFailure {
   exampleId: string;
   url: string;
   message: string;
}

export interface SyncApgPatternsResult {
   generated: GeneratedArtifactWriteResult;
   requestCount: number;
   patternCount: number;
   exampleCount: number;
   keyboardRowCount: number;
   attributeRowCount: number;
   /** Examples the APG documents with prose and no tables, such as the landmark examples. */
   tablelessExampleCount: number;
   failures: ApgFetchFailure[];
}

type ExampleOutcome =
   | { kind: 'example'; example: ApgExample }
   | { kind: 'failure'; failure: ApgFetchFailure };

function errorMessage(error: unknown): string {
   return error instanceof Error ? error.message : String(error);
}

async function fetchText(url: string, fetchImpl: FetchLike): Promise<string> {
   const response = await fetchImpl(url);
   if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
   }
   return response.text();
}

async function fetchExample(
   link: ParsedApgExampleLink,
   fetchImpl: FetchLike,
): Promise<ExampleOutcome> {
   try {
      const parsed = parseApgExample(await fetchText(link.sourceUrl, fetchImpl));
      return {
         kind: 'example',
         example: {
            id: link.id,
            patternId: link.patternId,
            title: link.title,
            pageUrl: link.pageUrl,
            sourceUrl: link.sourceUrl,
            experimental: link.experimental,
            keyboardTables: parsed.keyboardTables,
            attributeTables: parsed.attributeTables,
         },
      };
   } catch (error) {
      return {
         kind: 'failure',
         failure: {
            exampleId: link.id,
            url: link.sourceUrl,
            message: errorMessage(error),
         },
      };
   }
}

function sortById<TValue>(entries: Array<[string, TValue]>): Record<string, TValue> {
   return Object.fromEntries(
      entries.toSorted(([left], [right]) => left.localeCompare(right)),
   );
}

function buildPatterns(
   examples: ApgExample[],
   titles: Map<string, { title: string; pageUrl: string }>,
): Record<string, ApgPattern> {
   const byPattern = new Map<string, string[]>();
   for (const example of examples) {
      const ids = byPattern.get(example.patternId) ?? [];
      ids.push(example.id);
      byPattern.set(example.patternId, ids);
   }

   const entries: Array<[string, ApgPattern]> = [...byPattern.entries()].map(
      ([id, exampleIds]) => {
         const listed = titles.get(id);
         return [
            id,
            {
               id,
               title: listed?.title ?? id,
               pageUrl:
                  listed?.pageUrl ?? `https://www.w3.org/WAI/ARIA/apg/patterns/${id}/`,
               exampleIds: exampleIds.toSorted((left, right) =>
                  left.localeCompare(right),
               ),
            },
         ];
      },
   );
   return sortById(entries);
}

function countRows(examples: ApgExample[], kind: 'keyboard' | 'attribute'): number {
   let total = 0;
   for (const example of examples) {
      const tables =
         kind === 'keyboard' ? example.keyboardTables : example.attributeTables;
      for (const table of tables) {
         total += table.rows.length;
      }
   }
   return total;
}

function countTablelessExamples(examples: ApgExample[]): number {
   return examples.filter(
      (example) =>
         example.keyboardTables.length === 0 && example.attributeTables.length === 0,
   ).length;
}

function splitOutcomes(outcomes: ExampleOutcome[]): {
   examples: ApgExample[];
   failures: ApgFetchFailure[];
} {
   const examples: ApgExample[] = [],
      failures: ApgFetchFailure[] = [];
   for (const outcome of outcomes) {
      if (outcome.kind === 'example') {
         examples.push(outcome.example);
         continue;
      }
      failures.push(outcome.failure);
   }
   return { examples, failures };
}

/**
 * Keeps only the examples that were actually fetched, so an index entry whose source file
 * moved never leaves a role pointing at an example the artifact does not hold.
 */
function pruneIndex(
   index: Record<string, string[]>,
   known: Set<string>,
): Record<string, string[]> {
   const entries: Array<[string, string[]]> = [];
   for (const [key, ids] of Object.entries(index)) {
      const kept = ids.filter((id) => known.has(id));
      if (kept.length > 0) {
         entries.push([key, kept]);
      }
   }
   return sortById(entries);
}

async function readManifest(
   directories: WcagDataDirectories,
): Promise<GeneratedProvenanceManifest | undefined> {
   try {
      const raw = await readFile(join(directories.generated, MANIFEST_FILE_NAME), 'utf8');
      return JSON.parse(raw) as GeneratedProvenanceManifest;
   } catch {
      return undefined;
   }
}

/**
 * Adds the artifact to the provenance manifest, so an unexpected upstream change shows up
 * as a hash diff in review. The sync rewrites every listed hash after formatting, so the
 * value written here only has to exist.
 */
async function recordProvenance(
   directories: WcagDataDirectories,
   body: string,
): Promise<void> {
   const manifest = await readManifest(directories);
   if (!manifest) {
      return;
   }

   const entry = {
      fileName: APG_PATTERNS_FILE_NAME,
      sha256: sha256(body),
      sourceFileNames: [],
      sourceUrls: [EXAMPLE_INDEX_URL, PATTERN_INDEX_URL],
   };
   const others = manifest.artifacts.filter(
      (artifact) => artifact.fileName !== APG_PATTERNS_FILE_NAME,
   );
   const next: GeneratedProvenanceManifest = {
      ...manifest,
      artifacts: [...others, entry].toSorted((left, right) =>
         left.fileName.localeCompare(right.fileName),
      ),
   };
   await writeGeneratedArtifact(directories, MANIFEST_FILE_NAME, toJsonString(next));
}

function buildArtifact(input: {
   examples: ApgExample[];
   index: ParsedApgExampleIndex;
   patternLinks: ParsedApgPatternLink[];
}): ApgPatternsArtifact {
   const known = new Set(input.examples.map((example) => example.id));
   const titles = new Map(
      input.patternLinks.map((pattern) => [
         pattern.id,
         { title: pattern.title, pageUrl: pattern.pageUrl },
      ]),
   );

   return apgPatternsArtifactSchema.parse({
      document: APG_DOCUMENT,
      patterns: buildPatterns(input.examples, titles),
      examples: sortById(input.examples.map((example) => [example.id, example])),
      roleIndex: pruneIndex(input.index.roleIndex, known),
      attributeIndex: pruneIndex(input.index.attributeIndex, known),
   });
}

/**
 * Fetches the APG example index, the pattern index, and every example source file, and
 * writes the keyboard and attribute tables as one generated artifact.
 *
 * The artifact is not scoped to a WCAG version. The APG describes ARIA patterns, which do
 * not change between WCAG 2.1 and 2.2, so one file serves both the way
 * `mobile-guidance.json` does.
 */
export async function syncApgPatterns(options?: {
   directories?: WcagDataDirectories;
   fetchImpl?: FetchLike;
   concurrency?: number;
}): Promise<SyncApgPatternsResult> {
   const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY,
      directories = options?.directories ?? (await ensureWcagDataDirectories()),
      fetchImpl = options?.fetchImpl ?? fetch;

   const [exampleIndexHtml, patternIndexHtml] = await Promise.all([
      fetchText(EXAMPLE_INDEX_URL, fetchImpl),
      fetchText(PATTERN_INDEX_URL, fetchImpl),
   ]);

   const index = parseExampleIndex(exampleIndexHtml),
      patternLinks = parsePatternIndex(patternIndexHtml);

   const outcomes = await mapWithConcurrency(
      index.examples,
      (link) => fetchExample(link, fetchImpl),
      { concurrency },
   );
   const { examples, failures } = splitOutcomes(outcomes);
   const artifact = buildArtifact({ examples, index, patternLinks });
   const body = toJsonString(artifact);
   const generated = await writeGeneratedArtifact(
      directories,
      APG_PATTERNS_FILE_NAME,
      body,
   );
   await recordProvenance(directories, body);

   return {
      generated,
      requestCount: index.examples.length + INDEX_REQUEST_COUNT,
      patternCount: Object.keys(artifact.patterns).length,
      exampleCount: examples.length,
      keyboardRowCount: countRows(examples, 'keyboard'),
      attributeRowCount: countRows(examples, 'attribute'),
      tablelessExampleCount: countTablelessExamples(examples),
      failures,
   };
}

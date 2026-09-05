import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
   documentContentStoreSchema,
   failureIndexArtifactSchema,
   normalizedCriteriaArtifactSchema,
   techniqueIndexArtifactSchema,
   type FailureIndexArtifact,
   type NormalizedCriteriaArtifact,
   type TechniqueIndexArtifact,
   type WcagVersion,
} from '@a11ied/contracts';

import type {
   FetchLike,
   GeneratedArtifactWriteResult,
   WcagDataDirectories,
} from '../shared/types.js';
import { toJsonString } from '../shared/utils.js';
import { ensureWcagDataDirectories, wcagVersions } from '../sources/definitions.js';
import type { DocumentExtractMode } from '../sources/documents/convert.js';
import { buildDocumentRequests } from '../sources/documents/requests.js';
import type { DocumentRequest } from '../sources/documents/types.js';
import {
   assembleDocumentArtifacts,
   type AssembledDocuments,
} from './documents-assemble.js';
import {
   fetchDocuments,
   type FailedDocumentFetch,
   type FetchedDocumentEntry,
   type FetchDocumentOutcome,
} from './documents-fetch.js';
import { mergeWithExistingArtifacts } from './documents-merge.js';
import { writeGeneratedArtifact } from './version.js';

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_PACE_MS = 800;

interface VersionIndexes {
   criteriaArtifact: NormalizedCriteriaArtifact;
   techniqueIndexArtifact: TechniqueIndexArtifact;
   failureIndexArtifact: FailureIndexArtifact;
}

async function readGeneratedArtifact<TResult>(
   directories: WcagDataDirectories,
   fileName: string,
   schema: { parse: (data: unknown) => TResult },
): Promise<TResult> {
   const raw = await readFile(join(directories.generated, fileName), 'utf8');
   return schema.parse(JSON.parse(raw) as unknown);
}

async function loadVersionIndexes(
   directories: WcagDataDirectories,
   version: WcagVersion,
): Promise<VersionIndexes> {
   const [criteriaArtifact, techniqueIndexArtifact, failureIndexArtifact] =
      await Promise.all([
         readGeneratedArtifact(
            directories,
            `criteria.${version}.json`,
            normalizedCriteriaArtifactSchema,
         ),
         readGeneratedArtifact(
            directories,
            `technique-index.${version}.json`,
            techniqueIndexArtifactSchema,
         ),
         readGeneratedArtifact(
            directories,
            `failure-index.${version}.json`,
            failureIndexArtifactSchema,
         ),
      ]);
   return { criteriaArtifact, techniqueIndexArtifact, failureIndexArtifact };
}

/**
 * Builds the full request list from the criteria and technique indexes `runWcagDataSync`
 * already wrote for both WCAG versions.
 */
async function buildAllRequests(
   directories: WcagDataDirectories,
): Promise<DocumentRequest[]> {
   const indexesByVersion = await Promise.all(
      wcagVersions.map((version) => loadVersionIndexes(directories, version)),
   );
   return wcagVersions.flatMap((version, index) =>
      buildDocumentRequests({ version, ...(indexesByVersion[index] as VersionIndexes) }),
   );
}

async function writeContentStore(
   directories: WcagDataDirectories,
   assembled: AssembledDocuments,
): Promise<GeneratedArtifactWriteResult> {
   const validated = documentContentStoreSchema.parse(assembled.contentStore);
   return writeGeneratedArtifact(
      directories,
      'documents-content.json',
      toJsonString(validated),
   );
}

async function writeVersionArtifacts(
   directories: WcagDataDirectories,
   assembled: AssembledDocuments,
): Promise<GeneratedArtifactWriteResult[]> {
   const writes = wcagVersions.flatMap((version) => [
      writeGeneratedArtifact(
         directories,
         `understanding.${version}.json`,
         toJsonString(assembled.understandingByVersion[version]),
      ),
      writeGeneratedArtifact(
         directories,
         `technique-bodies.${version}.json`,
         toJsonString(assembled.techniqueBodiesByVersion[version]),
      ),
   ]);
   return Promise.all(writes);
}

function countEntries(assembled: AssembledDocuments): {
   understandingCount: number;
   techniqueBodyCount: number;
   uniqueBodyCount: number;
} {
   const understandingCount = wcagVersions.reduce(
      (total, version) =>
         total + Object.keys(assembled.understandingByVersion[version].documents).length,
      0,
   );
   const techniqueBodyCount = wcagVersions.reduce(
      (total, version) =>
         total + Object.keys(assembled.techniqueBodiesByVersion[version].bodies).length,
      0,
   );
   return {
      understandingCount,
      techniqueBodyCount,
      uniqueBodyCount: Object.keys(assembled.contentStore).length,
   };
}

export interface SyncDocumentArtifactsResult {
   generated: GeneratedArtifactWriteResult[];
   understandingCount: number;
   techniqueBodyCount: number;
   uniqueBodyCount: number;
   requestCount: number;
   failures: FailedDocumentFetch[];
}

function splitOutcomes(outcomes: readonly FetchDocumentOutcome[]): {
   entries: FetchedDocumentEntry[];
   failures: FailedDocumentFetch[];
} {
   const entries: FetchedDocumentEntry[] = [];
   const failures: FailedDocumentFetch[] = [];
   for (const outcome of outcomes) {
      if (outcome.ok) {
         entries.push(outcome.entry);
      } else {
         failures.push(outcome.failure);
      }
   }
   return { entries, failures };
}

/**
 * Fetches every Understanding document and technique/failure body for both pinned WCAG
 * versions, converts each to Markdown, and writes the deduplicated generated artifacts.
 * Run after `runWcagDataSync`, which writes the criteria and technique indexes this step
 * reads to build its request list. Concurrency stays low by default so the sync does not
 * open many connections to w3.org at once. A document that still fails after every retry
 * is reported in the result's `failures` list rather than aborting the whole sync, so a
 * transient failure on one page does not cost the rest of the corpus.
 */
export async function syncDocumentArtifacts(options?: {
   directories?: WcagDataDirectories;
   fetchImpl?: FetchLike;
   syncedAt?: string;
   concurrency?: number;
   paceMs?: number;
   understandingMode?: DocumentExtractMode;
}): Promise<SyncDocumentArtifactsResult> {
   const directories = options?.directories ?? (await ensureWcagDataDirectories());
   const requests = await buildAllRequests(directories);
   const outcomes = await fetchDocuments({
      requests,
      fetchImpl: options?.fetchImpl ?? fetch,
      understandingMode: options?.understandingMode ?? 'full',
      syncedAt: options?.syncedAt ?? new Date().toISOString(),
      concurrency: options?.concurrency ?? DEFAULT_CONCURRENCY,
      paceMs: options?.paceMs ?? DEFAULT_PACE_MS,
   });
   const { entries, failures } = splitOutcomes(outcomes);
   const freshlyAssembled = assembleDocumentArtifacts({
      entries,
      versions: wcagVersions,
   });
   const assembled = await mergeWithExistingArtifacts(directories, freshlyAssembled);

   const [contentStoreWrite, versionWrites] = await Promise.all([
      writeContentStore(directories, assembled),
      writeVersionArtifacts(directories, assembled),
   ]);

   return {
      generated: [contentStoreWrite, ...versionWrites],
      requestCount: requests.length,
      failures,
      ...countEntries(assembled),
   };
}

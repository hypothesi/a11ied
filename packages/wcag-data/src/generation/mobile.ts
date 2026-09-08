import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
   mobileGuidanceArtifactSchema,
   normalizedCriteriaArtifactSchema,
   type MobileGuidanceArtifact,
   type MobileGuidanceEntry,
   type NormalizedCriterion,
   type WcagVersion,
} from '@a11ied/contracts';

import type {
   FetchLike,
   GeneratedArtifactWriteResult,
   WcagDataDirectories,
} from '../shared/types.js';
import { sha256, toJsonString, withOptionalStringProperties } from '../shared/utils.js';
import { ensureWcagDataDirectories, wcagVersions } from '../sources/definitions.js';
import { mapWithConcurrency } from '../sources/documents/pool.js';
import { parseMobileGuidance } from '../sources/mobile/parse.js';
import { writeGeneratedArtifact } from './version.js';

const DEFAULT_CONCURRENCY = 4;
const HTTP_NOT_FOUND = 404;
const MOBILE_GUIDANCE_FILE_NAME = 'mobile-guidance.json';
const SOURCE_FILE_BASE = 'https://raw.githubusercontent.com/w3c/matf/main/comments/';

/**
 * WCAG2Mobile covers the Level A and AA criteria. Level AAA is out of the document's
 * scope, so those ids are never requested.
 */
const COVERED_LEVELS = new Set(['A', 'AA']);

/**
 * The document these entries are copied from. The editor's draft is what the sync reads:
 * it is built from the same repository files, and it is further along than the published
 * Note, which still marks most criteria as work in progress.
 */
const MOBILE_DOCUMENT = {
   title: 'Guidance on Applying WCAG 2.2 to Mobile Applications (WCAG2Mobile)',
   url: 'https://w3c.github.io/matf/',
   status: "W3C Editor's Draft, informative guidance that is not a W3C Recommendation",
} as const;

export interface MobileGuidanceFetchFailure {
   criterionId: string;
   url: string;
   message: string;
}

export interface SyncMobileGuidanceResult {
   generated: GeneratedArtifactWriteResult;
   requestCount: number;
   guidanceCount: number;
   placeholderCount: number;
   failures: MobileGuidanceFetchFailure[];
}

type FetchOutcome =
   | { kind: 'entry'; entry: MobileGuidanceEntry }
   | { kind: 'absent' }
   | { kind: 'failure'; failure: MobileGuidanceFetchFailure };

async function readCriteria(
   directories: WcagDataDirectories,
   version: WcagVersion,
): Promise<NormalizedCriterion[]> {
   const raw = await readFile(
      join(directories.generated, `criteria.${version}.json`),
      'utf8',
   );
   const artifact = normalizedCriteriaArtifactSchema.parse(JSON.parse(raw) as unknown);
   return Object.values(artifact.criteria);
}

/**
 * Lists every criterion id to request, across both pinned WCAG versions. The union
 * matters: WCAG 2.2 dropped 4.1.1 Parsing, and WCAG2Mobile still carries an entry for
 * it.
 */
async function listRequestedCriterionIds(
   directories: WcagDataDirectories,
): Promise<string[]> {
   const criteriaByVersion = await Promise.all(
      wcagVersions.map((version) => readCriteria(directories, version)),
   );
   const ids = criteriaByVersion
      .flat()
      .filter((criterion) => COVERED_LEVELS.has(criterion.level))
      .map((criterion) => criterion.id);
   return [...new Set(ids)].toSorted();
}

function buildEntry(input: {
   criterionId: string;
   markdown: string;
   etag: string | undefined;
   syncedAt: string;
}): MobileGuidanceEntry {
   const fileName = `${input.criterionId}.md`;
   const parsed = parseMobileGuidance({ fileName, markdown: input.markdown });
   return withOptionalStringProperties<MobileGuidanceEntry>(
      {
         criterionId: parsed.criterionId,
         title: parsed.title,
         url: parsed.url,
         status: MOBILE_DOCUMENT.status,
         sourceSha256: sha256(input.markdown),
         syncedAt: input.syncedAt,
         state: parsed.state,
         guidance: parsed.guidance,
         notes: parsed.notes,
         examples: parsed.examples,
         wcag2ictUrl: parsed.wcag2ictUrl,
      },
      { etag: input.etag, openIssueUrl: parsed.openIssueUrl },
   );
}

function errorMessage(error: unknown): string {
   return error instanceof Error ? error.message : String(error);
}

/**
 * Fetches one criterion's guidance file. A 404 means the document has no entry for that
 * criterion, which is expected for anything WCAG2Mobile does not cover, so it is reported
 * as absent rather than as a failure.
 */
async function fetchOne(input: {
   criterionId: string;
   fetchImpl: FetchLike;
   syncedAt: string;
}): Promise<FetchOutcome> {
   const url = `${SOURCE_FILE_BASE}${input.criterionId}.md`;
   try {
      const response = await input.fetchImpl(url);
      if (response.status === HTTP_NOT_FOUND) {
         return { kind: 'absent' };
      }
      if (!response.ok) {
         throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return {
         kind: 'entry',
         entry: buildEntry({
            criterionId: input.criterionId,
            markdown: await response.text(),
            etag: response.headers.get('etag') ?? undefined,
            syncedAt: input.syncedAt,
         }),
      };
   } catch (error) {
      return {
         kind: 'failure',
         failure: { criterionId: input.criterionId, url, message: errorMessage(error) },
      };
   }
}

async function readExistingEntries(
   directories: WcagDataDirectories,
): Promise<Record<string, MobileGuidanceEntry>> {
   try {
      const raw = await readFile(
         join(directories.generated, MOBILE_GUIDANCE_FILE_NAME),
         'utf8',
      );
      return mobileGuidanceArtifactSchema.parse(JSON.parse(raw) as unknown).criteria;
   } catch {
      return {};
   }
}

function sortByCriterionId(
   entries: Record<string, MobileGuidanceEntry>,
): Record<string, MobileGuidanceEntry> {
   return Object.fromEntries(
      Object.entries(entries).toSorted(([left], [right]) => left.localeCompare(right)),
   );
}

function countState(
   entries: Record<string, MobileGuidanceEntry>,
   state: MobileGuidanceEntry['state'],
): number {
   return Object.values(entries).filter((entry) => entry.state === state).length;
}

/**
 * Fetches WCAG2Mobile's per-criterion guidance and writes it as one generated artifact.
 * Run after `runWcagDataSync`, which writes the criteria artifacts this step reads to
 * build its request list. Fresh entries are merged onto whatever is already committed, so
 * a run that fails partway only ever adds to the data instead of shrinking it.
 */
export async function syncMobileGuidance(options?: {
   directories?: WcagDataDirectories;
   fetchImpl?: FetchLike;
   syncedAt?: string;
   concurrency?: number;
}): Promise<SyncMobileGuidanceResult> {
   const directories = options?.directories ?? (await ensureWcagDataDirectories());
   const criterionIds = await listRequestedCriterionIds(directories);
   const outcomes = await mapWithConcurrency(
      criterionIds,
      (criterionId) =>
         fetchOne({
            criterionId,
            fetchImpl: options?.fetchImpl ?? fetch,
            syncedAt: options?.syncedAt ?? new Date().toISOString(),
         }),
      { concurrency: options?.concurrency ?? DEFAULT_CONCURRENCY },
   );

   const fresh: Record<string, MobileGuidanceEntry> = {};
   const failures: MobileGuidanceFetchFailure[] = [];
   for (const outcome of outcomes) {
      if (outcome.kind === 'entry') {
         fresh[outcome.entry.criterionId] = outcome.entry;
      } else if (outcome.kind === 'failure') {
         failures.push(outcome.failure);
      }
   }

   const existing = await readExistingEntries(directories);
   const artifact: MobileGuidanceArtifact = mobileGuidanceArtifactSchema.parse({
      document: MOBILE_DOCUMENT,
      criteria: sortByCriterionId({ ...existing, ...fresh }),
   });

   return {
      generated: await writeGeneratedArtifact(
         directories,
         MOBILE_GUIDANCE_FILE_NAME,
         toJsonString(artifact),
      ),
      requestCount: criterionIds.length,
      guidanceCount: countState(artifact.criteria, 'guidance'),
      placeholderCount: countState(artifact.criteria, 'placeholder'),
      failures,
   };
}

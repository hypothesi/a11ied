import type { FetchLike } from '../shared/types.js';
import {
   convertDocumentHtml,
   type DocumentExtractMode,
} from '../sources/documents/convert.js';
import {
   DocumentFetchError,
   fetchDocumentHtml,
   type FetchedDocument,
} from '../sources/documents/fetch-document.js';
import { mapWithConcurrency } from '../sources/documents/pool.js';
import type { DocumentRequest } from '../sources/documents/types.js';

const RETRY_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 20_000;
const HTTP_TOO_MANY_REQUESTS = 429;
const MILLISECONDS_PER_SECOND = 1000;
const BACKOFF_MULTIPLIER = 2;

export interface FetchedDocumentEntry {
   request: DocumentRequest;
   title: string;
   url: string;
   status: string;
   markdown: string;
   sourceSha256: string;
   syncedAt: string;
   etag: string | undefined;
}

export interface FailedDocumentFetch {
   request: DocumentRequest;
   message: string;
}

export type FetchDocumentOutcome =
   | { ok: true; entry: FetchedDocumentEntry }
   | { ok: false; failure: FailedDocumentFetch };

function sleep(delayMs: number): Promise<void> {
   return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
   });
}

/**
 * Backs off longer on rate limiting, honoring `Retry-After` when the server sends one,
 * capped the same as the exponential backoff so one large value cannot stall the whole
 * sync behind a single lane.
 */
function backoffDelayMs(input: { error: unknown; attempt: number }): number {
   if (
      input.error instanceof DocumentFetchError &&
      input.error.status === HTTP_TOO_MANY_REQUESTS &&
      input.error.retryAfterSeconds !== undefined
   ) {
      return Math.min(
         input.error.retryAfterSeconds * MILLISECONDS_PER_SECOND,
         MAX_BACKOFF_MS,
      );
   }
   return Math.min(BASE_BACKOFF_MS * BACKOFF_MULTIPLIER ** input.attempt, MAX_BACKOFF_MS);
}

async function fetchWithRetry(input: {
   request: DocumentRequest;
   fetchImpl: FetchLike;
   attemptsLeft: number;
   attempt: number;
}): Promise<FetchedDocument> {
   try {
      return await fetchDocumentHtml({
         url: input.request.url,
         fetchImpl: input.fetchImpl,
      });
   } catch (error) {
      if (input.attemptsLeft <= 1) {
         throw error;
      }
      await sleep(backoffDelayMs({ error, attempt: input.attempt }));
      return fetchWithRetry({
         ...input,
         attemptsLeft: input.attemptsLeft - 1,
         attempt: input.attempt + 1,
      });
   }
}

function extractMode(
   request: DocumentRequest,
   understandingMode: DocumentExtractMode,
): DocumentExtractMode {
   return request.kind === 'understanding' ? understandingMode : 'full';
}

function errorMessage(error: unknown): string {
   return error instanceof Error ? error.message : String(error);
}

async function fetchAndConvertOne(input: {
   request: DocumentRequest;
   fetchImpl: FetchLike;
   understandingMode: DocumentExtractMode;
   syncedAt: string;
}): Promise<FetchDocumentOutcome> {
   try {
      const fetched = await fetchWithRetry({
         request: input.request,
         fetchImpl: input.fetchImpl,
         attemptsLeft: RETRY_ATTEMPTS,
         attempt: 0,
      });
      const converted = convertDocumentHtml({
         html: fetched.html,
         mode: extractMode(input.request, input.understandingMode),
         url: input.request.url,
      });
      return {
         ok: true,
         entry: {
            request: input.request,
            title: input.request.title,
            url: input.request.url,
            status: converted.status,
            markdown: converted.markdown,
            sourceSha256: fetched.sourceSha256,
            syncedAt: input.syncedAt,
            etag: fetched.etag,
         },
      };
   } catch (error) {
      return {
         ok: false,
         failure: { request: input.request, message: errorMessage(error) },
      };
   }
}

/**
 * Fetches and converts every requested document with bounded concurrency so the sync does
 * not open many connections to w3.org at once. A rate-limited request retries with
 * exponential backoff (honoring `Retry-After` when the server sends one). A document that
 * still fails after every retry is reported as a failure rather than aborting the sync,
 * so one bad page does not cost the rest of the corpus.
 */
export async function fetchDocuments(input: {
   requests: readonly DocumentRequest[];
   fetchImpl: FetchLike;
   understandingMode: DocumentExtractMode;
   syncedAt: string;
   concurrency: number;
   paceMs: number;
}): Promise<FetchDocumentOutcome[]> {
   return mapWithConcurrency(
      input.requests,
      (request) =>
         fetchAndConvertOne({
            request,
            fetchImpl: input.fetchImpl,
            understandingMode: input.understandingMode,
            syncedAt: input.syncedAt,
         }),
      { concurrency: input.concurrency, paceMs: input.paceMs },
   );
}

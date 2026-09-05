import type { FetchLike } from '../../shared/types.js';
import { sha256 } from '../../shared/utils.js';

export interface FetchedDocument {
   html: string;
   resolvedUrl: string;
   sourceSha256: string;
   etag: string | undefined;
}

/** Raised on a non-OK HTTP response, so a retry loop can special-case rate limiting. */
export class DocumentFetchError extends Error {
   readonly status: number;
   readonly retryAfterSeconds: number | undefined;

   constructor(input: {
      url: string;
      status: number;
      statusText: string;
      retryAfterSeconds: number | undefined;
   }) {
      super(`Failed to fetch ${input.url}: HTTP ${input.status} ${input.statusText}`);
      this.name = 'DocumentFetchError';
      this.status = input.status;
      this.retryAfterSeconds = input.retryAfterSeconds;
   }
}

function parseRetryAfter(response: Response): number | undefined {
   const header = response.headers.get('retry-after');
   if (!header) {
      return undefined;
   }
   const seconds = Number.parseInt(header, 10);
   return Number.isNaN(seconds) ? undefined : seconds;
}

/**
 * Fetches one W3C Understanding or technique page and hashes its raw HTML, matching the
 * `sha256` field the rest of the sync pipeline records for every raw source.
 */
export async function fetchDocumentHtml(input: {
   url: string;
   fetchImpl: FetchLike;
}): Promise<FetchedDocument> {
   const response = await input.fetchImpl(input.url);

   if (!response.ok) {
      throw new DocumentFetchError({
         url: input.url,
         status: response.status,
         statusText: response.statusText,
         retryAfterSeconds: parseRetryAfter(response),
      });
   }

   const html = await response.text();

   return {
      html,
      resolvedUrl: response.url || input.url,
      sourceSha256: sha256(html),
      etag: response.headers.get('etag') ?? undefined,
   };
}

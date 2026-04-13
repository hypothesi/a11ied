import type { TargetReference } from '@a11ied/contracts';

import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';

interface ResolvedDocumentTarget {
   target: TargetReference;
   resolvedUrl: string;
   html: string;
   metadata: Record<string, string>;
   userHints: string[];
}

export interface ResolveDocumentTargetInput {
   url?: string;
}

const resolvedTargetCache = new Map<string, Promise<ResolvedDocumentTarget>>();

function buildCacheKey(input: ResolveDocumentTargetInput): string | undefined {
   if (input.url) {
      return `url:${input.url}`;
   }
   return undefined;
}

function parseHttpUrl(url: string, field: 'url'): URL {
   let parsedUrl: URL | undefined = undefined;
   try {
      parsedUrl = new URL(url);
   } catch {
      throw new CliUsageError('invalid-url', `URL "${url}" is invalid.`, {
         field,
         value: url,
      });
   }

   if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new CliUsageError('invalid-url', `URL "${url}" must use http or https.`, {
         field,
         value: url,
      });
   }

   return parsedUrl;
}

async function fetchResponse(
   url: string,
   context: Record<string, unknown>,
): Promise<Response> {
   let response: Response | undefined = undefined;

   try {
      response = await fetch(url, {
         headers: {
            'user-agent': 'a11ied/0.1.0',
         },
      });
   } catch (error) {
      let causeMessage = String(error);
      if (error instanceof Error) {
         causeMessage = error.message;
      }
      throw new CliEnvironmentError(
         'target-unavailable',
         `Could not open URL "${url}".`,
         {
            ...context,
            cause: causeMessage,
         },
      );
   }

   if (!response.ok) {
      throw new CliEnvironmentError(
         'target-unavailable',
         `Could not open URL "${url}".`,
         {
            ...context,
            status: response.status,
            statusText: response.statusText,
         },
      );
   }

   return response;
}

async function resolveUrlDocumentTarget(url: string): Promise<ResolvedDocumentTarget> {
   const parsedUrl = parseHttpUrl(url, 'url');
   const response = await fetchResponse(parsedUrl.toString(), { url });
   const html = await response.text();

   return {
      target: {
         kind: 'url',
         value: parsedUrl.toString(),
      },
      resolvedUrl: parsedUrl.toString(),
      html,
      metadata: {},
      userHints: [],
   };
}

async function resolveDocumentTargetUncached(
   input: ResolveDocumentTargetInput,
): Promise<ResolvedDocumentTarget> {
   if (input.url) {
      return resolveUrlDocumentTarget(input.url);
   }

   throw new CliUsageError(
      'missing-target',
      'Provide a --url to resolve a document target.',
   );
}

async function readCachedResolution(
   cacheKey: string | undefined,
   resolutionPromise: Promise<ResolvedDocumentTarget>,
): Promise<ResolvedDocumentTarget> {
   try {
      return await resolutionPromise;
   } catch (error) {
      if (cacheKey) {
         resolvedTargetCache.delete(cacheKey);
      }
      throw error;
   }
}

async function resolveDocumentTargetWithCache(
   input: ResolveDocumentTargetInput,
): Promise<ResolvedDocumentTarget> {
   const cacheKey = buildCacheKey(input);
   let cached: Promise<ResolvedDocumentTarget> | undefined = undefined;
   if (cacheKey) {
      cached = resolvedTargetCache.get(cacheKey);
   }
   if (cached) {
      return cached;
   }

   const resolutionPromise = resolveDocumentTargetUncached(input);
   if (cacheKey) {
      resolvedTargetCache.set(cacheKey, resolutionPromise);
   }
   return await readCachedResolution(cacheKey, resolutionPromise);
}

/** Resolves a URL target into HTML plus target metadata. */
export async function resolveDocumentTarget(
   input: ResolveDocumentTargetInput,
): Promise<ResolvedDocumentTarget> {
   return resolveDocumentTargetWithCache(input);
}

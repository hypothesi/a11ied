import { withLoadedPage } from '../browser/helper.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

interface StorybookIndexEntry {
   id?: string;
   title?: string;
   name?: string;
   parameters?: {
      a11lied?: {
         metadata?: Record<string, unknown>;
         userHints?: unknown[];
      };
   };
}

interface StorybookIndexResponse {
   entries?: Record<string, StorybookIndexEntry>;
   stories?: Record<string, StorybookIndexEntry>;
}

interface RuntimeStoryMetadata {
   metadata: Record<string, string>;
   userHints: string[];
}

interface RawStoryEvaluateResult {
   scriptMetadata: Record<string, unknown> | undefined;
   scriptUserHints: unknown[] | undefined;
   globalMetadata: Record<string, unknown> | undefined;
   globalUserHints: unknown[] | undefined;
}

export async function fetchResponse(
   url: string,
   context: Record<string, unknown>,
): Promise<Response> {
   let response: Response | undefined = undefined;

   try {
      response = await fetch(url, {
         headers: {
            'user-agent': 'a11lied/0.1.0',
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

function toStringMap(input: Record<string, unknown> | undefined): Record<string, string> {
   if (!input) {
      return {};
   }

   return Object.fromEntries(
      Object.entries(input)
         .filter(([, value]) => value !== undefined && value !== null)
         .map(([key, value]) => [key, String(value)]),
   );
}

function toStringList(input: unknown[] | undefined): string[] {
   if (!input) {
      return [];
   }

   return input
      .map((value) => {
         if (typeof value === 'string') {
            return value.trim();
         }
         return '';
      })
      .filter((value) => value.length > 0);
}

function extractIndexEntries(
   index: StorybookIndexResponse,
): Record<string, StorybookIndexEntry> {
   return index.entries ?? index.stories ?? {};
}

function buildStoryIframeUrl(storybookBaseUrl: string, storyId: string): string {
   const iframeUrl = new URL('iframe.html', storybookBaseUrl);
   iframeUrl.searchParams.set('id', storyId);
   iframeUrl.searchParams.set('viewMode', 'story');
   return iframeUrl.toString();
}

function transformRawStoryMetadata(raw: RawStoryEvaluateResult): RuntimeStoryMetadata {
   const mergedMetadata = {
      ...raw.scriptMetadata,
      ...raw.globalMetadata,
   };
   let scriptHints: unknown[] = [];
   if (Array.isArray(raw.scriptUserHints)) {
      scriptHints = raw.scriptUserHints;
   }
   let globalHints: unknown[] = [];
   if (Array.isArray(raw.globalUserHints)) {
      globalHints = raw.globalUserHints;
   }
   const mergedHints = [...scriptHints, ...globalHints];

   return {
      metadata: Object.fromEntries(
         Object.entries(mergedMetadata)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)]),
      ),
      userHints: mergedHints
         .map((value) => {
            if (typeof value === 'string') {
               return value.trim();
            }
            return '';
         })
         .filter((value) => value.length > 0),
   };
}

async function extractRuntimeStoryMetadata(iframeUrl: string): Promise<{
   html: string;
   runtime: RuntimeStoryMetadata;
}> {
   return withLoadedPage(iframeUrl, async (page) => {
      const html = await page.content();
      const raw = await page.evaluate((): RawStoryEvaluateResult => {
         const globalMeta = (
            globalThis as typeof globalThis & {
               __A11LIED_STORY_METADATA__?: {
                  metadata?: Record<string, unknown>;
                  userHints?: unknown[];
               };
            }
         ).__A11LIED_STORY_METADATA__;
         const metadataScript = document.querySelector(
            '#a11lied-story-metadata',
         ) as HTMLScriptElement | null;

         let scriptMeta: {
            metadata?: Record<string, unknown>;
            userHints?: unknown[];
         } = {};
         if (metadataScript?.textContent) {
            try {
               scriptMeta = JSON.parse(metadataScript.textContent) as {
                  metadata?: Record<string, unknown>;
                  userHints?: unknown[];
               };
            } catch {
               scriptMeta = {};
            }
         }

         return {
            scriptMetadata: scriptMeta.metadata,
            scriptUserHints: scriptMeta.userHints,
            globalMetadata: globalMeta?.metadata,
            globalUserHints: globalMeta?.userHints,
         };
      });

      return { html, runtime: transformRawStoryMetadata(raw) };
   });
}

function mergeHints(args: {
   entry: StorybookIndexEntry;
   runtime: RuntimeStoryMetadata;
}): { metadata: Record<string, string>; userHints: string[] } {
   const parameterHints = args.entry.parameters?.a11lied;
   const metadata = {
      ...toStringMap(parameterHints?.metadata),
      ...args.runtime.metadata,
   };
   const userHints = [
      ...new Set([...toStringList(parameterHints?.userHints), ...args.runtime.userHints]),
   ];

   return { metadata, userHints };
}

export async function fetchStoryEntry(input: {
   storybookBaseUrl: string;
   storybookUrl: string;
   storyId: string;
   fetchResponseFn: (url: string, context: Record<string, unknown>) => Promise<Response>;
}): Promise<StorybookIndexEntry> {
   const indexUrl = new URL('index.json', input.storybookBaseUrl).toString();
   const indexResponse = await input.fetchResponseFn(indexUrl, {
      storybookUrl: input.storybookUrl,
      indexUrl,
   });
   const index = (await indexResponse.json()) as StorybookIndexResponse;
   const entry = extractIndexEntries(index)[input.storyId];

   if (!entry) {
      throw new CliEnvironmentError(
         'storybook-story-not-found',
         `Story "${input.storyId}" could not be resolved from Storybook index data.`,
         {
            storyId: input.storyId,
            storybookUrl: input.storybookBaseUrl,
            indexUrl,
         },
      );
   }

   return entry;
}

export async function resolveStoryDocumentTarget(args: {
   storybookBaseUrl: string;
   storybookUrl: string;
   storyId: string;
   fetchResponseFn: (url: string, context: Record<string, unknown>) => Promise<Response>;
}): Promise<{
   resolvedUrl: string;
   html: string;
   metadata: Record<string, string>;
   userHints: string[];
}> {
   const entry = await fetchStoryEntry(args);
   const resolvedUrl = buildStoryIframeUrl(args.storybookBaseUrl, args.storyId);
   const { html, runtime } = await extractRuntimeStoryMetadata(resolvedUrl);
   const { metadata, userHints } = mergeHints({ entry, runtime });

   return { resolvedUrl, html, metadata, userHints };
}

import type { TargetReference } from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';
import { fetchResponse, resolveStoryDocumentTarget } from './storybook.js';

export interface ResolvedDocumentTarget {
   target: TargetReference;
   resolvedUrl: string;
   html: string;
   metadata: Record<string, string>;
   userHints: string[];
   storybookBaseUrl?: string;
}

export interface ResolveDocumentTargetInput {
   url?: string;
   storybookUrl?: string;
   storyId?: string;
}

function parseHttpUrl(url: string, field: 'url' | 'storybookUrl'): URL {
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

/** Resolves either a URL target or Storybook target into HTML plus target metadata. */
export async function resolveDocumentTarget(
   input: ResolveDocumentTargetInput,
): Promise<ResolvedDocumentTarget> {
   if (input.url) {
      return resolveUrlDocumentTarget(input.url);
   }

   if (input.storybookUrl && input.storyId) {
      const storybookBaseUrl = new URL(
         '.',
         parseHttpUrl(input.storybookUrl, 'storybookUrl'),
      ).toString();
      const result = await resolveStoryDocumentTarget({
         storybookBaseUrl,
         storybookUrl: input.storybookUrl,
         storyId: input.storyId,
         fetchResponseFn: fetchResponse,
      });

      return {
         target: {
            kind: 'story',
            value: input.storyId,
         },
         storybookBaseUrl,
         ...result,
      };
   }

   throw new CliUsageError(
      'missing-target',
      'Provide either --url or --storybook-url with --story-id.',
   );
}

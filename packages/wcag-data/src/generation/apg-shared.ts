import type { FetchLike } from '../shared/types.js';

export interface ApgFetchFailure {
   /** The example whose source did not arrive, or the pattern whose page did not. */
   exampleId?: string;
   patternId?: string;
   url: string;
   message: string;
}

export function errorMessage(error: unknown): string {
   return error instanceof Error ? error.message : String(error);
}

export async function fetchText(url: string, fetchImpl: FetchLike): Promise<string> {
   const response = await fetchImpl(url);
   if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
   }
   return response.text();
}

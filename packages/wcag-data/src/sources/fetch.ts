import {
   SyncValidationError,
   type FetchLike,
   type PendingArtifact,
   type RawSourceDefinition,
   type RawSourceProvenance,
} from '../shared/types.js';
import {
   parseSourcePayload,
   sha256,
   withOptionalStringProperties,
} from '../shared/utils.js';

const HTTP_NOT_FOUND = 404;

function extractErrorMessage(error: unknown, fallback: string): string {
   if (error instanceof Error) {
      return error.message;
   }
   return fallback;
}

function validateParsedSource(input: {
   definition: RawSourceDefinition;
   candidateUrl: string;
   sourceText: string;
}): void {
   let payload: unknown = undefined;
   try {
      payload = parseSourcePayload(input.definition.format, input.sourceText);
   } catch (error) {
      const msg = extractErrorMessage(error, 'unknown parse error');
      throw new SyncValidationError(
         input.definition.id,
         input.candidateUrl,
         `Rejected source URL ${input.candidateUrl}: failed to parse ${input.definition.format} payload (${msg})`,
      );
   }
   try {
      input.definition.validate(payload);
   } catch (error) {
      const msg = extractErrorMessage(error, 'unknown validation error');
      throw new SyncValidationError(
         input.definition.id,
         input.candidateUrl,
         `Rejected source URL ${input.candidateUrl}: ${msg}`,
      );
   }
}

function buildProvenance(input: {
   definition: RawSourceDefinition;
   candidateUrl: string;
   syncedAt: string;
   sourceText: string;
   response: Response;
}): RawSourceProvenance {
   return withOptionalStringProperties<RawSourceProvenance>(
      {
         sourceId: input.definition.id,
         sourceUrl: input.definition.primaryUrl,
         resolvedUrl: input.candidateUrl,
         syncedAt: input.syncedAt,
         sha256: sha256(input.sourceText),
         contentType: input.definition.format,
         fallbackUsed: input.candidateUrl !== input.definition.primaryUrl,
      },
      {
         upstreamVersion: input.definition.upstreamVersion,
         etag: input.response.headers.get('etag') ?? undefined,
         lastModified: input.response.headers.get('last-modified') ?? undefined,
      },
   );
}

async function tryCandidate(input: {
   definition: RawSourceDefinition;
   candidateUrl: string;
   fetchImpl: FetchLike;
   syncedAt: string;
   index: number;
}): Promise<PendingArtifact | undefined> {
   const response = await input.fetchImpl(input.candidateUrl);
   if (!response.ok) {
      const fallbackCount = (input.definition.fallbackUrls?.length ?? 0) + 1;
      if (response.status === HTTP_NOT_FOUND && input.index < fallbackCount) {
         return undefined;
      }
      throw new SyncValidationError(
         input.definition.id,
         input.candidateUrl,
         `Rejected source URL ${input.candidateUrl}: HTTP ${response.status} ${response.statusText}`,
      );
   }
   const sourceText = await response.text();
   validateParsedSource({
      definition: input.definition,
      candidateUrl: input.candidateUrl,
      sourceText,
   });
   return {
      sourceId: input.definition.id,
      fileName: input.definition.fileName,
      body: sourceText,
      provenance: buildProvenance({
         definition: input.definition,
         candidateUrl: input.candidateUrl,
         syncedAt: input.syncedAt,
         sourceText,
         response,
      }),
   };
}

async function tryUrlAtIndex(input: {
   definition: RawSourceDefinition;
   fetchImpl: FetchLike;
   syncedAt: string;
   candidateUrls: string[];
   urlIndex: number;
}): Promise<PendingArtifact> {
   if (input.urlIndex >= input.candidateUrls.length) {
      throw new SyncValidationError(
         input.definition.id,
         input.definition.primaryUrl,
         `Rejected source URL ${input.definition.primaryUrl}: all candidates failed`,
      );
   }
   const url = input.candidateUrls[input.urlIndex] as string;
   const artifact = await tryCandidate({
      definition: input.definition,
      candidateUrl: url,
      fetchImpl: input.fetchImpl,
      syncedAt: input.syncedAt,
      index: input.urlIndex,
   });
   if (artifact !== undefined) {
      return artifact;
   }
   return tryUrlAtIndex({ ...input, urlIndex: input.urlIndex + 1 });
}

export async function fetchRemoteSource(input: {
   definition: RawSourceDefinition;
   fetchImpl: FetchLike;
   syncedAt: string;
}): Promise<PendingArtifact> {
   const candidateUrls = [
      input.definition.primaryUrl,
      ...(input.definition.fallbackUrls ?? []),
   ];
   return tryUrlAtIndex({
      definition: input.definition,
      fetchImpl: input.fetchImpl,
      syncedAt: input.syncedAt,
      candidateUrls,
      urlIndex: 0,
   });
}

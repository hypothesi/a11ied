import {
   techniqueBodyArtifactSchema,
   understandingArtifactSchema,
   type DocumentContentStore,
   type TechniqueBodyArtifact,
   type UnderstandingArtifact,
   type W3cDocumentMeta,
   type WcagVersion,
} from '@a11ied/contracts';

import { sha256 } from '../shared/utils.js';
import type { FetchedDocumentEntry } from './documents-fetch.js';

export interface AssembledDocuments {
   contentStore: DocumentContentStore;
   understandingByVersion: Record<WcagVersion, UnderstandingArtifact>;
   techniqueBodiesByVersion: Record<WcagVersion, TechniqueBodyArtifact>;
}

function toMeta(entry: FetchedDocumentEntry, bodyHash: string): W3cDocumentMeta {
   return {
      title: entry.title,
      url: entry.url,
      status: entry.status,
      sourceSha256: entry.sourceSha256,
      syncedAt: entry.syncedAt,
      etag: entry.etag,
      bodyHash,
   };
}

function buildContentStore(entries: readonly FetchedDocumentEntry[]): {
   store: DocumentContentStore;
   hashByRequestKey: Map<string, string>;
} {
   const store: Record<string, string> = {};
   const hashByRequestKey = new Map<string, string>();

   for (const entry of entries) {
      const bodyHash = sha256(entry.markdown);
      store[bodyHash] = entry.markdown;
      hashByRequestKey.set(
         `${entry.request.kind}:${entry.request.version}:${entry.request.id}`,
         bodyHash,
      );
   }

   return { store, hashByRequestKey };
}

function buildUnderstandingArtifact(
   version: WcagVersion,
   entries: readonly FetchedDocumentEntry[],
   hashByRequestKey: Map<string, string>,
): UnderstandingArtifact {
   const documents = Object.fromEntries(
      entries
         .filter(
            (entry) =>
               entry.request.kind === 'understanding' &&
               entry.request.version === version,
         )
         .map((entry) => {
            const bodyHash = hashByRequestKey.get(
               `understanding:${version}:${entry.request.id}`,
            );
            if (!bodyHash || !entry.request.criterionId) {
               throw new Error(
                  `missing body hash for understanding document ${entry.request.id}`,
               );
            }
            return [
               entry.request.id,
               {
                  ...toMeta(entry, bodyHash),
                  slug: entry.request.id,
                  criterionId: entry.request.criterionId,
               },
            ] as const;
         }),
   );

   return understandingArtifactSchema.parse({ version, documents });
}

function buildTechniqueBodyArtifact(
   version: WcagVersion,
   entries: readonly FetchedDocumentEntry[],
   hashByRequestKey: Map<string, string>,
): TechniqueBodyArtifact {
   const bodies = Object.fromEntries(
      entries
         .filter(
            (entry) =>
               entry.request.kind === 'technique' && entry.request.version === version,
         )
         .map((entry) => {
            const bodyHash = hashByRequestKey.get(
               `technique:${version}:${entry.request.id}`,
            );
            if (!bodyHash) {
               throw new Error(
                  `missing body hash for technique document ${entry.request.id}`,
               );
            }
            return [
               entry.request.id,
               { ...toMeta(entry, bodyHash), id: entry.request.id },
            ] as const;
         }),
   );

   return techniqueBodyArtifactSchema.parse({ version, bodies });
}

/**
 * Deduplicates fetched document bodies into a shared content store keyed by hash, then
 * builds the per-version Understanding and technique-body artifacts that reference it. A
 * document byte-identical across WCAG 2.1 and 2.2 is stored once.
 */
export function assembleDocumentArtifacts(input: {
   entries: readonly FetchedDocumentEntry[];
   versions: readonly WcagVersion[];
}): AssembledDocuments {
   const { store, hashByRequestKey } = buildContentStore(input.entries);
   const understandingByVersion = {} as Record<WcagVersion, UnderstandingArtifact>;
   const techniqueBodiesByVersion = {} as Record<WcagVersion, TechniqueBodyArtifact>;

   for (const version of input.versions) {
      understandingByVersion[version] = buildUnderstandingArtifact(
         version,
         input.entries,
         hashByRequestKey,
      );
      techniqueBodiesByVersion[version] = buildTechniqueBodyArtifact(
         version,
         input.entries,
         hashByRequestKey,
      );
   }

   return { contentStore: store, understandingByVersion, techniqueBodiesByVersion };
}

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
   documentContentStoreSchema,
   techniqueBodyArtifactSchema,
   understandingArtifactSchema,
   type DocumentContentStore,
   type TechniqueBodyArtifact,
   type UnderstandingArtifact,
   type WcagVersion,
} from '@a11ied/contracts';

import type { WcagDataDirectories } from '../shared/types.js';
import { wcagVersions } from '../sources/definitions.js';
import type { AssembledDocuments } from './documents-assemble.js';

async function readJsonIfPresent<TResult>(
   filePath: string,
   schema: { parse: (data: unknown) => TResult },
): Promise<TResult | undefined> {
   try {
      const raw = await readFile(filePath, 'utf8');
      return schema.parse(JSON.parse(raw) as unknown);
   } catch {
      return undefined;
   }
}

interface VersionArtifacts {
   version: WcagVersion;
   understanding: UnderstandingArtifact;
   techniqueBodies: TechniqueBodyArtifact;
}

async function loadExistingVersion(
   directories: WcagDataDirectories,
   version: WcagVersion,
): Promise<VersionArtifacts> {
   const [understanding, techniqueBodies] = await Promise.all([
      readJsonIfPresent(
         join(directories.generated, `understanding.${version}.json`),
         understandingArtifactSchema,
      ),
      readJsonIfPresent(
         join(directories.generated, `technique-bodies.${version}.json`),
         techniqueBodyArtifactSchema,
      ),
   ]);
   return {
      version,
      understanding: understanding ?? { version, documents: {} },
      techniqueBodies: techniqueBodies ?? { version, bodies: {} },
   };
}

async function loadExisting(
   directories: WcagDataDirectories,
): Promise<AssembledDocuments | undefined> {
   const contentStore = await readJsonIfPresent(
      join(directories.generated, 'documents-content.json'),
      documentContentStoreSchema,
   );
   if (!contentStore) {
      return undefined;
   }
   const versionArtifacts = await Promise.all(
      wcagVersions.map((version) => loadExistingVersion(directories, version)),
   );
   const understandingByVersion = {} as Record<WcagVersion, UnderstandingArtifact>;
   const techniqueBodiesByVersion = {} as Record<WcagVersion, TechniqueBodyArtifact>;
   for (const entry of versionArtifacts) {
      understandingByVersion[entry.version] = entry.understanding;
      techniqueBodiesByVersion[entry.version] = entry.techniqueBodies;
   }
   return { contentStore, understandingByVersion, techniqueBodiesByVersion };
}

function mergeContentStore(
   existing: DocumentContentStore | undefined,
   fresh: DocumentContentStore,
): DocumentContentStore {
   return { ...existing, ...fresh };
}

function mergeUnderstanding(
   existing: UnderstandingArtifact | undefined,
   fresh: UnderstandingArtifact,
): UnderstandingArtifact {
   return {
      version: fresh.version,
      documents: { ...existing?.documents, ...fresh.documents },
   };
}

function mergeTechniqueBodies(
   existing: TechniqueBodyArtifact | undefined,
   fresh: TechniqueBodyArtifact,
): TechniqueBodyArtifact {
   return { version: fresh.version, bodies: { ...existing?.bodies, ...fresh.bodies } };
}

/**
 * Merges freshly fetched documents onto whatever is already committed, so a page that
 * fails this run but succeeded a previous one is not lost, and a sync interrupted partway
 * through only ever adds to the corpus instead of replacing it with a smaller one.
 */
export async function mergeWithExistingArtifacts(
   directories: WcagDataDirectories,
   fresh: AssembledDocuments,
): Promise<AssembledDocuments> {
   const existing = await loadExisting(directories);
   const understandingByVersion = {} as Record<WcagVersion, UnderstandingArtifact>;
   const techniqueBodiesByVersion = {} as Record<WcagVersion, TechniqueBodyArtifact>;
   for (const version of wcagVersions) {
      understandingByVersion[version] = mergeUnderstanding(
         existing?.understandingByVersion[version],
         fresh.understandingByVersion[version],
      );
      techniqueBodiesByVersion[version] = mergeTechniqueBodies(
         existing?.techniqueBodiesByVersion[version],
         fresh.techniqueBodiesByVersion[version],
      );
   }
   return {
      contentStore: mergeContentStore(existing?.contentStore, fresh.contentStore),
      understandingByVersion,
      techniqueBodiesByVersion,
   };
}

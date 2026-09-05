import {
   documentContentStoreSchema,
   techniqueBodyArtifactSchema,
   understandingArtifactSchema,
   type DocumentContentStore,
   type TechniqueBodyArtifact,
   type UnderstandingArtifact,
   type W3cDocumentMeta,
} from '@a11ied/contracts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
   GeneratedArtifactWriteResult,
   WcagDataDirectories,
} from '../shared/types.js';
import { getWcagDataDirectories, wcagVersions } from '../sources/definitions.js';

async function readArtifact<TResult>(
   directories: WcagDataDirectories,
   fileName: string,
   schema: { parse: (data: unknown) => TResult },
): Promise<TResult> {
   const raw = await readFile(join(directories.generated, fileName), 'utf8');
   return schema.parse(JSON.parse(raw) as unknown);
}

function checkBodyHash(
   store: DocumentContentStore,
   id: string,
   meta: W3cDocumentMeta,
): void {
   const body = store[meta.bodyHash];
   if (!body) {
      throw new Error(`document ${id} references a missing body hash ${meta.bodyHash}`);
   }
}

function checkUnderstanding(
   store: DocumentContentStore,
   artifact: UnderstandingArtifact,
): void {
   for (const [slug, document] of Object.entries(artifact.documents)) {
      checkBodyHash(store, slug, document);
   }
}

function checkTechniqueBodies(
   store: DocumentContentStore,
   artifact: TechniqueBodyArtifact,
): void {
   for (const [id, body] of Object.entries(artifact.bodies)) {
      checkBodyHash(store, id, body);
   }
}

function toWriteResult(
   directories: WcagDataDirectories,
   fileName: string,
): GeneratedArtifactWriteResult {
   return { fileName, filePath: join(directories.generated, fileName) };
}

async function validateVersionDocuments(input: {
   directories: WcagDataDirectories;
   version: (typeof wcagVersions)[number];
   contentStore: DocumentContentStore;
}): Promise<GeneratedArtifactWriteResult[]> {
   const understandingFileName = `understanding.${input.version}.json`;
   const techniqueBodiesFileName = `technique-bodies.${input.version}.json`;
   const [understanding, techniqueBodies] = await Promise.all([
      readArtifact(input.directories, understandingFileName, understandingArtifactSchema),
      readArtifact(
         input.directories,
         techniqueBodiesFileName,
         techniqueBodyArtifactSchema,
      ),
   ]);

   checkUnderstanding(input.contentStore, understanding);
   checkTechniqueBodies(input.contentStore, techniqueBodies);

   return [
      toWriteResult(input.directories, understandingFileName),
      toWriteResult(input.directories, techniqueBodiesFileName),
   ];
}

/**
 * Validates the Understanding documents and technique bodies: every stored document has a
 * non-empty title, url, and status (enforced by the schema), and every `bodyHash`
 * resolves to a non-empty body in the shared content store.
 */
export async function validateDocumentArtifacts(
   directories: WcagDataDirectories = getWcagDataDirectories(),
): Promise<GeneratedArtifactWriteResult[]> {
   const contentStore = await readArtifact(
      directories,
      'documents-content.json',
      documentContentStoreSchema,
   );
   const versionResults = await Promise.all(
      wcagVersions.map((version) =>
         validateVersionDocuments({ directories, version, contentStore }),
      ),
   );

   return [
      toWriteResult(directories, 'documents-content.json'),
      ...versionResults.flat(),
   ];
}

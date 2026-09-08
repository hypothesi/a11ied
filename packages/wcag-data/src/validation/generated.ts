import {
   actRuleIndexArtifactSchema,
   axeRuleIndexArtifactSchema,
   testMethodArtifactSchema,
   testMethodSummaryArtifactSchema,
   criteriaByLevelArtifactSchema,
   failureIndexArtifactSchema,
   normalizedCriteriaArtifactSchema,
   slugIndexArtifactSchema,
   strategyArtifactSchema,
   techniqueIndexArtifactSchema,
} from '@a11ied/contracts';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
   GeneratedArtifactWriteResult,
   GeneratedProvenanceManifest,
   WcagDataDirectories,
} from '../shared/types.js';
import { sha256 } from '../shared/utils.js';
import { getWcagDataDirectories, wcagVersions } from '../sources/definitions.js';

interface SchemaEntry {
   schema: { parse: (data: unknown) => unknown };
   fileName: (version: string) => string;
}

const versionSchemas: SchemaEntry[] = [
   {
      schema: normalizedCriteriaArtifactSchema,
      fileName: (ver) => `criteria.${ver}.json`,
   },
   {
      schema: criteriaByLevelArtifactSchema,
      fileName: (ver) => `criteria-by-level.${ver}.json`,
   },
   { schema: testMethodArtifactSchema, fileName: (ver) => `test-methods.${ver}.json` },
   {
      schema: testMethodSummaryArtifactSchema,
      fileName: (ver) => `test-method-summary.${ver}.json`,
   },
   { schema: strategyArtifactSchema, fileName: (ver) => `strategy.${ver}.json` },
   { schema: slugIndexArtifactSchema, fileName: (ver) => `slug-index.${ver}.json` },
   {
      schema: techniqueIndexArtifactSchema,
      fileName: (ver) => `technique-index.${ver}.json`,
   },
   { schema: failureIndexArtifactSchema, fileName: (ver) => `failure-index.${ver}.json` },
   { schema: axeRuleIndexArtifactSchema, fileName: (ver) => `axe-rules.${ver}.json` },
   { schema: actRuleIndexArtifactSchema, fileName: (ver) => `act-rules.${ver}.json` },
];

function requiredFilesForVersion(version: string): string[] {
   return versionSchemas.map((entry) => entry.fileName(version));
}

function checkRequiredFiles(files: string[], entries: string[]): void {
   for (const fileName of files) {
      if (!entries.includes(fileName)) {
         throw new Error(`missing generated artifact ${fileName}`);
      }
   }
}

async function readJsonArtifact(
   directories: WcagDataDirectories,
   fileName: string,
): Promise<unknown> {
   const raw = await readFile(join(directories.generated, fileName), 'utf8');
   return JSON.parse(raw) as unknown;
}

async function validateVersionSchemas(input: {
   version: string;
   directories: WcagDataDirectories;
}): Promise<GeneratedArtifactWriteResult[]> {
   const ver = input.version;
   const dir = input.directories;
   const data = await Promise.all(
      versionSchemas.map((entry) => readJsonArtifact(dir, entry.fileName(ver))),
   );
   for (const [index, entry] of versionSchemas.entries()) {
      entry.schema.parse(data[index]);
   }
   return versionSchemas.map((entry) => ({
      fileName: entry.fileName(ver),
      filePath: join(dir.generated, entry.fileName(ver)),
   }));
}

function validateManifestShape(manifest: GeneratedProvenanceManifest): void {
   if (
      !Array.isArray(manifest.rawSources) ||
      !Array.isArray(manifest.artifacts) ||
      typeof manifest.generatedAt !== 'string'
   ) {
      throw new TypeError('invalid generated provenance manifest');
   }
}

async function validateManifestChecksums(input: {
   manifest: GeneratedProvenanceManifest;
   directories: WcagDataDirectories;
   entries: string[];
}): Promise<void> {
   await Promise.all(
      input.manifest.artifacts.map(async (artifact) => {
         if (!input.entries.includes(artifact.fileName)) {
            throw new Error(
               `generated provenance references missing file ${artifact.fileName}`,
            );
         }
         const body = await readFile(
            join(input.directories.generated, artifact.fileName),
            'utf8',
         );
         if (sha256(body) !== artifact.sha256) {
            throw new Error(
               `generated provenance checksum mismatch for ${artifact.fileName}`,
            );
         }
      }),
   );
}

async function loadAndValidateManifest(
   directories: WcagDataDirectories,
   entries: string[],
): Promise<GeneratedProvenanceManifest> {
   const manifestFileName = 'generated-provenance.json';
   if (!entries.includes(manifestFileName)) {
      throw new Error(`missing generated artifact ${manifestFileName}`);
   }
   const manifestRaw = await readFile(
      join(directories.generated, manifestFileName),
      'utf8',
   );
   const manifest = JSON.parse(manifestRaw) as GeneratedProvenanceManifest;
   validateManifestShape(manifest);
   return manifest;
}

/** Validates that the generated WCAG artifacts are present and internally consistent. */
export async function validateGeneratedArtifacts(
   directories: WcagDataDirectories = getWcagDataDirectories(),
): Promise<GeneratedArtifactWriteResult[]> {
   const entries = await readdir(directories.generated);
   const manifest = await loadAndValidateManifest(directories, entries);
   for (const version of wcagVersions) {
      checkRequiredFiles(requiredFilesForVersion(version), entries);
   }
   const versionResults = await Promise.all(
      wcagVersions.map((ver) => validateVersionSchemas({ version: ver, directories })),
   );
   const validatedArtifacts: GeneratedArtifactWriteResult[] = versionResults.flat();
   await validateManifestChecksums({ manifest, directories, entries });
   const manifestFileName = 'generated-provenance.json';
   validatedArtifacts.push({
      fileName: manifestFileName,
      filePath: join(directories.generated, manifestFileName),
   });
   return validatedArtifacts.toSorted((left, right) =>
      left.fileName.localeCompare(right.fileName),
   );
}

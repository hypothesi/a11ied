import {
   actRuleIndexArtifactSchema,
   axeRuleIndexArtifactSchema,
   testMethodArtifactSchema,
   testMethodSummaryArtifactSchema,
   criteriaByLevelArtifactSchema,
   documentContentStoreSchema,
   failureIndexArtifactSchema,
   normalizedCriteriaArtifactSchema,
   slugIndexArtifactSchema,
   strategyArtifactSchema,
   techniqueBodyArtifactSchema,
   techniqueIndexArtifactSchema,
   understandingArtifactSchema,
   type DocumentContentStore,
   type WcagVersion,
} from '@a11ied/contracts';

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EngineArtifacts } from '../shared/data.js';

function resolveInstalledPath(specifier: string): string | undefined {
   try {
      return fileURLToPath(import.meta.resolve(specifier));
   } catch {
      return undefined;
   }
}

function resolveGeneratedRootFromPackage(): string | undefined {
   const packageJsonPath = resolveInstalledPath('@a11ied/wcag-data/package.json');
   if (packageJsonPath) {
      return resolve(dirname(packageJsonPath), 'data/generated');
   }

   const packageEntryPath = resolveInstalledPath('@a11ied/wcag-data');
   if (!packageEntryPath) {
      return undefined;
   }
   const packageDir = dirname(packageEntryPath);
   if (packageDir.endsWith('/dist')) {
      return resolve(packageDir, '../data/generated');
   }
   return resolve(packageDir, 'data/generated');
}

function getGeneratedRootCandidates(): string[] {
   return [
      resolve(import.meta.dirname, '../../wcag-data/data/generated'),
      resolve(import.meta.dirname, '../../../wcag-data/data/generated'),
      resolve(import.meta.dirname, '../../../packages/wcag-data/data/generated'),
      resolve(process.cwd(), 'packages/wcag-data/data/generated'),
   ];
}

function findExistingGeneratedRoot(candidates: string[]): string | undefined {
   for (const candidate of candidates) {
      if (existsSync(candidate)) {
         return candidate;
      }
   }
   return undefined;
}

function resolveGeneratedRoot(): string {
   const packageRoot = resolveGeneratedRootFromPackage();
   if (packageRoot) {
      return packageRoot;
   }

   const candidates = getGeneratedRootCandidates();
   const existingRoot = findExistingGeneratedRoot(candidates);
   if (existingRoot) {
      return existingRoot;
   }

   return resolve(process.cwd(), 'packages/wcag-data/data/generated');
}

const generatedRoot = resolveGeneratedRoot();

function loadArtifact<TResult>(
   schema: { parse: (data: unknown) => TResult },
   fileName: string,
): TResult {
   const filePath = resolve(generatedRoot, fileName);
   return schema.parse(JSON.parse(readFileSync(filePath, 'utf8')) as unknown);
}

/** Reads and validates every generated artifact for one WCAG version from disk. */
export function loadEngineArtifacts(version: WcagVersion): EngineArtifacts {
   const criteria = loadArtifact(
      normalizedCriteriaArtifactSchema,
      `criteria.${version}.json`,
   );

   return {
      criteria: criteria.criteria,
      criteriaByLevel: loadArtifact(
         criteriaByLevelArtifactSchema,
         `criteria-by-level.${version}.json`,
      ).levels,
      testMethods: loadArtifact(testMethodArtifactSchema, `test-methods.${version}.json`)
         .testMethods,
      strategies: loadArtifact(strategyArtifactSchema, `strategy.${version}.json`)
         .strategies,
      slugToId: loadArtifact(slugIndexArtifactSchema, `slug-index.${version}.json`).slugs,
      techniques: loadArtifact(
         techniqueIndexArtifactSchema,
         `technique-index.${version}.json`,
      ).techniques,
      failures: loadArtifact(failureIndexArtifactSchema, `failure-index.${version}.json`)
         .failures,
      axeRules: loadArtifact(axeRuleIndexArtifactSchema, `axe-rules.${version}.json`)
         .rules,
      actRules: loadArtifact(actRuleIndexArtifactSchema, `act-rules.${version}.json`)
         .rules,
      testMethodSummary: loadArtifact(
         testMethodSummaryArtifactSchema,
         `test-method-summary.${version}.json`,
      ),
      understanding: loadArtifact(
         understandingArtifactSchema,
         `understanding.${version}.json`,
      ).documents,
      techniqueBodies: loadArtifact(
         techniqueBodyArtifactSchema,
         `technique-bodies.${version}.json`,
      ).bodies,
   };
}

/** Reads the shared, deduplicated document content store from disk. */
export function loadDocumentContentStore(): DocumentContentStore {
   return loadArtifact(documentContentStoreSchema, 'documents-content.json');
}

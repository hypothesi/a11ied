import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '../../..');

interface PublicApiExpectation {
   file: string;
   functions?: string[];
   classes?: string[];
}

const publicApiExpectations: PublicApiExpectation[] = [
   {
      file: 'packages/mcp-server/src/index.ts',
      functions: ['startMcpServer'],
   },
   {
      file: 'packages/mcp-server/src/server.ts',
      functions: ['createMcpServer'],
   },
   {
      file: 'packages/guidepup/src/adapters.ts',
      functions: ['createDriverAdapter'],
   },
   {
      file: 'packages/guidepup/src/adapter-shared.ts',
      functions: ['buildStateSnapshot'],
   },
   {
      file: 'packages/guidepup/src/readiness.ts',
      functions: ['guidepupSetupCommand', 'describePlatform'],
   },
   {
      file: 'packages/core/src/errors/cli-environment-error.ts',
      classes: ['CliEnvironmentError'],
   },
   {
      file: 'packages/core/src/errors/cli-errors.ts',
      classes: ['CliUsageError'],
   },
   {
      file: 'packages/core/src/index.ts',
      functions: [
         'createDoctorReport',
         'listCliCommands',
         'listSupportedTargets',
         'renderDoctorText',
      ],
   },
   {
      file: 'packages/core/src/wcag/runtime.ts',
      functions: [
         'listWcagLevels',
         'listWcagCriteria',
         'showWcagCriterion',
         'searchWcagCriteria',
         'showWcagCoverage',
         'inspectApplicableTarget',
         'inspectApplicableUrl',
         'inspectCriterionTarget',
         'inspectCriterionUrl',
      ],
   },
   {
      file: 'packages/core/src/driver/runtime.ts',
      functions: [
         'cleanupStaleDriverSessions',
         'startDriverSession',
         'getDriverSessionStatus',
         'stopDriverSession',
         'attachDocumentToDriverSession',
         'runDriverSessionAction',
         'runEphemeralDriverAction',
      ],
   },
   {
      file: 'packages/core/src/axe/runtime.ts',
      functions: ['runAxe'],
   },
   {
      file: 'packages/core/src/targets/runtime.ts',
      functions: ['resolveDocumentTarget'],
   },
   {
      file: 'packages/wcag-data/src/shared/types.ts',
      classes: ['SyncValidationError'],
   },
   {
      file: 'packages/wcag-data/src/sources/definitions.ts',
      functions: [
         'getWcagDataDirectories',
         'ensureWcagDataDirectories',
         'listApprovedUpstreamSourceUrls',
         'listRawSourceDefinitions',
      ],
   },
   {
      file: 'packages/wcag-data/src/sources/sync.ts',
      functions: ['deriveAxeRuleMetadata', 'syncRawSources'],
   },
   {
      file: 'packages/wcag-data/src/normalization/criteria.ts',
      functions: ['normalizeCriteriaArtifacts'],
   },
   {
      file: 'packages/wcag-data/src/generation/build.ts',
      functions: ['generateNormalizedArtifacts', 'runWcagDataSync'],
   },
   {
      file: 'packages/wcag-data/src/validation/raw.ts',
      functions: ['validateRawSyncState'],
   },
   {
      file: 'packages/wcag-data/src/validation/generated.ts',
      functions: ['validateGeneratedArtifacts'],
   },
   {
      file: 'packages/wcag-engine/src/errors/not-found.ts',
      classes: ['WcagEngineNotFoundError'],
   },
   {
      file: 'packages/wcag-engine/src/errors/validation.ts',
      classes: ['WcagEngineValidationError'],
   },
   {
      file: 'packages/wcag-engine/src/artifacts/runtime.ts',
      functions: [
         'getArtifacts',
         'parseVersion',
         'getCriterion',
         'listCriteriaByLevel',
         'getCoverage',
         'getQuickrefTags',
         'resetWcagEngineCache',
      ],
   },
   {
      file: 'packages/wcag-engine/src/search/runtime.ts',
      functions: ['searchCriteria'],
   },
   {
      file: 'packages/wcag-engine/src/applicability/runtime.ts',
      functions: ['getCriterionApplicability', 'listApplicableCriteria'],
   },
];

function readSource(file: string): string {
   return readFileSync(resolve(rootDir, file), 'utf8');
}

function expectFunctionJSDoc(source: string, name: string): void {
   const pattern = new RegExp(
      String.raw`/\*\*[\s\S]*?\*/\s*export\s+(?:async\s+)?function\s+${name}\b`,
      'm',
   );
   expect(source).toMatch(pattern);
}

function expectClassJSDoc(source: string, name: string): void {
   const pattern = new RegExp(
      String.raw`/\*\*[\s\S]*?\*/\s*export\s+class\s+${name}\b`,
      'm',
   );
   expect(source).toMatch(pattern);
}

describe('public api documentation coverage', () => {
   it('keeps JSDoc on public exported functions and classes', () => {
      for (const expectation of publicApiExpectations) {
         const source = readSource(expectation.file);
         for (const name of expectation.functions ?? []) {
            expectFunctionJSDoc(source, name);
         }
         for (const name of expectation.classes ?? []) {
            expectClassJSDoc(source, name);
         }
      }
   });
});

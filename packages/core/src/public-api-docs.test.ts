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
      file: 'packages/guidepup/src/environment.ts',
      functions: [
         'checkNvdaEnvironment',
         'checkVoiceOverEnvironment',
         'resolveGuidepupCachePath',
      ],
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
      functions: ['listCliCommands'],
   },
   {
      file: 'packages/core/src/doctor/runtime.ts',
      functions: ['createDoctorReport', 'listSupportedTargets'],
   },
   {
      file: 'packages/core/src/doctor/render.ts',
      functions: ['renderDoctorText'],
   },
   {
      file: 'packages/core/src/wcag/runtime.ts',
      functions: [
         'listWcagCriteria',
         'showWcagCriterion',
         'searchWcagCriteria',
         'showWcagTestMethod',
         'showWcagTestMethodSummary',
         'showWcagTechnique',
         'showWcagAxeRule',
         'inspectRelevantCriteriaTarget',
         'inspectRelevantCriteriaUrl',
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
      file: 'packages/core/src/driver/screen-reader-node.ts',
      functions: ['screenReader'],
   },
   {
      file: 'packages/core/src/driver/screen-reader.ts',
      classes: ['ScreenReader'],
   },
   {
      file: 'packages/core/src/driver/screen-reader-errors.ts',
      classes: ['ScreenReaderAssertionError'],
   },
   {
      file: 'packages/core/src/driver/spoken-matchers.ts',
      functions: ['checkSpoken', 'checkSpokenInOrder', 'checkCurrentItem'],
   },
   {
      file: 'packages/core/src/driver/virtual-host-choice.ts',
      functions: ['createVirtualHost'],
   },
   {
      file: 'packages/core/src/driver/virtual-playwright-host.ts',
      functions: ['createPlaywrightVirtualHost'],
   },
   {
      file: 'packages/guidepup/src/virtual-runtime.ts',
      functions: ['createVirtualRuntime'],
   },
   {
      file: 'packages/guidepup/src/virtual-dom.ts',
      functions: ['createJsdomVirtualHost'],
   },
   {
      file: 'packages/cli/src/browser/index.ts',
      functions: ['screenReader'],
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
         'getTestMethod',
         'getTestMethodSummary',
         'getQuickrefTags',
         'getTechnique',
         'getAxeRule',
         'resetWcagEngineCache',
      ],
   },
   {
      file: 'packages/wcag-engine/src/artifacts/load.ts',
      functions: ['loadEngineArtifacts'],
   },
   {
      file: 'packages/wcag-data/src/test-methods/axe-rules.ts',
      functions: ['buildAxeRuleIndex'],
   },
   {
      file: 'packages/wcag-engine/src/search/runtime.ts',
      functions: ['searchCriteria'],
   },
   {
      file: 'packages/wcag-engine/src/relevance/runtime.ts',
      functions: ['getCriterionRelevance', 'listRelevantCriteria'],
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

describe('public api JSDoc', () => {
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

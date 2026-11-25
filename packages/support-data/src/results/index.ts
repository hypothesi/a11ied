import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSupportDataDirectories } from '../paths.js';
import type {
   EnvironmentResultFile,
   TestEnvironment,
   TestOutcome,
   TestRunRecord,
} from '../types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnvironmentResultFile(value: unknown): value is EnvironmentResultFile {
   if (!isRecord(value)) {
      return false;
   }
   return (
      value.schemaVersion === 1 &&
      typeof value.environmentKey === 'string' &&
      isRecord(value.environment) &&
      typeof value.environment.id === 'string' &&
      (value.status === 'tested' || value.status === 'untested') &&
      Array.isArray(value.runs)
   );
}

const DEFAULT_USAGE_ORDER = 99;

const PLATFORM_ORDER: Record<TestEnvironment['platformGroup'], number> = {
   'macos-voiceover': 0,
   'android-talkback': 1,
   'ios-voiceover': 2,
   virtual: 3,
};

interface ResultsCacheState {
   environmentFiles: readonly EnvironmentResultFile[] | undefined;
}

const cacheState: ResultsCacheState = {
   environmentFiles: undefined,
};

export function resetResultsCache(): void {
   cacheState.environmentFiles = undefined;
}

function loadEnvironmentFiles(): readonly EnvironmentResultFile[] {
   const { resultsDir } = getSupportDataDirectories();
   if (!existsSync(resultsDir)) {
      return [];
   }
   const loaded: EnvironmentResultFile[] = [];
   const fileNames = readdirSync(resultsDir).filter((name) => name.endsWith('.json'));
   for (const fileName of fileNames) {
      const filePath = resolve(resultsDir, fileName);
      const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
      if (!isEnvironmentResultFile(parsed)) {
         throw new Error(`Invalid screen reader result file: ${filePath}`);
      }
      loaded.push(parsed);
   }
   return loaded.toSorted((left, right) => {
      const groupDiff =
         PLATFORM_ORDER[left.environment.platformGroup] -
         PLATFORM_ORDER[right.environment.platformGroup];
      if (groupDiff !== 0) {
         return groupDiff;
      }
      const orderDiff =
         (left.environment.usageOrder ?? DEFAULT_USAGE_ORDER) -
         (right.environment.usageOrder ?? DEFAULT_USAGE_ORDER);
      if (orderDiff !== 0) {
         return orderDiff;
      }
      return left.environment.label.localeCompare(right.environment.label);
   });
}

export function listEnvironmentFiles(): readonly EnvironmentResultFile[] {
   cacheState.environmentFiles ??= loadEnvironmentFiles();
   return cacheState.environmentFiles;
}

export function listEnvironments(): readonly TestEnvironment[] {
   return listEnvironmentFiles().map((file) => file.environment);
}

export function getRunForTestAndEnvironment(
   testSlug: string,
   environmentKey: string,
): TestRunRecord | undefined {
   const envFile = listEnvironmentFiles().find(
      (file) => file.environmentKey === environmentKey,
   );
   if (!envFile) {
      return undefined;
   }
   return envFile.runs.find((run) => run.testSlug === testSlug);
}

export function getRunsForTest(testSlug: string): readonly TestRunRecord[] {
   const runs: TestRunRecord[] = [];
   for (const envFile of listEnvironmentFiles()) {
      const match = envFile.runs.find((run) => run.testSlug === testSlug);
      if (match) {
         runs.push(match);
      }
   }
   return runs;
}

export function getSummaryCounts(): Readonly<Record<TestOutcome, number>> & {
   readonly totalRuns: number;
   readonly testedEnvironments: number;
   readonly trackedEnvironments: number;
} {
   const files = listEnvironmentFiles();
   const counts: Record<TestOutcome, number> = {
      pass: 0,
      partial: 0,
      fail: 0,
      'not-applicable': 0,
      untested: 0,
   };
   let testedEnvironments = 0;
   let totalRuns = 0;

   for (const file of files) {
      if (file.status === 'tested' && file.runs.length > 0) {
         testedEnvironments += 1;
      }
      for (const run of file.runs) {
         counts[run.outcome] += 1;
         totalRuns += 1;
      }
   }

   return {
      ...counts,
      totalRuns,
      testedEnvironments,
      trackedEnvironments: files.length,
   };
}

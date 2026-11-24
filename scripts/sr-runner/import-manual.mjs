import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScreenReaderCatalog } from './load-cases.mjs';
import { evaluateTestRun } from './evaluate.mjs';
import { filterTranscriptToTestContent } from './privacy.mjs';
import { writeEnvironmentResultFile } from './results-io.mjs';

const ARG_START_INDEX = 2;

function parseInputPath(argv) {
   const fileIndex = argv.indexOf('--file');
   if (fileIndex !== -1 && argv[fileIndex + 1]) {
      return resolve(argv[fileIndex + 1]);
   }
   const positional = argv.find((arg) => !arg.startsWith('--'));
   if (!positional) {
      throw new Error('Usage: npm run sr:import -- --file <path-to-manual-capture.json>');
   }
   return resolve(positional);
}

function assertEnvironmentFields(environment) {
   const required = [
      'id',
      'label',
      'shortLabel',
      'platformGroup',
      'device',
      'os',
      'osVersion',
      'browser',
      'browserVersion',
      'screenReader',
      'screenReaderVersion',
   ];
   for (const field of required) {
      if (typeof environment?.[field] !== 'string' || environment[field].trim() === '') {
         throw new Error(`Missing or empty environment.${field} in manual import JSON.`);
      }
   }
}

function normalizeManualRun({
   entry,
   rawEnvironment,
   environmentKey,
   getTestCaseBySlug,
}) {
   const testCase = getTestCaseBySlug(entry.testSlug);
   if (!testCase) {
      throw new Error(`Unknown testSlug in manual import: "${String(entry.testSlug)}".`);
   }
   const rawTranscript = Array.isArray(entry.transcript) ? entry.transcript : [];
   const transcript = filterTranscriptToTestContent(rawTranscript);
   const evaluated =
      entry.outcome && entry.keyAnnouncement
         ? {
              outcome: entry.outcome,
              keyAnnouncement: entry.keyAnnouncement,
              notes: entry.notes ?? 'Imported from manual capture.',
           }
         : evaluateTestRun(testCase, transcript, entry.postActionStartIndex ?? 0);

   return {
      testSlug: testCase.slug,
      environmentKey,
      environment: rawEnvironment,
      runAt: entry.runAt ?? new Date().toISOString(),
      driver: entry.driver ?? 'manual-capture',
      outcome: evaluated.outcome,
      keyAnnouncement: evaluated.keyAnnouncement,
      notes: evaluated.notes,
      transcript,
      ...(evaluated.assertionResults
         ? { assertionResults: evaluated.assertionResults }
         : {}),
      ...(evaluated.assertionSummary
         ? { assertionSummary: evaluated.assertionSummary }
         : {}),
   };
}

async function main() {
   const repoRoot = process.cwd();
   const inputPath = parseInputPath(process.argv.slice(ARG_START_INDEX));
   if (!existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
   }

   const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
   assertEnvironmentFields(raw.environment);
   if (!Array.isArray(raw.runs)) {
      throw new TypeError('Manual import JSON must include a "runs" array.');
   }

   const { screenReaderTests, getTestCaseBySlug, buildEnvironmentKey } =
      await loadScreenReaderCatalog(repoRoot);
   const environmentKey = buildEnvironmentKey(raw.environment);

   const normalizedRuns = raw.runs.map((entry) =>
      normalizeManualRun({
         entry,
         rawEnvironment: raw.environment,
         environmentKey,
         getTestCaseBySlug,
      }),
   );

   const fileSlug =
      raw.fileSlug ??
      `${raw.environment.os}-${raw.environment.osVersion}-${raw.environment.browser}-${raw.environment.screenReader}`
         .toLowerCase()
         .replaceAll(/[^a-z0-9._-]+/gu, '-');

   const outputPath = writeEnvironmentResultFile({
      repoRoot,
      fileSlug,
      environmentKey,
      environment: raw.environment,
      newRuns: normalizedRuns,
      testOrder: screenReaderTests.map((testCase) => testCase.slug),
      mergeExisting: true,
   });

   process.stdout.write(
      `Imported ${String(normalizedRuns.length)} run(s) into ${outputPath}\n`,
   );
}

try {
   await main();
} catch (error) {
   process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
   );
   process.exitCode = 1;
}

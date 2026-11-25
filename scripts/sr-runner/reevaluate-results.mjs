import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateTestRun } from './evaluate.mjs';
import { loadScreenReaderCatalog } from './load-cases.mjs';

const JSON_INDENT = 3;

function inferPostActionStartIndex(testCase, transcript) {
   if (testCase.evaluation.mode !== 'interact' || !Array.isArray(transcript)) {
      return 0;
   }
   const firstPostIndex = transcript.findIndex((entry) => {
      const cmd = String(entry.command ?? '').toLowerCase();
      return cmd.includes('activate') || cmd.includes('(act)');
   });
   return firstPostIndex === -1 ? transcript.length : firstPostIndex;
}

function reevaluateSingleRun(run, fileName, getTestCaseBySlug) {
   const testCase = getTestCaseBySlug(run.testSlug);
   if (!testCase) {
      return { run, updated: false };
   }
   const postActionStartIndex = inferPostActionStartIndex(testCase, run.transcript);
   const evaluated = evaluateTestRun(
      testCase,
      run.transcript ?? [],
      postActionStartIndex,
   );
   if (evaluated.outcome !== run.outcome) {
      process.stdout.write(
         `[reevaluate] ${fileName} :: ${run.testSlug} outcome ${run.outcome} -> ${evaluated.outcome}\n`,
      );
   }
   return {
      updated: true,
      run: {
         ...run,
         outcome: evaluated.outcome,
         keyAnnouncement: evaluated.keyAnnouncement,
         notes: evaluated.notes,
         assertionSummary: evaluated.assertionSummary,
         assertionResults: evaluated.assertionResults,
      },
   };
}

async function main() {
   const repoRoot = process.cwd();
   const { getTestCaseBySlug } = await loadScreenReaderCatalog(repoRoot);
   const resultsDir = resolve(repoRoot, 'packages', 'support-data', 'data', 'results');

   const files = readdirSync(resultsDir)
      .filter((name) => name.endsWith('.json'))
      .toSorted();

   let updatedCount = 0;

   for (const fileName of files) {
      const filePath = resolve(resultsDir, fileName);
      const payload = JSON.parse(readFileSync(filePath, 'utf8'));
      if (!Array.isArray(payload.runs) || payload.runs.length === 0) {
         continue;
      }

      const nextRuns = [];
      for (const run of payload.runs) {
         const evaluated = reevaluateSingleRun(run, fileName, getTestCaseBySlug);
         if (evaluated.updated) {
            updatedCount += 1;
         }
         nextRuns.push(evaluated.run);
      }

      const updatedPayload = {
         ...payload,
         runs: nextRuns,
      };
      writeFileSync(
         filePath,
         `${JSON.stringify(updatedPayload, undefined, JSON_INDENT)}\n`,
         'utf8',
      );
   }

   process.stdout.write(
      `Re-evaluated ${String(updatedCount)} recorded run(s) with RFC-2119 assertions.\n`,
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

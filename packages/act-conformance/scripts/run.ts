import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
   diffBaseline,
   listContradictions,
   readBaseline,
   writeBaseline,
   type BaselineEntry,
} from '../src/baseline.js';
import { fetchCorpus, readTestCases } from '../src/corpus.js';
import { ACT_RULES_WITHOUT_TEST_CASES, listAxeActPairs } from '../src/mapping.js';
import { buildConformanceEarlReport, scoreByRule } from '../src/report.js';
import { runConformance, type CaseOutcome } from '../src/run.js';

const A11IED_VERSION = '0.1.0';
const DEFAULT_CONCURRENCY = 6;
const CONCURRENCY_FLAG = '--concurrency=';
const LIMIT_FLAG = '--limit=';
const PROGRESS_EVERY = 50;
const JSON_INDENT = 2;
const PERCENT = 100;
const TABLE_RULE_WIDTH = 80;
const COL_ACT = 10;
const COL_AXE = 30;
const COL_CASES = 5;
const COL_AGREED = 8;
const COL_DECLINED = 10;
const COL_CONTRA = 16;

const shouldUpdateBaseline = process.argv.includes('--update-baseline');
const includeVideoAssets = process.argv.includes('--video');
const concurrency =
   Number(
      process.argv
         .find((arg) => arg.startsWith(CONCURRENCY_FLAG))
         ?.slice(CONCURRENCY_FLAG.length),
   ) || DEFAULT_CONCURRENCY;
const caseLimit =
   Number(
      process.argv.find((arg) => arg.startsWith(LIMIT_FLAG))?.slice(LIMIT_FLAG.length),
   ) || Number.POSITIVE_INFINITY;

function write(line: string): void {
   process.stdout.write(`${line}\n`);
}

function reportScores(outcomes: CaseOutcome[]): void {
   write('');
   write(
      'ACT rule  axe rule                      cases  agreed  declined  contradictions',
   );
   write('-'.repeat(TABLE_RULE_WIDTH));
   for (const score of scoreByRule(outcomes)) {
      write(
         [
            score.actRuleId.padEnd(COL_ACT),
            score.axeRuleId.padEnd(COL_AXE),
            String(score.cases).padStart(COL_CASES),
            String(score.agreed).padStart(COL_AGREED),
            String(score.declined).padStart(COL_DECLINED),
            String(score.contradictions).padStart(COL_CONTRA),
         ].join(''),
      );
   }
}

function reportCoverage(outcomes: CaseOutcome[], totalCases: number): void {
   const decided = new Set(
      outcomes
         .filter(
            (outcome) => outcome.actual !== 'untested' && outcome.actual !== 'cantTell',
         )
         .map((outcome) => `${outcome.testcaseId}|${outcome.actRuleId}`),
   );
   const percent = ((decided.size / totalCases) * PERCENT).toFixed(1);

   write('');
   write(`test cases:        ${String(totalCases)}`);
   write(`decided:           ${String(decided.size)} (${percent}%)`);
   write(`assertions scored: ${String(outcomes.length)}`);
}

function reportDrift(added: BaselineEntry[], removed: BaselineEntry[]): void {
   if (added.length > 0) {
      write('');
      write(`NEW contradictions (${String(added.length)}):`);
      for (const entry of added) {
         write(
            `  ${entry.actRuleId} / ${entry.axeRuleId}  ${entry.testcaseId}  expected=${entry.expected} actual=${entry.actual}`,
         );
      }
   }
   if (removed.length > 0) {
      write('');
      write(`FIXED contradictions still in the baseline (${String(removed.length)}):`);
      for (const entry of removed) {
         write(`  ${entry.actRuleId} / ${entry.axeRuleId}  ${entry.testcaseId}`);
      }
      write('  Run with --update-baseline to record them as fixed.');
   }
}

const paths = await fetchCorpus({ includeVideoAssets });
const testCases = await readTestCases(paths);
const pairs = listAxeActPairs();

write(`corpus ${paths.root}`);
write(
   `${String(pairs.length)} axe/ACT pairs over ${String(new Set(pairs.map((pair) => pair.actRuleId)).size)} ACT rules`,
);

const withoutCases = ACT_RULES_WITHOUT_TEST_CASES.filter((ruleId) =>
   testCases.some((testCase) => testCase.ruleId === ruleId),
);
if (withoutCases.length > 0) {
   write(
      `note: ${withoutCases.join(', ')} now have test cases; update the mapping notes.`,
   );
}

const selected = testCases.slice(0, caseLimit);

const run = await runConformance({
   paths,
   testCases: selected,
   concurrency,
   onProgress: ({ scanned, total }) => {
      if (scanned % PROGRESS_EVERY === 0) {
         write(`  scanned ${String(scanned)}/${String(total)}`);
      }
   },
});

reportScores(run.outcomes);
reportCoverage(run.outcomes, selected.length);

if (run.missingAssets.length > 0) {
   write('');
   write(`missing assets: ${String(run.missingAssets.length)} paths returned 404.`);
   write('  Run with --video if these are perspective-video or rabbit-video.');
}

const earlPath = join(paths.root, 'a11ied-earl-report.json');
await writeFile(
   earlPath,
   `${JSON.stringify(
      buildConformanceEarlReport({
         outcomes: run.outcomes,
         testCases: selected,
         version: A11IED_VERSION,
      }),
      undefined,
      JSON_INDENT,
   )}\n`,
   'utf8',
);
write('');
write(`EARL report written to ${earlPath}`);

const current = listContradictions(run.outcomes);

if (shouldUpdateBaseline) {
   await writeBaseline(current);
   write(`baseline updated with ${String(current.length)} contradictions.`);
} else {
   const { added, removed } = diffBaseline(await readBaseline(), current);
   reportDrift(added, removed);

   write('');
   write(`contradictions: ${String(current.length)} total, ${String(added.length)} new.`);
   if (added.length > 0 || removed.length > 0) {
      process.exitCode = 1;
   }
}

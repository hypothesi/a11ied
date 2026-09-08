import { runAxe, resolveDocumentTarget } from '@a11ied/core';
import type { EarlOutcome } from '@a11ied/contracts';

import type { ActTestCase, CorpusPaths } from './corpus.js';

/*
 * A pinned viewport keeps the contrast and focus-visibility rules deterministic, and it
 * also makes `withLoadedPage` take the fresh-page path instead of the shared cached page.
 * Without it, concurrent workers navigate the same page and abort each other.
 */
const VIEWPORT = { width: 1280, height: 720 };
import { listAxeActPairs, listScannedAxeRuleIds, type AxeActPair } from './mapping.js';
import { isContradiction, reduceRuleOutcome } from './outcome.js';
import { createCorpusServer, type CorpusServerHandle } from './server.js';

/** One scored result for one axe procedure against one test case. */
export interface CaseOutcome {
   testcaseId: string;
   testcaseTitle: string;
   actRuleId: string;
   axeRuleId: string;
   expected: ActTestCase['expected'];
   actual: EarlOutcome;
   approved: boolean;
   contradiction: boolean;
   /** The canonical w3.org URL, not the local server the scan actually loaded. */
   sourceUrl: string;
}

export interface RunProgress {
   scanned: number;
   total: number;
}

async function scoreOneCase(input: {
   testCase: ActTestCase;
   pairs: AxeActPair[];
   server: CorpusServerHandle;
   ruleIds: string[];
}): Promise<CaseOutcome[]> {
   const { testCase } = input;
   const claiming = input.pairs.filter((pair) => pair.actRuleId === testCase.ruleId);
   if (claiming.length === 0) {
      return [];
   }

   const resolved = await resolveDocumentTarget({
      url: input.server.urlFor(testCase.relativePath),
   });
   if (!resolved.load) {
      throw new Error(`could not load test case ${testCase.testcaseId}`);
   }
   const result = await runAxe(resolved.load, {
      wcagVersion: '2.2',
      ruleIds: claiming.map((pair) => pair.axeRuleId),
      viewport: VIEWPORT,
   });

   /*
    * Score each axe rule on its own. Ten ACT rules are claimed by more than one axe rule,
    * and some siblings are stricter: 09o5cg is the AA contrast rule but is claimed by
    * both color-contrast and color-contrast-enhanced. Folding them into one verdict lets
    * the AAA rule manufacture a contradiction on the AA rule's passing examples.
    */
   return claiming.map((pair) => {
      const actual = reduceRuleOutcome(result, pair.axeRuleId);
      return {
         testcaseId: testCase.testcaseId,
         testcaseTitle: testCase.testcaseTitle,
         actRuleId: pair.actRuleId,
         axeRuleId: pair.axeRuleId,
         expected: testCase.expected,
         actual,
         approved: testCase.approved === true,
         contradiction: isContradiction(testCase.expected, actual),
         sourceUrl: testCase.url,
      };
   });
}

export interface RunConformanceInput {
   paths: CorpusPaths;
   testCases: ActTestCase[];
   concurrency: number;
   onProgress?: (progress: RunProgress) => void;
}

export interface ScanFailure {
   testcaseId: string;
   actRuleId: string;
   message: string;
}

export interface ConformanceRun {
   outcomes: CaseOutcome[];
   failures: ScanFailure[];
   missingAssets: string[];
   scannedRuleIds: string[];
}

/**
 * Scans every test case whose ACT rule axe claims, and scores the result.
 *
 * The scan runs through Playwright. axe-core in jsdom memoizes `window` and `document` on
 * its first run, so a second document in the same process throws.
 */
export async function runConformance(
   input: RunConformanceInput,
): Promise<ConformanceRun> {
   const pairs = listAxeActPairs();
   const ruleIds = listScannedAxeRuleIds(pairs);
   const server = createCorpusServer(input.paths);
   await server.start();

   const outcomes: CaseOutcome[] = [];
   const failures: ScanFailure[] = [];
   let scanned = 0;
   let cursor = 0;

   /*
    * Each worker takes the next unclaimed case and recurses, rather than looping, so a
    * slow page never blocks the others behind a chunk boundary.
    */
   async function worker(): Promise<void> {
      const testCase = input.testCases[cursor];
      cursor += 1;
      if (!testCase) {
         return;
      }
      /*
       * A page that will not load is recorded and skipped. One unloadable case out of
       * 1,213 must not throw away the whole run, and scoring it as an outcome would
       * invent a result the scan never produced.
       */
      try {
         outcomes.push(...(await scoreOneCase({ testCase, pairs, server, ruleIds })));
      } catch (error) {
         failures.push({
            testcaseId: testCase.testcaseId,
            actRuleId: testCase.ruleId,
            message:
               error instanceof Error
                  ? (error.message.split('\n')[0] ?? '')
                  : String(error),
         });
      }
      scanned += 1;
      input.onProgress?.({ scanned, total: input.testCases.length });
      return worker();
   }

   try {
      await Promise.all(Array.from({ length: input.concurrency }, () => worker()));
   } finally {
      await server.stop();
   }

   return {
      outcomes,
      failures,
      missingAssets: server.listMissingAssets(),
      scannedRuleIds: ruleIds,
   };
}

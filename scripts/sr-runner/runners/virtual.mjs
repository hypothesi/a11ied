import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolveA11iedPaths } from '../a11ied-resolve.mjs';
import { evaluateTestRun } from '../evaluate.mjs';
import { filterTranscriptToTestContent } from '../privacy.mjs';

const DEFAULT_MAX_STEPS = 30;
const POST_ACTIVATE_DELAY_MS = 250;

function detectMacOSVersion() {
   try {
      const version = execFileSync('sw_vers', ['-productVersion'], {
         encoding: 'utf8',
      }).trim();
      return `${version} (${process.arch})`;
   } catch {
      return `${process.platform} (${process.arch})`;
   }
}

async function detectBrowserInfo(launchAutomationBrowser) {
   const launched = await launchAutomationBrowser();
   try {
      return {
         label: launched.candidate?.label ?? 'Google Chrome',
         version: launched.browser.version(),
      };
   } finally {
      await launched.browser.close();
   }
}

function delay(ms) {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

function toTranscriptEntries(items, commandLabel) {
   return items.map((item, index) => {
      const entry = {
         step: index + 1,
         command: commandLabel,
         phrase: item.phrase ?? '',
      };
      if (item.role) {
         entry.role = item.role;
      }
      if (item.name) {
         entry.name = item.name;
      }
      return entry;
   });
}

async function runSingleCase({ sr, testCase, baseURL }) {
   const url = `${baseURL}/compatibility/cases/${testCase.slug}/`;
   await sr.open(url);
   const maxSteps = testCase.evaluation.maxSteps ?? DEFAULT_MAX_STEPS;
   const walkedItems = await sr.walk({ max: maxSteps });
   const walkTranscript = toTranscriptEntries(walkedItems, 'virtual.walk');

   let fullTranscript = walkTranscript;
   let postActionStartIndex = 0;

   if (
      testCase.evaluation.mode === 'interact' &&
      testCase.evaluation.activateButtonText
   ) {
      postActionStartIndex = walkTranscript.length;
      await sr.top();
      await sr.goTo({ role: 'button', name: testCase.evaluation.activateButtonText });
      await sr.checkpoint('before-activate');
      await sr.activate();
      await delay(POST_ACTIVATE_DELAY_MS);
      const afterRaw = await sr.transcript({ since: 'before-activate' });
      const postEntries = afterRaw
         .filter((entry) => entry.checkpoint === undefined && entry.phrase)
         .map((entry, index) => {
            const converted = {
               step: postActionStartIndex + index + 1,
               command: 'virtual.activate',
               phrase: entry.phrase,
            };
            if (entry.itemText && entry.itemText !== entry.phrase) {
               converted.itemText = entry.itemText;
            }
            return converted;
         });
      fullTranscript = [...walkTranscript, ...postEntries];
   }

   const filtered = filterTranscriptToTestContent(fullTranscript);
   const evaluation = evaluateTestRun(testCase, filtered, postActionStartIndex);

   return {
      testSlug: testCase.slug,
      runAt: new Date().toISOString(),
      driver: 'a11ied/screenReader (sr: virtual, engine: browser)',
      outcome: evaluation.outcome,
      keyAnnouncement: evaluation.keyAnnouncement,
      notes: evaluation.notes,
      assertionSummary: evaluation.assertionSummary,
      assertionResults: evaluation.assertionResults,
      transcript: filtered,
   };
}

async function runCasesSequentially({
   sr,
   testCases,
   baseURL,
   environmentKey,
   environment,
   runs,
   index = 0,
}) {
   if (index >= testCases.length) {
      return;
   }
   const testCase = testCases[index];
   process.stdout.write(`[virtual] Running ${testCase.slug}...\n`);
   const run = await runSingleCase({ sr, testCase, baseURL });
   runs.push({
      ...run,
      environmentKey,
      environment,
   });
   await runCasesSequentially({
      sr,
      testCases,
      baseURL,
      environmentKey,
      environment,
      runs,
      index: index + 1,
   });
}

export async function runVirtualTarget({ testCases, baseURL, buildEnvironmentKey }) {
   const paths = resolveA11iedPaths();
   const { launchAutomationBrowser, screenReader } = await import(paths.coreEntry);
   const virtualPkg = JSON.parse(readFileSync(paths.virtualSrPkg, 'utf8'));
   const [osVersion, browserInfo] = await Promise.all([
      Promise.resolve(detectMacOSVersion()),
      detectBrowserInfo(launchAutomationBrowser),
   ]);

   const environment = {
      id: 'virtual-chromium',
      label: `Virtual SR ${virtualPkg.version} · Headless ${browserInfo.label} ${browserInfo.version}`,
      shortLabel: 'Virtual SR',
      platformGroup: 'virtual',
      device: 'Headless Chromium (Playwright)',
      os: 'macOS',
      osVersion,
      browser: `${browserInfo.label} (Headless)`,
      browserVersion: browserInfo.version,
      browserType: 'browser',
      usageOrder: 1,
      screenReader: 'a11ied / Guidepup Virtual',
      screenReaderVersion: String(virtualPkg.version),
   };
   const environmentKey = buildEnvironmentKey(environment);

   const firstURL = `${baseURL}/compatibility/cases/${testCases[0].slug}/`;
   const sr = await screenReader({
      sr: 'virtual',
      engine: 'browser',
      url: firstURL,
   });

   const runs = [];
   try {
      await runCasesSequentially({
         sr,
         testCases,
         baseURL,
         environmentKey,
         environment,
         runs,
      });
   } finally {
      await sr.stop();
   }

   return {
      fileSlug: `virtual-chromium-${virtualPkg.version}`,
      environmentKey,
      environment,
      runs,
   };
}

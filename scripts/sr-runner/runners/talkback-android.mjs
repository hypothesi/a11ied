import { resolveA11iedPaths } from '../a11ied-resolve.mjs';
import { evaluateTestRun } from '../evaluate.mjs';
import { filterTranscriptToTestContent, isBoilerplateChromePhrase } from '../privacy.mjs';
import { buildAndroidWebViewApk } from '../webviews/android-webview/build-apk.mjs';
import {
   connectEmulatorConsole,
   delay,
   dismissChromeOnboarding,
   emuDoubleTap,
   emuSwipeRight,
   emuTouchExploreTap,
   ensureAndroidEmulatorSession,
   ignoreError,
   isPackageInstalled,
   openUrlOnAndroid,
   readAndroidDeviceInfo,
   runAdb,
} from './talkback-emulator.mjs';

export { ensureAndroidEmulatorSession };

const STEP_SETTLE_MS = 1600;
const ACT_SETTLE_MS = 2200;
const TOUCH_EXPLORE_SETTLE_MS = 900;
const TALKBACK_ENABLE_SETTLE_MS = 1500;
const DEFAULT_WALK_STEPS = 16;
const INTERACT_SEARCH_LIMIT = 12;
const REPEAT_STOP_COUNT = 2;
const CHROME_TOOLBAR_SKIP_LIMIT = 8;
const TOUCH_EXPLORE_X_RATIO = 0.14;
const TOUCH_EXPLORE_Y_RATIO = 0.16;

const ANDROID_CHROME_EXACT_NOISE = new Set([
   'talkback on',
   'webview',
   'showing items 1 to 1 of 1',
   'no next default',
   'home. button',
]);

const ANDROID_CHROME_SUBSTRINGS = [
   'double-tap and hold to long press',
   'address and search bar',
   'search or type web address',
   'search or type url',
   'switch or close tabs',
   'more options',
   'navigate up',
   'overview',
   'back button',
   'bookmarks',
   'open tab',
   'system webview harness',
   'your connection to this site is not secure',
];

function isAndroidSystemChromePhrase(phrase, isolatedTitle = '') {
   const lowered = String(phrase ?? '')
      .toLowerCase()
      .trim();
   if (!lowered) {
      return true;
   }
   if (
      ANDROID_CHROME_EXACT_NOISE.has(lowered) ||
      lowered.startsWith('no next ') ||
      lowered.endsWith('. webview') ||
      ANDROID_CHROME_SUBSTRINGS.some((fragment) => lowered.includes(fragment))
   ) {
      return true;
   }
   if (isolatedTitle) {
      const titleLower = isolatedTitle.toLowerCase();
      return (
         lowered === `out of grid pager, ${titleLower}` ||
         lowered === `${titleLower}. webview`
      );
   }
   return false;
}

function isStandaloneActivationHintOnly(phrases) {
   return (
      phrases.length > 0 &&
      phrases.every((phrase) => phrase.toLowerCase().trim() === 'double-tap to activate')
   );
}

function isChromeToolbarSpeech(phrases) {
   return phrases.some((phrase) => {
      const lowered = phrase.toLowerCase().trim();
      return (
         lowered.includes('address and search bar') ||
         lowered.includes('search or type web address') ||
         lowered.includes('switch or close tabs') ||
         lowered.includes('more options') ||
         lowered.startsWith('customize chrome') ||
         lowered.startsWith('home. button')
      );
   });
}

async function performTalkBackActionAndListen({
   serial,
   actionFn,
   parseTalkBackSpeech,
   waitMs,
}) {
   await runAdb(serial, ['logcat', '-c']);
   await actionFn();
   await delay(waitMs);
   const log = await runAdb(serial, ['logcat', '-d']);
   return {
      spoken: parseTalkBackSpeech(log),
      sawVerbose: /\sV\s+talkback:/u.test(log),
   };
}

function filterStepPhrases(phrases, isolatedTitle) {
   const filtered = phrases.filter(
      (phrase) =>
         phrase &&
         !isAndroidSystemChromePhrase(phrase, isolatedTitle) &&
         !isBoilerplateChromePhrase(phrase),
   );
   return isStandaloneActivationHintOnly(filtered) ? [] : filtered;
}

function appendFilteredPhrases({ phrases, command, isolatedTitle, entries }) {
   const content = filterStepPhrases(phrases, isolatedTitle);
   if (content.length === 0) {
      return '';
   }
   const combined = content.join(', ');
   entries.push({
      step: entries.length + 1,
      command,
      phrase: combined,
   });
   return combined;
}

function evaluateEmptyWalkStep(state, hitEndOfDoc) {
   if (hitEndOfDoc) {
      return 'stop';
   }
   state.repeats += 1;
   if (state.repeats >= REPEAT_STOP_COUNT && state.entries.length > 0) {
      return 'stop';
   }
   return 'continue';
}

function evaluateWalkSpeechStep({ ctx, state, result }) {
   if (result.sawVerbose) {
      state.sawVerbose = true;
   }
   const hitEndOfDoc = result.spoken.some((phrase) =>
      phrase.toLowerCase().trim().startsWith('no next '),
   );
   const hitChromeToolbar = isChromeToolbarSpeech(result.spoken);
   if (state.entries.length > 0 && (hitEndOfDoc || hitChromeToolbar)) {
      return 'stop';
   }
   if (state.entries.length === 0 && hitChromeToolbar) {
      state.toolbarSkips += 1;
      if (state.toolbarSkips >= CHROME_TOOLBAR_SKIP_LIMIT) {
         return 'stop';
      }
      return 'continue';
   }

   const contentPhrases = filterStepPhrases(result.spoken, ctx.testCase.isolatedTitle);
   if (contentPhrases.length === 0) {
      return evaluateEmptyWalkStep(state, hitEndOfDoc);
   }

   const combined = contentPhrases.join(', ');
   if (combined === state.lastPhrase) {
      state.repeats += 1;
      return state.repeats >= REPEAT_STOP_COUNT ? 'stop' : 'continue';
   }

   state.repeats = 0;
   state.lastPhrase = combined;
   state.entries.push({
      step: state.entries.length + 1,
      command: 'TalkBack swipe-right',
      phrase: combined,
   });
   return 'continue';
}

async function stepWalkTalkBack({ ctx, state, remaining }) {
   if (remaining <= 0) {
      return;
   }
   const result = await performTalkBackActionAndListen({
      serial: ctx.serial,
      actionFn: () => emuSwipeRight(ctx.emu, ctx.screenWidth, ctx.screenHeight),
      parseTalkBackSpeech: ctx.parseTalkBackSpeech,
      waitMs: STEP_SETTLE_MS,
   });
   const decision = evaluateWalkSpeechStep({ ctx, state, result });
   if (decision === 'stop') {
      return;
   }
   await stepWalkTalkBack({ ctx, state, remaining: remaining - 1 });
}

async function findInteractTarget({ ctx, state, targetText, remaining }) {
   if (remaining <= 0) {
      return false;
   }
   const moveResult = await performTalkBackActionAndListen({
      serial: ctx.serial,
      actionFn: () => emuSwipeRight(ctx.emu, ctx.screenWidth, ctx.screenHeight),
      parseTalkBackSpeech: ctx.parseTalkBackSpeech,
      waitMs: STEP_SETTLE_MS,
   });
   if (moveResult.sawVerbose) {
      state.sawVerbose = true;
   }
   if (!isChromeToolbarSpeech(moveResult.spoken)) {
      const stepPhrases = filterStepPhrases(
         moveResult.spoken,
         ctx.testCase.isolatedTitle,
      );
      if (stepPhrases.join(', ').toLowerCase().includes(targetText)) {
         return true;
      }
   }
   return findInteractTarget({ ctx, state, targetText, remaining: remaining - 1 });
}

async function runInteractSequence({ ctx, state, url, fullEntries }) {
   const targetText = ctx.testCase.evaluation.activateButtonText.toLowerCase();
   const reloadUrl = ctx.browser === 'chrome' ? `${url}?r=2` : url;
   await openUrlOnAndroid(ctx.serial, ctx.browser, reloadUrl);
   let onTarget = false;

   if (ctx.browser === 'chrome') {
      const tapResult = await performTalkBackActionAndListen({
         serial: ctx.serial,
         actionFn: () =>
            emuTouchExploreTap(
               ctx.emu,
               Math.round(ctx.screenWidth * TOUCH_EXPLORE_X_RATIO),
               Math.round(ctx.screenHeight * TOUCH_EXPLORE_Y_RATIO),
            ),
         parseTalkBackSpeech: ctx.parseTalkBackSpeech,
         waitMs: TOUCH_EXPLORE_SETTLE_MS,
      });
      if (tapResult.sawVerbose) {
         state.sawVerbose = true;
      }
      const tapPhrases = filterStepPhrases(tapResult.spoken, ctx.testCase.isolatedTitle);
      if (tapPhrases.join(', ').toLowerCase().includes(targetText)) {
         onTarget = true;
      }
   }

   if (!onTarget) {
      onTarget = await findInteractTarget({
         ctx,
         state,
         targetText,
         remaining: INTERACT_SEARCH_LIMIT,
      });
   }

   if (onTarget) {
      const actResult = await performTalkBackActionAndListen({
         serial: ctx.serial,
         actionFn: () => emuDoubleTap(ctx.emu, ctx.screenWidth, ctx.screenHeight),
         parseTalkBackSpeech: ctx.parseTalkBackSpeech,
         waitMs: ACT_SETTLE_MS,
      });
      if (actResult.sawVerbose) {
         state.sawVerbose = true;
      }
      appendFilteredPhrases({
         phrases: actResult.spoken,
         command: 'TalkBack double-tap (activate)',
         isolatedTitle: ctx.testCase.isolatedTitle,
         entries: fullEntries,
      });
   }
}

async function runCaseWithTalkBack(ctx) {
   const url = `${ctx.baseURL}/compatibility/cases/${ctx.testCase.slug}/`;
   await openUrlOnAndroid(ctx.serial, ctx.browser, url);

   const state = {
      entries: [],
      sawVerbose: false,
      lastPhrase: '',
      repeats: 0,
      toolbarSkips: 0,
   };

   if (ctx.browser === 'chrome') {
      const initialTap = await performTalkBackActionAndListen({
         serial: ctx.serial,
         actionFn: () =>
            emuTouchExploreTap(
               ctx.emu,
               Math.round(ctx.screenWidth * TOUCH_EXPLORE_X_RATIO),
               Math.round(ctx.screenHeight * TOUCH_EXPLORE_Y_RATIO),
            ),
         parseTalkBackSpeech: ctx.parseTalkBackSpeech,
         waitMs: TOUCH_EXPLORE_SETTLE_MS,
      });
      if (initialTap.sawVerbose) {
         state.sawVerbose = true;
      }
      state.lastPhrase = appendFilteredPhrases({
         phrases: initialTap.spoken,
         command: 'TalkBack touch-explore',
         isolatedTitle: ctx.testCase.isolatedTitle,
         entries: state.entries,
      });
   }

   await stepWalkTalkBack({
      ctx,
      state,
      remaining: ctx.testCase.evaluation.maxSteps ?? DEFAULT_WALK_STEPS,
   });

   const fullEntries = [...state.entries];
   let postActionStartIndex = 0;
   if (
      ctx.testCase.evaluation.mode === 'interact' &&
      ctx.testCase.evaluation.activateButtonText
   ) {
      postActionStartIndex = fullEntries.length;
      await runInteractSequence({ ctx, state, url, fullEntries });
   }

   if (!state.sawVerbose && fullEntries.length === 0) {
      throw new Error(
         'TalkBack did not log verbose speech to logcat. Ensure TalkBack Developer Settings > Log output level is VERBOSE.',
      );
   }

   const filtered = filterTranscriptToTestContent(fullEntries);
   const evaluation = evaluateTestRun(ctx.testCase, filtered, postActionStartIndex);

   return {
      testSlug: ctx.testCase.slug,
      runAt: new Date().toISOString(),
      driver: `a11ied/android/talkback (adb + ${ctx.browser})`,
      outcome: evaluation.outcome,
      keyAnnouncement: evaluation.keyAnnouncement,
      notes: evaluation.notes,
      assertionSummary: evaluation.assertionSummary,
      assertionResults: evaluation.assertionResults,
      transcript: filtered,
   };
}

async function runTalkBackCasesSequentially({ context, runs, index = 0 }) {
   if (index >= context.testCases.length) {
      return;
   }
   const testCase = context.testCases[index];
   process.stdout.write(`[talkback-${context.browser}] Running ${testCase.slug}...\n`);
   const run = await runCaseWithTalkBack({ ...context, testCase });
   runs.push({
      ...run,
      environmentKey: context.environmentKey,
      environment: context.environment,
   });
   await runTalkBackCasesSequentially({ context, runs, index: index + 1 });
}

async function prepareAndroidBrowserSession({
   serial,
   browser,
   baseURL,
   testCases,
   buildEnvironmentKey,
}) {
   if (browser === 'firefox') {
      const installed = await isPackageInstalled(serial, 'org.mozilla.firefox');
      if (!installed) {
         const info = await readAndroidDeviceInfo(serial, 'firefox');
         return {
            fileSlug: `android-${info.environment.osVersion.split(' ')[0]}-firefox-talkback`,
            environmentKey: buildEnvironmentKey(info.environment),
            environment: info.environment,
            status: 'untested',
            statusNote: 'Not yet tested on Android Firefox.',
            runs: [],
         };
      }
   }

   if (browser === 'chrome') {
      await disableChromeAndPrepare(serial, baseURL, testCases[0].slug);
   } else if (browser === 'webview') {
      const apkPath = buildAndroidWebViewApk();
      await runAdb(serial, ['install', '-r', apkPath]).catch(async () => {
         await runAdb(serial, ['uninstall', 'dev.a11ied.srwebview']).catch(ignoreError);
         await runAdb(serial, ['install', apkPath]);
      });
   }
}

async function disableChromeAndPrepare(serial, baseURL, firstSlug) {
   const { disableTalkBack } = await import(resolveA11iedPaths().coreEntry);
   await disableTalkBack({ serial }).catch(ignoreError);
   await dismissChromeOnboarding(serial, `${baseURL}/compatibility/cases/${firstSlug}/`);
}

export async function runAndroidTalkBackTarget({
   browser = 'chrome',
   testCases,
   baseURL,
   buildEnvironmentKey,
   emulatorSession,
}) {
   const paths = resolveA11iedPaths();
   const { enableTalkBack, disableTalkBack, parseTalkBackSpeech } = await import(
      paths.coreEntry
   );

   const ownSession = !emulatorSession;
   const session = emulatorSession ?? (await ensureAndroidEmulatorSession());
   const { serial } = session;

   try {
      const previewURL = new URL(baseURL);
      const port = previewURL.port || '4322';
      await runAdb(serial, ['reverse', `tcp:${port}`, `tcp:${port}`]);

      const earlyReturn = await prepareAndroidBrowserSession({
         serial,
         browser,
         baseURL,
         testCases,
         buildEnvironmentKey,
      });
      if (earlyReturn) {
         return earlyReturn;
      }

      const deviceInfo = await readAndroidDeviceInfo(serial, browser);
      const environmentKey = buildEnvironmentKey(deviceInfo.environment);
      const runs = [];

      await enableTalkBack({ serial });
      await delay(TALKBACK_ENABLE_SETTLE_MS);
      const emu = await connectEmulatorConsole(serial);
      try {
         await runTalkBackCasesSequentially({
            context: {
               serial,
               emu,
               browser,
               testCases,
               baseURL,
               screenWidth: deviceInfo.screenWidth,
               screenHeight: deviceInfo.screenHeight,
               parseTalkBackSpeech,
               environmentKey,
               environment: deviceInfo.environment,
            },
            runs,
         });
      } finally {
         emu.close();
         await disableTalkBack({ serial }).catch(ignoreError);
      }

      const osSlug = deviceInfo.environment.osVersion
         .split(' ')[0]
         .replaceAll(/[^a-zA-Z0-9._-]+/gu, '-');
      return {
         fileSlug: `android-${osSlug}-${browser}-talkback`,
         environmentKey,
         environment: deviceInfo.environment,
         status: 'tested',
         runs,
      };
   } finally {
      if (ownSession) {
         await session.close();
      }
   }
}

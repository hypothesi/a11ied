import { execFileSync } from 'node:child_process';
import { resolveA11iedPaths } from '../a11ied-resolve.mjs';
import { evaluateTestRun } from '../evaluate.mjs';
import { filterTranscriptToTestContent, isBoilerplateChromePhrase } from '../privacy.mjs';
import {
   createBrowserSession,
   delay,
   ignoreError,
   readMacOSInfo,
} from './voiceover-browsers.mjs';

const STABLE_POLL_MS = 100;
const STABLE_THRESHOLD_MS = 220;
const STABLE_TIMEOUT_MS = 1600;
const MAX_FIND_WEB_AREA_STEPS = 16;
const REPEAT_LIMIT = 3;
const STEP_SETTLE_MS = 200;
const INITIAL_DESCRIBE_SETTLE_MS = 250;
const SAFARI_EXIT_STEPS = 3;
const REVERSE_WINDOW_STEPS = 6;
const INTERACT_SEARCH_LIMIT = 20;
const POST_ACT_LISTEN_MS = 1500;
const POLL_LIVE_PHRASE_MS = 100;
const OSASCRIPT_POLL_TIMEOUT_MS = 1500;
const DEFAULT_WALK_STEPS = 16;
const USAGE_PRIORITY = {
   chrome: 1,
   safari: 2,
   firefox: 3,
   wkwebview: 4,
};
const USAGE_FALLBACK = 99;

const SHORT_LABELS = {
   chrome: 'macOS VO (Chrome)',
   safari: 'macOS VO (Safari)',
   firefox: 'macOS VO (Firefox)',
   wkwebview: 'macOS VO (WebView)',
};

async function pollSpeechUntilStable({ voiceOver, startedAt, lastPhrase, stableSince }) {
   if (Date.now() - startedAt >= STABLE_TIMEOUT_MS) {
      return lastPhrase;
   }
   const phrase = (await voiceOver.lastSpokenPhrase().catch(() => '')) ?? '';
   const now = Date.now();
   if (phrase !== '' && phrase === lastPhrase) {
      if (now - stableSince >= STABLE_THRESHOLD_MS) {
         return phrase;
      }
      await delay(STABLE_POLL_MS);
      return pollSpeechUntilStable({ voiceOver, startedAt, lastPhrase, stableSince });
   }
   await delay(STABLE_POLL_MS);
   return pollSpeechUntilStable({
      voiceOver,
      startedAt,
      lastPhrase: phrase,
      stableSince: now,
   });
}

function waitForSpeechStable(voiceOver) {
   const now = Date.now();
   return pollSpeechUntilStable({
      voiceOver,
      startedAt: now,
      lastPhrase: '',
      stableSince: now,
   });
}

function isWebAreaAnnouncement(phrase) {
   const lowered = String(phrase ?? '').toLowerCase();
   return lowered.includes('web content') || lowered.includes('html content');
}

function isInteractableContainer(phrase) {
   const lowered = String(phrase ?? '').toLowerCase();
   return (
      lowered.endsWith('group') ||
      lowered.includes(', group') ||
      lowered.includes('scroll area') ||
      lowered.includes('splitter')
   );
}

function isOutsideWebAreaChrome(phrase) {
   const lowered = String(phrase ?? '').toLowerCase();
   return (
      lowered.includes('leaving web content') ||
      lowered.includes('leaving html content') ||
      lowered.includes('address and search bar') ||
      lowered.includes('smart search field') ||
      lowered.includes('wants to use the') ||
      lowered.includes('keychain') ||
      lowered.includes('toolbar') ||
      lowered.includes('tab bar') ||
      lowered.includes('reload') ||
      lowered.includes('close, button') ||
      lowered.includes('zoom, button') ||
      lowered.includes('minimize, button')
   );
}

async function enterWebArea(voiceOver) {
   await voiceOver.interact();
   await waitForSpeechStable(voiceOver);
}

async function stepOutUntilWebArea(voiceOver, remainingSteps) {
   if (remainingSteps <= 0) {
      return { entered: false, current: '' };
   }
   await voiceOver.stopInteracting().catch(ignoreError);
   const afterStop = await waitForSpeechStable(voiceOver);
   if (isWebAreaAnnouncement(afterStop)) {
      await enterWebArea(voiceOver);
      return { entered: true, current: afterStop };
   }
   if (afterStop === '' || isOutsideWebAreaChrome(afterStop)) {
      return { entered: false, current: afterStop };
   }
   return stepOutUntilWebArea(voiceOver, remainingSteps - 1);
}

async function prepareSafariCursor(voiceOver, initialPhrase) {
   if (initialPhrase !== '' && !isOutsideWebAreaChrome(initialPhrase)) {
      const exited = await stepOutUntilWebArea(voiceOver, SAFARI_EXIT_STEPS);
      if (exited.entered) {
         return { entered: true, current: exited.current };
      }
   }

   await voiceOver
      .perform(voiceOver.commanderCommands.GO_TO_BOTTOM_OF_WINDOW)
      .catch(ignoreError);
   await delay(STEP_SETTLE_MS);
   const atBottom = await waitForSpeechStable(voiceOver);
   if (isWebAreaAnnouncement(atBottom)) {
      await enterWebArea(voiceOver);
      return { entered: true, current: atBottom };
   }
   return stepOutUntilWebArea(voiceOver, SAFARI_EXIT_STEPS);
}

async function searchBackwardForWebArea(voiceOver, current, remainingSteps) {
   if (remainingSteps <= 0) {
      return { entered: false, current };
   }
   if (isWebAreaAnnouncement(current)) {
      await enterWebArea(voiceOver);
      return { entered: true, current };
   }
   if (isInteractableContainer(current)) {
      await voiceOver.interact();
      const inner = await waitForSpeechStable(voiceOver);
      if (isWebAreaAnnouncement(inner)) {
         await enterWebArea(voiceOver);
         return { entered: true, current: inner };
      }
      return searchBackwardForWebArea(voiceOver, inner, remainingSteps - 1);
   }
   await voiceOver.previous();
   const nextPhrase = await waitForSpeechStable(voiceOver);
   return searchBackwardForWebArea(voiceOver, nextPhrase, remainingSteps - 1);
}

async function searchForwardForWebArea(voiceOver, current, remainingSteps) {
   if (remainingSteps <= 0) {
      return;
   }
   if (isWebAreaAnnouncement(current)) {
      await enterWebArea(voiceOver);
      return;
   }
   if (isInteractableContainer(current)) {
      await voiceOver.interact();
      const inner = await waitForSpeechStable(voiceOver);
      if (isWebAreaAnnouncement(inner)) {
         await enterWebArea(voiceOver);
         return;
      }
      await searchForwardForWebArea(voiceOver, inner, remainingSteps - 1);
      return;
   }
   await voiceOver.next();
   const nextPhrase = await waitForSpeechStable(voiceOver);
   await searchForwardForWebArea(voiceOver, nextPhrase, remainingSteps - 1);
}

async function moveCursorIntoWebArea(voiceOver, { browser }) {
   await delay(INITIAL_DESCRIBE_SETTLE_MS);
   await voiceOver
      .perform(voiceOver.commanderCommands.DESCRIBE_ITEM_IN_VOICEOVER_CURSOR)
      .catch(ignoreError);
   let current = await waitForSpeechStable(voiceOver);

   if (isWebAreaAnnouncement(current)) {
      await enterWebArea(voiceOver);
      return;
   }

   if (browser === 'safari') {
      const safariResult = await prepareSafariCursor(voiceOver, current);
      if (safariResult.entered) {
         return;
      }
      current = safariResult.current;
   }

   if (browser === 'wkwebview') {
      await voiceOver
         .perform(voiceOver.commanderCommands.GO_TO_TOP_OF_WINDOW)
         .catch(ignoreError);
      await delay(STEP_SETTLE_MS);
      current = await waitForSpeechStable(voiceOver);
   } else if (browser === 'firefox' || browser === 'safari') {
      await voiceOver
         .perform(voiceOver.commanderCommands.GO_TO_BOTTOM_OF_WINDOW)
         .catch(ignoreError);
      await delay(STEP_SETTLE_MS);
      current = await waitForSpeechStable(voiceOver);
      const backResult = await searchBackwardForWebArea(
         voiceOver,
         current,
         REVERSE_WINDOW_STEPS,
      );
      if (backResult.entered) {
         return;
      }
      current = backResult.current;
   }

   await searchForwardForWebArea(voiceOver, current, MAX_FIND_WEB_AREA_STEPS);
}

async function stepWalkWebArea({
   voiceOver,
   remainingSteps,
   entries,
   lastSeen,
   repeats,
}) {
   if (remainingSteps <= 0) {
      return;
   }
   await voiceOver.next();
   const phrase = await waitForSpeechStable(voiceOver);
   const itemText = (await voiceOver.itemText().catch(() => '')) ?? '';

   if (phrase === '' || isOutsideWebAreaChrome(phrase)) {
      return;
   }
   if (phrase === lastSeen) {
      if (repeats + 1 >= REPEAT_LIMIT - 1) {
         return;
      }
      await stepWalkWebArea({
         voiceOver,
         remainingSteps: remainingSteps - 1,
         entries,
         lastSeen,
         repeats: repeats + 1,
      });
      return;
   }

   if (!isWebAreaAnnouncement(phrase) && !isBoilerplateChromePhrase(phrase)) {
      entries.push({
         step: entries.length + 1,
         command: 'VO-Right Arrow',
         phrase,
         ...(itemText && itemText !== phrase ? { itemText } : {}),
      });
   }

   await stepWalkWebArea({
      voiceOver,
      remainingSteps: remainingSteps - 1,
      entries,
      lastSeen: phrase,
      repeats: 0,
   });
}

async function walkWebArea(voiceOver, maxSteps) {
   await voiceOver.perform(voiceOver.keyboardCommands.moveToAreaTop).catch(ignoreError);
   await delay(STEP_SETTLE_MS);
   await voiceOver
      .perform(voiceOver.commanderCommands.DESCRIBE_ITEM_IN_VOICEOVER_CURSOR)
      .catch(ignoreError);
   const initialPhrase = await waitForSpeechStable(voiceOver);
   const initialItem = (await voiceOver.itemText().catch(() => '')) ?? '';
   await voiceOver.clearSpokenPhraseLog();
   await voiceOver.clearItemTextLog();

   const entries = [];
   if (
      initialPhrase &&
      !isWebAreaAnnouncement(initialPhrase) &&
      !isOutsideWebAreaChrome(initialPhrase) &&
      !isBoilerplateChromePhrase(initialPhrase)
   ) {
      entries.push({
         step: 1,
         command: 'VO-AreaTop',
         phrase: initialPhrase,
         ...(initialItem && initialItem !== initialPhrase
            ? { itemText: initialItem }
            : {}),
      });
   }

   await stepWalkWebArea({
      voiceOver,
      remainingSteps: maxSteps,
      entries,
      lastSeen: initialPhrase,
      repeats: 0,
   });

   return entries;
}

function readVoiceOverLastPhrase() {
   try {
      return execFileSync(
         'osascript',
         ['-e', 'tell application "VoiceOver" to return content of last phrase'],
         { encoding: 'utf8', timeout: OSASCRIPT_POLL_TIMEOUT_MS },
      ).trim();
   } catch {
      return '';
   }
}

async function findInteractTarget({
   voiceOver,
   targetTerm,
   currentPhrase,
   remainingSteps,
}) {
   if (currentPhrase.toLowerCase().includes(targetTerm)) {
      return { found: true, phrase: currentPhrase };
   }
   if (remainingSteps <= 0) {
      return { found: false, phrase: currentPhrase };
   }
   await voiceOver.next();
   const nextPhrase = await waitForSpeechStable(voiceOver);
   if (isOutsideWebAreaChrome(nextPhrase)) {
      return { found: false, phrase: nextPhrase };
   }
   return findInteractTarget({
      voiceOver,
      targetTerm,
      currentPhrase: nextPhrase,
      remainingSteps: remainingSteps - 1,
   });
}

async function pollLivePhrasesUntilStopped(state, polledPhrases) {
   if (state.stopPolling) {
      return;
   }
   const livePhrase = readVoiceOverLastPhrase();
   if (livePhrase && livePhrase !== polledPhrases.at(-1)) {
      polledPhrases.push(livePhrase);
   }
   await delay(POLL_LIVE_PHRASE_MS);
   await pollLivePhrasesUntilStopped(state, polledPhrases);
}

function buildPostInteractEntries({
   guidepupLog,
   polledPhrases,
   preButtonNormalized,
   walkCount,
}) {
   const seen = new Set();
   const postEntries = [];

   for (const rawPhrase of [...guidepupLog, ...polledPhrases]) {
      const phrase = String(rawPhrase ?? '').trim();
      const lowered = phrase.toLowerCase();
      const isDuplicateOrChrome =
         !phrase ||
         seen.has(lowered) ||
         lowered.startsWith('you are currently on ') ||
         isOutsideWebAreaChrome(phrase) ||
         isBoilerplateChromePhrase(phrase) ||
         (preButtonNormalized !== '' && lowered === preButtonNormalized);

      if (isDuplicateOrChrome) {
         continue;
      }
      seen.add(lowered);
      postEntries.push({
         step: walkCount + postEntries.length + 1,
         command: 'VO-Space (act)',
         phrase,
      });
   }
   return postEntries;
}

async function runInteractSequence(voiceOver, activateButtonText, walkEntries) {
   const targetTerm = activateButtonText.toLowerCase();
   await voiceOver.perform(voiceOver.keyboardCommands.moveToAreaTop).catch(ignoreError);
   await delay(STEP_SETTLE_MS);
   await voiceOver
      .perform(voiceOver.keyboardCommands.describeItemInVoiceOverCursor)
      .catch(ignoreError);
   await waitForSpeechStable(voiceOver).catch(() => '');

   const initialPhrase = (await voiceOver.lastSpokenPhrase().catch(() => '')) ?? '';
   const target = await findInteractTarget({
      voiceOver,
      targetTerm,
      currentPhrase: initialPhrase,
      remainingSteps: INTERACT_SEARCH_LIMIT,
   });
   if (!target.found) {
      return [];
   }

   await voiceOver.clearSpokenPhraseLog();
   await voiceOver.clearItemTextLog();

   const polledPhrases = [];
   const pollState = { stopPolling: false };
   const livePoller = pollLivePhrasesUntilStopped(pollState, polledPhrases);

   await voiceOver.act();
   await delay(POST_ACT_LISTEN_MS);
   pollState.stopPolling = true;
   await livePoller;
   await waitForSpeechStable(voiceOver).catch(() => '');

   const guidepupLog = await voiceOver.spokenPhraseLog();
   return buildPostInteractEntries({
      guidepupLog,
      polledPhrases,
      preButtonNormalized: target.phrase.toLowerCase().trim(),
      walkCount: walkEntries.length,
   });
}

async function runVoiceOverCasesSequentially({ context, runs, index = 0 }) {
   if (index >= context.testCases.length) {
      return;
   }
   const testCase = context.testCases[index];
   const url = `${context.baseURL}/compatibility/cases/${testCase.slug}/`;
   process.stdout.write(`[voiceover-${context.browser}] Running ${testCase.slug}...\n`);
   await context.browserSession.openCase(url, testCase.isolatedTitle);
   await moveCursorIntoWebArea(context.voiceOver, { browser: context.browser });
   const walkEntries = await walkWebArea(
      context.voiceOver,
      testCase.evaluation.maxSteps ?? DEFAULT_WALK_STEPS,
   );

   let fullEntries = walkEntries;
   let postActionStartIndex = 0;

   if (
      testCase.evaluation.mode === 'interact' &&
      testCase.evaluation.activateButtonText
   ) {
      postActionStartIndex = walkEntries.length;
      const postEntries = await runInteractSequence(
         context.voiceOver,
         testCase.evaluation.activateButtonText,
         walkEntries,
      );
      fullEntries = [...walkEntries, ...postEntries];
   }

   const filtered = filterTranscriptToTestContent(fullEntries);
   const evaluation = evaluateTestRun(testCase, filtered, postActionStartIndex);

   runs.push({
      testSlug: testCase.slug,
      environmentKey: context.environmentKey,
      environment: context.environment,
      runAt: new Date().toISOString(),
      driver: `a11ied/@guidepup/guidepup (voiceover, ${context.browserSession.browserName})`,
      outcome: evaluation.outcome,
      keyAnnouncement: evaluation.keyAnnouncement,
      notes: evaluation.notes,
      assertionSummary: evaluation.assertionSummary,
      assertionResults: evaluation.assertionResults,
      transcript: filtered,
   });

   await runVoiceOverCasesSequentially({ context, runs, index: index + 1 });
}

export async function runMacOSVoiceOverTarget({
   browser,
   testCases,
   baseURL,
   buildEnvironmentKey,
}) {
   const paths = resolveA11iedPaths();
   const { voiceOver } = await import(paths.guidepupEntry);
   const macInfo = readMacOSInfo();
   const browserSession = await createBrowserSession(browser, paths.playwrightEntry);

   const environment = {
      id: `macos-voiceover-${browser}`,
      label: `macOS ${macInfo.osVersion.split(' ')[0]} · ${browserSession.browserName} ${browserSession.browserVersion} · VoiceOver`,
      shortLabel: SHORT_LABELS[browser] ?? `macOS VO (${browser})`,
      platformGroup: 'macos-voiceover',
      device: macInfo.device,
      os: 'macOS',
      osVersion: macInfo.osVersion,
      browser: browserSession.browserName,
      browserVersion: browserSession.browserVersion,
      browserType: browserSession.browserType,
      usageOrder: USAGE_PRIORITY[browser] ?? USAGE_FALLBACK,
      screenReader: 'VoiceOver',
      screenReaderVersion: String(voiceOver.version),
   };
   const environmentKey = buildEnvironmentKey(environment);

   const runs = [];
   try {
      await voiceOver.start();
      await runVoiceOverCasesSequentially({
         context: {
            browser,
            testCases,
            baseURL,
            browserSession,
            voiceOver,
            environmentKey,
            environment,
         },
         runs,
      });
   } finally {
      await voiceOver.stop().catch(ignoreError);
      await browserSession.close().catch(ignoreError);
   }

   const versionSlug = browserSession.browserVersion.replaceAll(
      /[^a-zA-Z0-9._-]+/gu,
      '-',
   );
   const osSlug = macInfo.osVersion.split(' ')[0];
   return {
      fileSlug: `macos-${osSlug}-${browser}-${versionSlug}-voiceover`,
      environmentKey,
      environment,
      runs,
   };
}

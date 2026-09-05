import type { DriverNavigateRequest, Platform } from '@a11ied/contracts';

import type { DriverActionOptions } from './adapter-shared.js';
import { normalizeDriverKeys } from './key-aliases.js';
import {
   getNvdaKeyCodeCommand,
   getVoiceOverKeyCodeCommand,
} from './portable-commands.js';
import {
   resolveNvdaNavigationStep,
   resolveVoiceOverNavigationStep,
} from './portable-navigation.js';
import type {
   MethodStep,
   NvdaPortableStep,
   PressStep,
   RepeatUntilPhraseStep,
   VoiceOverPortableStep,
} from './portable-steps.js';
import type { ScreenReaderLike } from './readiness.js';
import { repeatTimes, repeatUntil, runInOrder } from './sequential.js';
import { waitForSpeechStabilization } from './speech.js';

export const REAL_TARGET_NAV_TIMEOUT_MS = 10_000;
export const REAL_TARGET_INPUT_TIMEOUT_MS = 15_000;
const REAL_TARGET_RETRIES = 2;
/** How many headings a VoiceOver level filter visits before giving up. */
const HEADING_LEVEL_SEARCH_CAP = 100;

export type RealTarget = Extract<Platform, 'voiceover' | 'nvda'>;

export interface RealStepContext {
   reader: ScreenReaderLike;
   target: RealTarget;
   options?: DriverActionOptions | undefined;
}

export function buildCommandOptions(
   defaultTimeoutMs: number,
   options?: DriverActionOptions,
): { timeout: number; retries: number } {
   return {
      timeout: options?.timeoutMs ?? defaultTimeoutMs,
      retries: REAL_TARGET_RETRIES,
   };
}

/** Presses each chord in order through the reader, expanding a11ied key aliases first. */
export async function pressRealKeys(
   context: RealStepContext,
   keys: readonly string[],
): Promise<void> {
   const inputOptions = buildCommandOptions(
      REAL_TARGET_INPUT_TIMEOUT_MS,
      context.options,
   );
   await runInOrder(keys, (chord) =>
      context.reader.press(normalizeDriverKeys(chord, context.target), inputOptions),
   );
}

async function runMethodStep(context: RealStepContext, step: MethodStep): Promise<void> {
   const navOptions = buildCommandOptions(REAL_TARGET_NAV_TIMEOUT_MS, context.options);
   const methods: Record<MethodStep['method'], () => Promise<void>> = {
      next: () => context.reader.next(navOptions),
      previous: () => context.reader.previous(navOptions),
      interact: () => context.reader.interact(navOptions),
      stopInteracting: () => context.reader.stopInteracting(navOptions),
      act: () => context.reader.act(navOptions),
      nextHeading: () => context.reader.nextHeading(navOptions),
      previousHeading: () => context.reader.previousHeading(navOptions),
      nextLink: () => context.reader.nextLink(navOptions),
      previousLink: () => context.reader.previousLink(navOptions),
      nextLandmark: () => context.reader.nextLandmark(navOptions),
      previousLandmark: () => context.reader.previousLandmark(navOptions),
   };
   await methods[step.method]();
}

async function runSharedStep(
   context: RealStepContext,
   step: MethodStep | PressStep,
): Promise<void> {
   if (step.kind === 'press') {
      await pressRealKeys(context, [step.keys]);
      return;
   }
   await runMethodStep(context, step);
}

/**
 * Runs one VoiceOver step: a Guidepup method, a key chord, a key code, or a Commander
 * phrase.
 */
export async function runVoiceOverStep(
   context: RealStepContext,
   step: VoiceOverPortableStep,
): Promise<void> {
   const inputOptions = buildCommandOptions(
      REAL_TARGET_INPUT_TIMEOUT_MS,
      context.options,
   );
   if (step.kind === 'keycode') {
      await context.reader.perform(getVoiceOverKeyCodeCommand(step), inputOptions);
      return;
   }
   if (step.kind === 'commander') {
      await context.reader.perform(step.command, inputOptions);
      return;
   }
   await runSharedStep(context, step);
}

/** Runs one NVDA step: a Guidepup method, a key chord, or a key code. */
export async function runNvdaStep(
   context: RealStepContext,
   step: NvdaPortableStep,
): Promise<void> {
   if (step.kind === 'keycode') {
      await context.reader.perform(
         getNvdaKeyCodeCommand(step),
         buildCommandOptions(REAL_TARGET_INPUT_TIMEOUT_MS, context.options),
      );
      return;
   }
   await runSharedStep(context, step);
}

async function runVoiceOverRepeatUntil(
   context: RealStepContext,
   step: RepeatUntilPhraseStep<VoiceOverPortableStep>,
): Promise<void> {
   let previousPhrase = await context.reader.lastSpokenPhrase().catch(() => '');
   let stalled = false;
   await repeatUntil(
      async () => {
         const phrase = await context.reader.lastSpokenPhrase().catch(() => '');
         return stalled || phrase.includes(step.phraseIncludes);
      },
      async () => {
         await runVoiceOverStep(context, step.step);
         await waitForSpeechStabilization(context.reader);
         const phrase = await context.reader.lastSpokenPhrase().catch(() => '');
         // The same phrase twice in a row means the reader had nowhere left to jump.
         stalled = phrase === previousPhrase;
         previousPhrase = phrase;
      },
      HEADING_LEVEL_SEARCH_CAP,
   );
}

async function runOneRealMove(
   context: RealStepContext,
   request: DriverNavigateRequest,
): Promise<void> {
   if (context.target === 'nvda') {
      await runNvdaStep(context, resolveNvdaNavigationStep(request));
      return;
   }
   const step = resolveVoiceOverNavigationStep(request);
   if (step.kind === 'repeat-until') {
      await runVoiceOverRepeatUntil(context, step);
      return;
   }
   await runVoiceOverStep(context, step);
}

/** Runs one `sr next <kind>` request on VoiceOver or NVDA, `times` times. */
export async function runRealNavigation(
   context: RealStepContext,
   request: DriverNavigateRequest,
): Promise<void> {
   const times = request.times ?? 1;
   await repeatTimes(times, async () => {
      await runOneRealMove(context, request);
      if (times > 1) {
         await waitForSpeechStabilization(context.reader);
      }
   });
}

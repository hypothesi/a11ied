import { nvda, voiceOver } from '@guidepup/guidepup';
import type {
   DriverCheckpoint,
   DriverFocusResult,
   DriverFocusTarget,
   DriverReadiness,
   DriverStateSnapshot,
   Platform,
} from '@a11ied/contracts';

import { focusMacTarget, focusWindowsTarget } from './focus.js';
import {
   checkDetectedReadiness,
   createReadinessError,
   createUnsupportedReadiness,
   getExpectedPlatform,
   type ScreenReaderLike,
} from './readiness.js';
import {
   buildStateSnapshot,
   driverCapabilities,
   type DriverAdapter,
} from './adapter-shared.js';
import { normalizeDriverKeys } from './key-aliases.js';
import { createVirtualAdapter } from './virtual-adapter.js';

const SPEECH_POLL_INTERVAL_MS = 150;
const SPEECH_STABLE_THRESHOLD_MS = 300;
const SPEECH_STABILIZATION_TIMEOUT_MS = 5000;

const REAL_TARGET_NAV_TIMEOUT_MS = 10_000;
const REAL_TARGET_INPUT_TIMEOUT_MS = 15_000;
const REAL_TARGET_RETRIES = 2;

const navCommandOptions = {
   timeout: REAL_TARGET_NAV_TIMEOUT_MS,
   retries: REAL_TARGET_RETRIES,
};

const inputCommandOptions = {
   timeout: REAL_TARGET_INPUT_TIMEOUT_MS,
   retries: REAL_TARGET_RETRIES,
};

function delay(ms: number): Promise<void> {
   return new Promise((resolve) => {
      setTimeout(resolve, ms);
   });
}

interface SpeechPollState {
   startedAt: number;
   lastPhrase: string;
   stableSince: number;
}

function updateSpeechState(
   state: SpeechPollState,
   phrase: string,
   now: number,
): { next: SpeechPollState; isStable: boolean } {
   if (phrase !== '' && phrase === state.lastPhrase) {
      return {
         next: {
            startedAt: state.startedAt,
            lastPhrase: state.lastPhrase,
            stableSince: state.stableSince,
         },
         isStable: true,
      };
   }

   return {
      next: {
         startedAt: state.startedAt,
         lastPhrase: phrase,
         stableSince: now,
      },
      isStable: false,
   };
}

function shouldStopPolling(
   state: SpeechPollState,
   now: number,
   isStable: boolean,
): boolean {
   if (isStable && now - state.stableSince >= SPEECH_STABLE_THRESHOLD_MS) {
      return true;
   }
   return now - state.startedAt >= SPEECH_STABILIZATION_TIMEOUT_MS;
}

async function waitForSpeechStabilization(reader: ScreenReaderLike): Promise<void> {
   const startedAt = Date.now();
   const initialState = {
      startedAt,
      lastPhrase: '',
      stableSince: startedAt,
   };

   async function poll(state: SpeechPollState): Promise<void> {
      const phrase = await reader.lastSpokenPhrase().catch(() => '');
      const now = Date.now();
      const { next, isStable } = updateSpeechState(state, phrase, now);
      if (shouldStopPolling(next, now, isStable)) {
         return;
      }
      await delay(SPEECH_POLL_INTERVAL_MS);
      return poll(next);
   }

   await poll(initialState);
}

class RealScreenReaderAdapter implements DriverAdapter {
   readonly capabilities = driverCapabilities;
   readonly target: Extract<Platform, 'voiceover' | 'nvda'>;
   private readonly reader: ScreenReaderLike;

   constructor(
      target: Extract<Platform, 'voiceover' | 'nvda'>,
      reader: ScreenReaderLike,
   ) {
      this.target = target;
      this.reader = reader;
   }

   async checkReadiness(): Promise<DriverReadiness> {
      const expectedPlatform = getExpectedPlatform(this.target);
      if (process.platform !== expectedPlatform) {
         return createUnsupportedReadiness(this.target, expectedPlatform);
      }

      try {
         return await checkDetectedReadiness(this.target, this.reader);
      } catch (error) {
         return createReadinessError(this.target, error);
      }
   }

   async start(): Promise<void> {
      await this.reader.start({ timeout: REAL_TARGET_INPUT_TIMEOUT_MS });
   }

   async stop(): Promise<void> {
      await this.reader.stop({ timeout: REAL_TARGET_INPUT_TIMEOUT_MS });
   }

   async attachDocument(): Promise<void> {
      // Real screen readers use the live host environment, no document attachment needed.
      // Verify the adapter is configured before proceeding.
      if (this.reader === undefined) {
         throw new Error('Reader is not initialized');
      }
   }

   async focus(target: DriverFocusTarget): Promise<DriverFocusResult> {
      if (this.target === 'voiceover') {
         return focusMacTarget(target);
      }
      return focusWindowsTarget(target);
   }

   async next(): Promise<void> {
      await this.reader.next(navCommandOptions);
   }

   async previous(): Promise<void> {
      await this.reader.previous(navCommandOptions);
   }

   async press(keys: string): Promise<void> {
      await this.reader.press(
         normalizeDriverKeys(keys, this.target),
         inputCommandOptions,
      );
   }

   async type(text: string): Promise<void> {
      await this.reader.type(text, inputCommandOptions);
   }

   async interact(): Promise<void> {
      await this.reader.interact(navCommandOptions);
   }

   async stopInteracting(): Promise<void> {
      await this.reader.stopInteracting(navCommandOptions);
   }

   async activateCurrentItem(): Promise<void> {
      await this.reader.act(navCommandOptions);
   }

   async readState(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot> {
      return buildStateSnapshot(this.reader, checkpoints);
   }

   async clearLogs(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot> {
      await Promise.all([
         this.reader.clearSpokenPhraseLog(),
         this.reader.clearItemTextLog(),
      ]);
      return buildStateSnapshot(this.reader, checkpoints);
   }

   async waitForSpeechStabilization(): Promise<void> {
      await waitForSpeechStabilization(this.reader);
   }
}

/** Creates the adapter for one supported driver target. */
export function createDriverAdapter(target: Platform): DriverAdapter {
   if (target === 'virtual') {
      return createVirtualAdapter();
   }
   if (target === 'voiceover') {
      return new RealScreenReaderAdapter('voiceover', voiceOver);
   }
   return new RealScreenReaderAdapter('nvda', nvda);
}

import type { ScreenReaderLike } from './readiness.js';
import { delay } from './sequential.js';

const SPEECH_POLL_INTERVAL_MS = 150;
const SPEECH_STABLE_THRESHOLD_MS = 300;

/** How long speech stabilization waits before giving up on a quiet reader. */
export const SPEECH_STABILIZATION_TIMEOUT_MS = 5000;

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
      return { next: state, isStable: true };
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

async function poll(reader: ScreenReaderLike, state: SpeechPollState): Promise<void> {
   const phrase = await reader.lastSpokenPhrase().catch(() => '');
   const now = Date.now();
   const { next, isStable } = updateSpeechState(state, phrase, now);
   if (shouldStopPolling(next, now, isStable)) {
      return;
   }
   await delay(SPEECH_POLL_INTERVAL_MS);
   return poll(reader, next);
}

/** Polls the reader until the last spoken phrase stops changing or the timeout passes. */
export async function waitForSpeechStabilization(
   reader: ScreenReaderLike,
): Promise<void> {
   const startedAt = Date.now();
   await poll(reader, { startedAt, lastPhrase: '', stableSince: startedAt });
}

import { DEFAULT_WAIT_PAUSE_MS, type DriverWaitPayload } from '@a11ied/contracts';

import type { ActionContext, ActionExecutionResult } from './broker-types.js';
import { getContextStopSignal, withContextCommand } from './context-queue.js';
import { selectTranscriptEntries } from './transcript-recorder.js';
import {
   describeMatcher,
   matchesText,
   parseTextMatcher,
   type TextMatcher,
} from './matcher.js';

const WAIT_POLL_INTERVAL_MS = 150;

interface WaitPoll {
   context: ActionContext;
   matcher: TextMatcher;
   /** Transcript entries before this index were spoken before the wait began. */
   startIndex: number;
   startedAt: number;
   timeoutMs: number;
}

async function pauseUntilPoll(context: ActionContext, ms: number): Promise<void> {
   const signal = getContextStopSignal(context);
   signal.throwIfAborted();
   let abort: (() => void) | undefined = undefined;
   await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      abort = (): void => {
         clearTimeout(timer);
         reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
   }).finally(() => {
      if (abort) {
         signal.removeEventListener('abort', abort);
      }
   });
}

/** Pulls any new phrases into the transcript, then looks for a match since the wait began. */
async function findNewMatch(poll: WaitPoll): Promise<number | undefined> {
   await withContextCommand(poll.context, async () => {
      const state = await poll.context.adapter.readState(poll.context.checkpoints);
      poll.context.transcript.capture(state);
   });
   const match = poll.context.transcript.entries
      .slice(poll.startIndex)
      .find(
         (entry) =>
            entry.checkpoint === undefined && matchesText(poll.matcher, entry.phrase),
      );
   return match?.index;
}

async function pollUntilMatch(poll: WaitPoll): Promise<ActionExecutionResult> {
   const matchIndex = await findNewMatch(poll);
   const waitedMs = Date.now() - poll.startedAt;
   if (matchIndex !== undefined) {
      const entry = poll.context.transcript.entries[matchIndex];
      return {
         details: {
            for: describeMatcher(poll.matcher),
            matched: true,
            phrase: entry?.phrase,
            waitedMs,
         },
      };
   }
   if (waitedMs >= poll.timeoutMs) {
      return {
         details: {
            for: describeMatcher(poll.matcher),
            matched: false,
            waitedMs,
            timedOut: true,
         },
      };
   }
   await pauseUntilPoll(poll.context, WAIT_POLL_INTERVAL_MS);
   return pollUntilMatch(poll);
}

/**
 * Pauses, or polls the transcript until a phrase spoken after the wait began matches.
 * Polling the transcript rather than the last phrase means an announcement that arrives
 * and is replaced by another before the next poll is still seen.
 */
export async function runWaitAction(
   context: ActionContext,
   payload: DriverWaitPayload,
): Promise<ActionExecutionResult> {
   const startedAt = Date.now();
   const startIndex = await withContextCommand(context, async () => {
      const state = await context.adapter.readState(context.checkpoints);
      context.transcript.capture(state);
      if (payload.since !== undefined) {
         const selected = selectTranscriptEntries(context.transcript.entries, {
            since: payload.since,
         });

         return context.transcript.entries.length - selected.length;
      }
      return context.transcript.entries.length;
   });
   if (payload.for === undefined) {
      const ms = payload.ms ?? DEFAULT_WAIT_PAUSE_MS;
      await pauseUntilPoll(context, ms);
      return { details: { waitedMs: Date.now() - startedAt, pausedMs: ms } };
   }
   return pollUntilMatch({
      context,
      matcher: parseTextMatcher(payload.for),
      startIndex,
      startedAt,
      timeoutMs: payload.timeoutMs,
   });
}

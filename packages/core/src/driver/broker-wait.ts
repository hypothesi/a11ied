import { DEFAULT_WAIT_PAUSE_MS, type DriverWaitPayload } from '@a11ied/contracts';
import { delay } from '@a11ied/guidepup';

import type { ActionExecutionResult, BrokerHandlerContext } from './broker-types.js';
import {
   describeMatcher,
   matchesText,
   parseTextMatcher,
   type TextMatcher,
} from './matcher.js';

const WAIT_POLL_INTERVAL_MS = 150;

interface WaitPoll {
   context: BrokerHandlerContext;
   matcher: TextMatcher;
   /** Transcript entries before this index were spoken before the wait began. */
   startIndex: number;
   startedAt: number;
   timeoutMs: number;
}

/** Pulls any new phrases into the transcript, then looks for a match since the wait began. */
async function findNewMatch(poll: WaitPoll): Promise<number | undefined> {
   const state = await poll.context.adapter.readState(poll.context.checkpoints);
   poll.context.transcript.capture(state);
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
   await delay(WAIT_POLL_INTERVAL_MS);
   return pollUntilMatch(poll);
}

/**
 * Pauses, or polls the transcript until a phrase spoken after the wait began matches.
 * Polling the transcript rather than the last phrase means an announcement that arrives
 * and is replaced by another before the next poll is still seen.
 */
export async function runWaitAction(
   context: BrokerHandlerContext,
   payload: DriverWaitPayload,
): Promise<ActionExecutionResult> {
   const startedAt = Date.now();
   if (payload.for === undefined) {
      const ms = payload.ms ?? DEFAULT_WAIT_PAUSE_MS;
      await delay(ms);
      return { details: { waitedMs: Date.now() - startedAt, pausedMs: ms } };
   }
   return pollUntilMatch({
      context,
      matcher: parseTextMatcher(payload.for),
      startIndex: context.transcript.entries.length,
      startedAt,
      timeoutMs: payload.timeoutMs,
   });
}

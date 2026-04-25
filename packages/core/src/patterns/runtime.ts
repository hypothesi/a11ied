import {
   interactionPatternIdSchema,
   interactionPatternResultSchema,
   type InteractionPatternResult,
   type Platform,
} from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';
import { withInteractiveBrowserPage } from '../browser/helper.js';
import {
   getDriverSessionStatus,
   startDriverSession,
   stopDriverSession,
} from '../driver/runtime.js';
import { resolveDefaultTarget } from '../driver/default-target.js';
import type { PatternContext, RunPatternOptions } from './helpers.js';
import {
   runLandmarkSequence,
   runHeadingSequence,
   runStatusMessageProbe,
} from './sequences.js';
import { runDialogProbe } from './dialog.js';
import { runFocusVisibilityProbe } from './focus.js';
import {
   runAuthFlowProbe,
   runFocusOrderProbe,
   runFormFieldWalk,
   runRedundantEntryProbe,
   runTabSequence,
} from './probes.js';

type PatternRunner = (
   context: PatternContext,
   url: string,
) => Promise<InteractionPatternResult>;
type StopSessionResult = Awaited<ReturnType<typeof stopDriverSession>> | undefined;
const REAL_TARGET_BROWSER_PRIME_MS = 1000;

const patternRunners: Record<string, PatternRunner | undefined> = {
   landmark_sequence: runLandmarkSequence,
   heading_sequence: runHeadingSequence,
   status_message_probe: runStatusMessageProbe,
   dialog_probe: runDialogProbe,
   focus_visibility_probe: (ctx, url) =>
      runFocusVisibilityProbe(ctx, url, 'focus_visibility_probe'),
   focus_obscured_probe: (ctx, url) =>
      runFocusVisibilityProbe(ctx, url, 'focus_obscured_probe'),
   tab_sequence: runTabSequence,
   form_field_walk: runFormFieldWalk,
   focus_order_probe: runFocusOrderProbe,
   auth_flow_probe: runAuthFlowProbe,
   redundant_entry_probe: runRedundantEntryProbe,
};

async function resolveSession(options: RunPatternOptions): Promise<{
   sessionId: string;
   target: Platform;
   managedSession: boolean;
}> {
   if (options.sessionId) {
      if (options.recordingPath) {
         throw new CliUsageError(
            'recording-session-conflict',
            'Do not pass --recording when reusing an existing session.',
            {
               sessionId: options.sessionId,
               recordingPath: options.recordingPath,
            },
         );
      }
      const status = await getDriverSessionStatus(options.sessionId);
      if (options.target && options.target !== status.session.target) {
         throw new CliUsageError(
            'session-target-mismatch',
            'The provided session target does not match --target.',
            {
               sessionId: options.sessionId,
               expectedTarget: status.session.target,
               receivedTarget: options.target,
            },
         );
      }

      return {
         sessionId: options.sessionId,
         target: status.session.target,
         managedSession: false,
      };
   }

   const target = options.target ?? resolveDefaultTarget().target;
   const session = await startDriverSession(target, process.cwd(), options.recordingPath);
   return {
      sessionId: session.sessionId,
      target,
      managedSession: true,
   };
}

function buildContext(
   parsedUrl: URL,
   resolvedSession: {
      sessionId: string;
      target: Platform;
      managedSession: boolean;
   },
   providedPage?: PatternContext['providedPage'],
): PatternContext {
   const context: PatternContext = {
      url: parsedUrl.toString(),
      sessionId: resolvedSession.sessionId,
      target: resolvedSession.target,
      managedSession: resolvedSession.managedSession,
      stepLog: [],
      assertions: [],
      browserEvidence: [],
   };
   if (providedPage) {
      context.providedPage = providedPage;
   }
   return context;
}

function parsePatternUrl(url: string): URL {
   try {
      return new URL(url);
   } catch {
      throw new CliUsageError('invalid-url', `URL "${url}" is invalid.`, { url });
   }
}

function noopStopFailure(): undefined {
   return undefined;
}

async function cleanupSession(
   sessionId: string,
   managedSession: boolean,
): Promise<StopSessionResult> {
   let stopResult: StopSessionResult = undefined;
   if (managedSession) {
      stopResult = await stopDriverSession(sessionId).catch(noopStopFailure);
   }

   return stopResult;
}

function getPatternRunner(patternId: string): PatternRunner {
   const runner = patternRunners[patternId];
   if (runner) {
      return runner;
   }
   throw new CliUsageError('unknown-pattern', `Pattern "${patternId}" is unsupported.`, {
      patternId,
   });
}

function applyManagedRecording(
   result: InteractionPatternResult,
   stopResult: StopSessionResult,
): InteractionPatternResult {
   return interactionPatternResultSchema.parse({
      ...result,
      recording: stopResult?.session.recording ?? result.recording,
   });
}

async function runPatternWithSession(args: {
   patternId: string;
   url: string;
   context: PatternContext;
   runner: PatternRunner;
}): Promise<InteractionPatternResult> {
   let result: InteractionPatternResult | undefined = undefined;
   let stopResult: StopSessionResult = undefined;
   try {
      result = await args.runner(args.context, args.url);
   } finally {
      stopResult = await cleanupSession(
         args.context.sessionId,
         args.context.managedSession,
      );
   }
   return applyManagedRecording(result as InteractionPatternResult, stopResult);
}

/** Runs one built-in interaction pattern against a target URL or existing session. */
export async function runInteractionPattern(
   options: RunPatternOptions,
): Promise<InteractionPatternResult> {
   const parsedUrl = parsePatternUrl(options.url);
   const patternId = interactionPatternIdSchema.parse(options.patternId);
   const runner = getPatternRunner(patternId);
   if (!options.sessionId) {
      const target = options.target ?? resolveDefaultTarget().target;
      if (target !== 'virtual') {
         return await withInteractiveBrowserPage(parsedUrl.toString(), async (page) => {
            await page.waitForTimeout(REAL_TARGET_BROWSER_PRIME_MS);
            const session = await startDriverSession(
               target,
               process.cwd(),
               options.recordingPath,
            );
            return await runPatternWithSession({
               patternId,
               url: parsedUrl.toString(),
               context: buildContext(
                  parsedUrl,
                  {
                     sessionId: session.sessionId,
                     target,
                     managedSession: true,
                  },
                  page,
               ),
               runner,
            });
         });
      }
   }
   const resolvedSession = await resolveSession(options);
   return runPatternWithSession({
      patternId,
      url: parsedUrl.toString(),
      context: buildContext(parsedUrl, resolvedSession),
      runner,
   });
}

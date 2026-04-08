import {
   interactionPatternIdSchema,
   type InteractionPatternResult,
   type Platform,
} from '@a11lied/contracts';

import { CliUsageError } from './cli-errors.js';
import {
   getDriverSessionStatus,
   startDriverSession,
   stopDriverSession,
} from './driver-runtime.js';
import type { PatternContext, RunPatternOptions } from './pattern-helpers.js';
import {
   runLandmarkSequence,
   runHeadingSequence,
   runStatusMessageProbe,
} from './pattern-sequences.js';
import { runDialogProbe } from './pattern-dialog.js';
import { runFocusVisibilityProbe } from './pattern-focus.js';
import {
   runAuthFlowProbe,
   runFocusOrderProbe,
   runFormFieldWalk,
   runRedundantEntryProbe,
   runTabSequence,
} from './pattern-probes.js';

type PatternRunner = (
   context: PatternContext,
   url: string,
) => Promise<InteractionPatternResult>;

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

   const target = options.target ?? 'virtual';
   const session = await startDriverSession(target);
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
): PatternContext {
   return {
      url: parsedUrl.toString(),
      sessionId: resolvedSession.sessionId,
      target: resolvedSession.target,
      managedSession: resolvedSession.managedSession,
      stepLog: [],
      assertions: [],
      browserEvidence: [],
   };
}

function parsePatternUrl(url: string): URL {
   try {
      return new URL(url);
   } catch {
      throw new CliUsageError('invalid-url', `URL "${url}" is invalid.`, { url });
   }
}

async function cleanupSession(sessionId: string, managedSession: boolean): Promise<void> {
   if (managedSession) {
      await stopDriverSession(sessionId).catch(() => {
         // No-op: best-effort cleanup
      });
   }
}

export async function runInteractionPattern(
   options: RunPatternOptions,
): Promise<InteractionPatternResult> {
   const parsedUrl = parsePatternUrl(options.url);
   const patternId = interactionPatternIdSchema.parse(options.patternId);
   const resolvedSession = await resolveSession(options);
   const context = buildContext(parsedUrl, resolvedSession);
   const runner = patternRunners[patternId];
   if (!runner) {
      throw new CliUsageError(
         'unknown-pattern',
         `Pattern "${patternId}" is unsupported.`,
         { patternId },
      );
   }
   try {
      return await runner(context, parsedUrl.toString());
   } finally {
      await cleanupSession(resolvedSession.sessionId, resolvedSession.managedSession);
   }
}

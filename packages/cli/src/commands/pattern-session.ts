import type * as Core from '#core';

import { withImplicitDriveSessionGuard } from '../lib/drive-session.js';
import type { PatternActionOptions } from './run-actions.js';

export interface PatternCommandResult extends Record<string, unknown> {
   assertions: Array<{ id: string; status: string }>;
}

export function buildPatternSessionOptions(options: PatternActionOptions): {
   session?: string;
} {
   const sessionOptions: { session?: string } = {};

   if (options.session) {
      sessionOptions.session = options.session;
   }

   return sessionOptions;
}

export function buildResolvedPatternOptions(args: {
   options: PatternActionOptions;
   sessionId?: string;
}): PatternActionOptions {
   const resolvedOptions: PatternActionOptions = { ...args.options };

   if (args.sessionId) {
      resolvedOptions.session = args.sessionId;
   }

   return resolvedOptions;
}

export async function runPatternCommand(args: {
   core: {
      runInteractionPattern: (
         input: Parameters<typeof Core.runInteractionPattern>[0],
      ) => Promise<PatternCommandResult>;
   };
   input: Record<string, unknown>;
   sessionSource: 'explicit' | 'env' | 'cache' | 'none';
}): Promise<PatternCommandResult> {
   return withImplicitDriveSessionGuard({
      source: args.sessionSource,
      run: async () =>
         args.core.runInteractionPattern(
            args.input as unknown as Parameters<typeof Core.runInteractionPattern>[0],
         ),
   });
}

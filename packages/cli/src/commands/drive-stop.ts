import { CliEnvironmentError } from '#core';
import type { CommandExecution } from '../lib/helpers.js';
import {
   clearImplicitDriveSessionIfMatches,
   withImplicitDriveSessionGuard,
} from '../lib/drive-session.js';
import { resolveDriveSession } from '../lib/resolvers.js';

export async function executeStopAction(options: {
   session?: string;
}): Promise<CommandExecution> {
   const core = await import('#core');
   const resolved = await resolveDriveSession(options);
   const sessionId = resolved.sessionId ?? '';

   try {
      const result = await withImplicitDriveSessionGuard({
         source: resolved.sessionSource,
         run: () => core.stopDriverSession(sessionId),
      });

      await clearImplicitDriveSessionIfMatches(sessionId);
      return {
         target: { kind: 'driver-session', value: sessionId },
         result,
      };
   } catch (error) {
      if (
         error instanceof CliEnvironmentError &&
         error.code === 'session-not-found' &&
         resolved.sessionSource === 'cache'
      ) {
         // Cache was already cleared by withImplicitDriveSessionGuard.
         return {
            ok: true,
            target: { kind: 'driver-session', value: sessionId },
            result: {
               action: 'stop',
               session: { sessionId, target: 'unknown' },
               state: {
                  lastSpokenPhrase: undefined,
                  currentItemText: undefined,
                  logCursor: 0,
                  checkpoints: [],
               },
               details: { alreadyGone: true },
            },
         } satisfies CommandExecution;
      }

      throw error;
   }
}

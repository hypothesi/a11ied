import { CliEnvironmentError, CliUsageError } from '#core';
import type { CommandExecution } from '../lib/helpers.js';
import { withImplicitDriveSessionGuard } from '../lib/drive-session.js';
import { resolveDriveSession } from '../lib/resolvers.js';

const NO_SESSION_RESULT = { action: 'status', noSession: true } as const;

export async function executeStatusAction(options: {
   session?: string;
}): Promise<CommandExecution> {
   const sessionResolution = await resolveDriveSession(options).catch(
      (error: unknown) => {
         if (error instanceof CliUsageError && error.code === 'missing-session') {
            return;
         }
         throw error;
      },
   );

   if (!sessionResolution) {
      return { result: NO_SESSION_RESULT };
   }

   const core = await import('#core');
   const sessionId = sessionResolution.sessionId ?? '';
   const result = await withImplicitDriveSessionGuard({
      source: sessionResolution.sessionSource,
      run: () => core.getDriverSessionStatus(sessionId),
   }).catch((error: unknown) => {
      if (error instanceof CliEnvironmentError && error.code === 'session-not-found') {
         return;
      }
      throw error;
   });

   if (!result) {
      return { result: NO_SESSION_RESULT };
   }

   return {
      target: { kind: 'driver-session', value: sessionId },
      result,
   };
}

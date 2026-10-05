import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { writeJsonAtomic } from '../files/atomic-json.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';
import { toBrokerError } from './broker-errors.js';
import { resolveStateRoot } from './environment.js';

const startupErrorSchema = z.object({
   code: z.string(),
   message: z.string(),
   details: z.record(z.string(), z.unknown()).optional(),
});

function getStartupErrorPath(sessionId: string): string {
   return resolve(resolveStateRoot(), `startup-${encodeURIComponent(sessionId)}.json`);
}

/** A failed detached startup must remain visible after its socket has closed. */
export async function recordBrokerStartupError(
   sessionId: string,
   error: unknown,
): Promise<void> {
   await writeJsonAtomic(toBrokerError(error), getStartupErrorPath(sessionId));
}

/** Consume the matching failure instead of waiting for a session that cannot start. */
export async function throwIfBrokerStartupFailed(sessionId: string): Promise<void> {
   const path = getStartupErrorPath(sessionId);
   let raw = '';
   try {
      raw = await readFile(path, 'utf8');
   } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
         return;
      }
      throw error;
   }
   const error = startupErrorSchema.parse(JSON.parse(raw));
   await rm(path, { force: true });
   throw new CliEnvironmentError(error.code, error.message, {
      ...error.details,
      sessionId,
   });
}

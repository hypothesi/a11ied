import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { CliEnvironmentError } from '#core';

const STATE_FOLDER = '.a11ied';
const CURRENT_DRIVE_SESSION_FILE = 'current-drive-session';
const { env } = process;

export const IMPLICIT_DRIVE_SESSION_ENV_VAR = 'A11IED_DRIVE_SESSION';

export type DriveSessionSource = 'explicit' | 'env' | 'cache' | 'none';

function getCurrentDriveSessionPath(cwd = process.cwd()): string {
   return resolve(cwd, STATE_FOLDER, 'state', CURRENT_DRIVE_SESSION_FILE);
}

function normalizeSessionId(value: string | undefined): string | undefined {
   if (!value) {
      return undefined;
   }

   const normalized = value.trim();
   if (normalized.length === 0) {
      return undefined;
   }

   return normalized;
}

function readDriveSessionFromEnv(): string | undefined {
   return normalizeSessionId(env.A11IED_DRIVE_SESSION);
}

async function readDriveSessionFromCache(
   cwd = process.cwd(),
): Promise<string | undefined> {
   try {
      return normalizeSessionId(await readFile(getCurrentDriveSessionPath(cwd), 'utf8'));
   } catch {
      return undefined;
   }
}

export async function resolveImplicitDriveSession(args: {
   session?: string;
   cwd?: string;
}): Promise<{ sessionId?: string; source: DriveSessionSource }> {
   const explicitSessionId = normalizeSessionId(args.session);

   if (explicitSessionId) {
      return {
         sessionId: explicitSessionId,
         source: 'explicit',
      };
   }

   const envSessionId = readDriveSessionFromEnv();

   if (envSessionId) {
      return {
         sessionId: envSessionId,
         source: 'env',
      };
   }

   const cachedSessionId = await readDriveSessionFromCache(args.cwd);

   if (cachedSessionId) {
      env.A11IED_DRIVE_SESSION = cachedSessionId;

      return {
         sessionId: cachedSessionId,
         source: 'cache',
      };
   }

   return {
      source: 'none',
   };
}

export function isImplicitDriveSessionSource(source: DriveSessionSource): boolean {
   return source === 'env' || source === 'cache';
}

export async function persistImplicitDriveSession(
   sessionId: string,
   cwd = process.cwd(),
): Promise<void> {
   env.A11IED_DRIVE_SESSION = sessionId;
   await mkdir(dirname(getCurrentDriveSessionPath(cwd)), { recursive: true });
   await writeFile(getCurrentDriveSessionPath(cwd), `${sessionId}\n`, 'utf8');
}

export async function clearImplicitDriveSession(cwd = process.cwd()): Promise<void> {
   delete env.A11IED_DRIVE_SESSION;
   await rm(getCurrentDriveSessionPath(cwd), { force: true });
}

export async function clearImplicitDriveSessionIfMatches(
   sessionId: string,
   cwd = process.cwd(),
): Promise<void> {
   const cachedSessionId = await readDriveSessionFromCache(cwd),
      envSessionId = readDriveSessionFromEnv();

   if (envSessionId !== sessionId && cachedSessionId !== sessionId) {
      return;
   }

   await clearImplicitDriveSession(cwd);
}

export async function clearImplicitDriveSessionOnMissingSession(args: {
   source: DriveSessionSource;
   error: unknown;
   cwd?: string;
}): Promise<void> {
   if (!(args.error instanceof CliEnvironmentError)) {
      return;
   }

   if (args.error.code !== 'session-not-found') {
      return;
   }

   if (!isImplicitDriveSessionSource(args.source)) {
      return;
   }

   await clearImplicitDriveSession(args.cwd);
}

export async function withImplicitDriveSessionGuard<TResult>(args: {
   source: DriveSessionSource;
   run: () => Promise<TResult>;
   cwd?: string;
}): Promise<TResult> {
   try {
      return await args.run();
   } catch (error) {
      const clearArgs: {
         source: DriveSessionSource;
         error: unknown;
         cwd?: string;
      } = {
         source: args.source,
         error,
      };

      if (args.cwd) {
         clearArgs.cwd = args.cwd;
      }

      await clearImplicitDriveSessionOnMissingSession(clearArgs);
      throw error;
   }
}

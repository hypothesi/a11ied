import { open, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveStateRoot } from './environment.js';
import { ensureStateDirectory, isProcessRunning } from './session-utils.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const LOCK_FILE = 'session.lock';

function getLockFile(): string {
   return resolve(resolveStateRoot(), LOCK_FILE);
}

function isExistsError(error: unknown): boolean {
   return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

async function readLockOwnerPid(lockFile: string): Promise<number | undefined> {
   try {
      const pid = Number(await readFile(lockFile, 'utf8'));
      return Number.isInteger(pid) && pid > 0 ? pid : undefined;
   } catch {
      return undefined;
   }
}

async function tryAcquire(lockFile: string): Promise<boolean> {
   try {
      // The `wx` flag fails when the file exists, so only one starter wins the create.
      const handle = await open(lockFile, 'wx');
      await handle.writeFile(`${String(process.pid)}\n`, 'utf8');
      await handle.close();
      return true;
   } catch (error) {
      if (isExistsError(error)) {
         return false;
      }
      throw error;
   }
}

async function acquireSessionStartLock(): Promise<() => Promise<void>> {
   await ensureStateDirectory();
   const lockFile = getLockFile();
   if (await tryAcquire(lockFile)) {
      return () => rm(lockFile, { force: true });
   }
   const ownerPid = await readLockOwnerPid(lockFile);
   if (ownerPid !== undefined && isProcessRunning(ownerPid)) {
      throw new CliEnvironmentError(
         'session-start-in-progress',
         `Another "sr start" (pid ${String(ownerPid)}) is already starting a session.`,
         { lockFile, ownerPid },
      );
   }
   // The previous starter died without releasing the lock; take it over.
   await rm(lockFile, { force: true });
   if (await tryAcquire(lockFile)) {
      return () => rm(lockFile, { force: true });
   }
   throw new CliEnvironmentError(
      'session-start-in-progress',
      'Another "sr start" is already starting a session.',
      { lockFile },
   );
}

/** Runs one session start while holding the exclusive-create lock file. */
export async function withSessionStartLock<TResult>(
   run: () => Promise<TResult>,
): Promise<TResult> {
   const release = await acquireSessionStartLock();
   try {
      return await run();
   } finally {
      await release();
   }
}

import { randomUUID } from 'node:crypto';
import { link, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { lock } from 'proper-lockfile';

const JSON_INDENT = 3;
const PRIVATE_FILE_MODE = 0o600;
const LOCK_RETRIES = 8;
const LOCK_RETRY_MS = 25;
const LOCK_MAX_RETRY_MS = 100;
const waitingFiles = new Map<string, Promise<unknown>>();

/** Resolve filesystem aliases even when the destination has not been created yet. */
export async function getCanonicalPath(path: string): Promise<string> {
   const input = resolve(path);
   try {
      return await realpath(input);
   } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
         const parent = dirname(input);
         if (parent !== input) {
            return resolve(await getCanonicalPath(parent), basename(input));
         }
      }
      throw error;
   }
}

/** Serialize filesystem mutations with stale-lock recovery and bounded contention retries. */
async function withFilesystemLock<TResult>(
   path: string,
   run: () => Promise<TResult>,
): Promise<TResult> {
   await mkdir(dirname(path), { recursive: true });
   const release = await lock(path, {
      realpath: false,
      retries: {
         retries: LOCK_RETRIES,
         minTimeout: LOCK_RETRY_MS,
         maxTimeout: LOCK_MAX_RETRY_MS,
      },
   });
   try {
      return await run();
   } finally {
      await release();
   }
}

/** Queue local callers before acquiring the bounded cross-process filesystem lock. */
export async function withFileLock<TResult>(
   path: string,
   run: () => Promise<TResult>,
): Promise<TResult> {
   const key = resolve(path),
      previous = waitingFiles.get(key) ?? Promise.resolve();
   const pending = (async (): Promise<TResult> => {
      await Promise.allSettled([previous]);
      return withFilesystemLock(path, run);
   })();
   waitingFiles.set(key, pending);
   try {
      return await pending;
   } finally {
      if (waitingFiles.get(key) === pending) {
         waitingFiles.delete(key);
      }
   }
}

/** Use private temporary files so content replacement never follows a leaf symlink. */
async function writeFileAtomic(
   value: string | Uint8Array,
   path: string,
   overwrite = true,
): Promise<void> {
   const temporaryPath = `${path}.${randomUUID()}.tmp`;
   await mkdir(dirname(path), { recursive: true });
   const handle = await open(temporaryPath, 'wx', PRIVATE_FILE_MODE);
   try {
      try {
         await handle.writeFile(value, 'utf8');
         await handle.sync();
      } finally {
         await handle.close();
      }
      await (overwrite ? rename(temporaryPath, path) : link(temporaryPath, path));
   } finally {
      await rm(temporaryPath, { force: true });
   }
}

/** Replace text files without exposing partially written content or following leaf links. */
export async function writeTextAtomic(
   value: string,
   path: string,
   overwrite = true,
): Promise<void> {
   return writeFileAtomic(value, path, overwrite);
}

/** Use the same atomic replacement for evidence bytes and content-addressed artifacts. */
export async function writeBytesAtomic(value: Uint8Array, path: string): Promise<void> {
   return writeFileAtomic(value, path);
}

/** Write beside the destination so rename is atomic, with a private, unique temp file. */
export async function writeJsonAtomic(
   value: unknown,
   path: string,
   overwrite = true,
): Promise<void> {
   return writeTextAtomic(
      `${JSON.stringify(value, undefined, JSON_INDENT)}\n`,
      path,
      overwrite,
   );
}

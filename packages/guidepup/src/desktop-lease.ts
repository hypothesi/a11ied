import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { lock } from 'proper-lockfile';
import { z } from 'zod';
import { DriverCommandError } from './driver-command-error.js';

const LOCK_MAX_RETRY_MS = 100,
   LOCK_RETRIES = 8,
   LOCK_RETRY_MS = 25,
   PRIVATE_DIRECTORY_MODE = 0o700,
   PRIVATE_FILE_MODE = 0o600;
const ownerSchema = z
   .object({ pid: z.number().int().positive(), token: z.uuid() })
   .strict();
type DesktopOwner = z.infer<typeof ownerSchema>;

export interface DesktopLease {
   assertOwned: () => Promise<void>;
   release: () => Promise<void>;
}

function isMissingFile(error: unknown): boolean {
   return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isOwnerRunning(pid: number): boolean {
   try {
      process.kill(pid, 0);
      return true;
   } catch (error) {
      return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
   }
}

async function readOwner(path: string): Promise<DesktopOwner | undefined> {
   try {
      return ownerSchema.parse(JSON.parse(await readFile(path, 'utf8')));
   } catch (error) {
      if (isMissingFile(error)) {
         return undefined;
      }
      throw new DriverCommandError(
         'desktop-owner-unreadable',
         'Desktop ownership could not be verified. Inspect the owner record before starting a real reader.',
         { path },
      );
   }
}

async function withOwnerLock<TResult>(
   path: string,
   run: () => Promise<TResult>,
): Promise<TResult> {
   await mkdir(dirname(path), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
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

async function assertOwner(path: string, token: string): Promise<void> {
   const owner = await readOwner(path);
   if (owner?.token !== token || owner.pid !== process.pid) {
      throw new DriverCommandError(
         'desktop-ownership-lost',
         'This session no longer owns the desktop. Input and reader shutdown were refused.',
         { path },
      );
   }
}

/** Claim one desktop per OS user, regardless of audit state-directory overrides. */
export async function acquireDesktopLease(): Promise<DesktopLease> {
   const path = join(userInfo().homedir, '.a11ied', 'desktop-owner.json'),
      token = randomUUID();
   await withOwnerLock(path, async () => {
      const previous = await readOwner(path);
      if (previous && isOwnerRunning(previous.pid)) {
         throw new DriverCommandError(
            'desktop-in-use',
            'Another real-reader session owns this desktop. Stop that session before starting another.',
            { ownerPid: previous.pid },
         );
      }
      await writeFile(path, JSON.stringify({ pid: process.pid, token }), {
         mode: PRIVATE_FILE_MODE,
      });
   });
   return {
      assertOwned: () => assertOwner(path, token),
      release: () =>
         withOwnerLock(path, async () => {
            const owner = await readOwner(path);
            if (owner?.token === token && owner.pid === process.pid) {
               await rm(path, { force: true });
            }
         }),
   };
}

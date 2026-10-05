import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { lockSync } from 'proper-lockfile';

import {
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
} from '@a11ied/contracts';

import { resolveStateRoot } from './environment.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';
import { withFileLock, writeJsonAtomic } from '../files/atomic-json.js';

const SESSION_ID_BYTES = 6;
const ACTIVE_SESSION_FILE = 'session.json';
const IN_MEMORY_SOCKET_PREFIX = 'in-memory://';

/** The one metadata file describing the active session for this user. */
export function getActiveSessionFile(): string {
   return resolve(resolveStateRoot(), ACTIVE_SESSION_FILE);
}

/**
 * Creates a short session id; one session is active at a time so it only needs to be
 * unique.
 */
export function createSessionId(): string {
   return `drv_${randomBytes(SESSION_ID_BYTES).toString('hex')}`;
}

/**
 * Socket path for one session: a named pipe on Windows, a short path under the OS tmpdir
 * elsewhere.
 */
export function getDriverSocketPath(sessionId: string): string {
   if (process.platform === 'win32') {
      return `\\\\.\\pipe\\a11ied-${sessionId}`;
   }
   return resolve(tmpdir(), `a11ied-${sessionId}.sock`);
}

/** Socket path used for sessions that live inside the calling process. */
export function getInMemorySocketPath(sessionId: string): string {
   return `${IN_MEMORY_SOCKET_PREFIX}${sessionId}`;
}

export function isInMemorySession(
   session: Pick<AccessibilityDriverSession, 'socketPath'>,
): boolean {
   return session.socketPath.startsWith(IN_MEMORY_SOCKET_PREFIX);
}

export async function ensureStateDirectory(): Promise<void> {
   await mkdir(resolveStateRoot(), { recursive: true });
}

export async function writeSessionMetadata(
   session: AccessibilityDriverSession,
): Promise<void> {
   await withFileLock(session.metadataFile, () =>
      writeJsonAtomic(session, session.metadataFile),
   );
}

export function createMissingSessionError(): CliEnvironmentError {
   return new CliEnvironmentError(
      'session-not-found',
      'No active screen reader session. Start one with "a1 sr start".',
   );
}

/** Prevents a session-bound handle from adopting another active owner. */
export function requireMatchingDriverSession(
   session: AccessibilityDriverSession | undefined,
   expectedSessionId?: string,
): AccessibilityDriverSession {
   if (!session) {
      throw createMissingSessionError();
   }
   if (expectedSessionId !== undefined && session.sessionId !== expectedSessionId) {
      throw new CliEnvironmentError(
         'session-replaced',
         'This screen reader session was replaced. Start a new reader handle.',
         { expectedSessionId, activeSessionId: session.sessionId },
      );
   }
   return session;
}

/** Reads the active session file without checking whether its broker is alive. */
export async function readActiveSessionMetadata(): Promise<
   AccessibilityDriverSession | undefined
> {
   try {
      const raw = await readFile(getActiveSessionFile(), 'utf8');
      return accessibilityDriverSessionSchema.parse(JSON.parse(raw));
   } catch {
      return undefined;
   }
}

export function isProcessRunning(pid: number): boolean {
   try {
      process.kill(pid, 0);
      return true;
   } catch (error) {
      if (error instanceof Error && 'code' in error) {
         return String(error.code) === 'EPERM';
      }
      return false;
   }
}

function isSessionOwner(raw: string, sessionId: string): boolean {
   try {
      const parsed = accessibilityDriverSessionSchema.safeParse(JSON.parse(raw));
      return parsed.success && parsed.data.sessionId === sessionId;
   } catch {
      return false;
   }
}

/** Recovery publication must not replace another active owner. */
export async function writeRecoveryMetadata(
   session: AccessibilityDriverSession,
): Promise<void> {
   await withFileLock(session.metadataFile, async () => {
      try {
         const raw = await readFile(session.metadataFile, 'utf8');
         if (!isSessionOwner(raw, session.sessionId)) {
            return;
         }
      } catch (error) {
         if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
            throw error;
         }
      }
      await writeJsonAtomic(session, session.metadataFile);
   });
}

function removeOwnedMetadataSync(
   session: Pick<AccessibilityDriverSession, 'sessionId' | 'metadataFile'>,
): void {
   let release: (() => void) | undefined = undefined;
   try {
      release = lockSync(session.metadataFile, { realpath: false });
      if (isSessionOwner(readFileSync(session.metadataFile, 'utf8'), session.sessionId)) {
         rmSync(session.metadataFile, { force: true });
      }
   } catch {
      // Exit cleanup leaves metadata for stale-session recovery if ownership is uncertain.
   } finally {
      release?.();
   }
}

export async function removeSessionArtifacts(
   session: Pick<AccessibilityDriverSession, 'sessionId' | 'metadataFile' | 'socketPath'>,
): Promise<void> {
   await withFileLock(session.metadataFile, async () => {
      let raw = '';
      try {
         raw = await readFile(session.metadataFile, 'utf8');
      } catch (error) {
         if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return;
         }
         throw error;
      }
      if (isSessionOwner(raw, session.sessionId)) {
         await rm(session.metadataFile, { force: true });
      }
   });
   if (process.platform !== 'win32' && !isInMemorySession(session)) {
      await rm(session.socketPath, { force: true });
   }
}

/** Synchronous twin of removeSessionArtifacts for process exit handlers. */
export function removeSessionArtifactsSync(
   session: Pick<AccessibilityDriverSession, 'sessionId' | 'metadataFile' | 'socketPath'>,
): void {
   removeOwnedMetadataSync(session);
   if (process.platform !== 'win32' && !isInMemorySession(session)) {
      rmSync(session.socketPath, { force: true });
   }
}

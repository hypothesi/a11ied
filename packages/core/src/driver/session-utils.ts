import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import {
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
} from '@a11ied/contracts';

import { resolveStateRoot } from './environment.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';

const JSON_INDENT = 2;
const SESSION_ID_BYTES = 6;
const ACTIVE_SESSION_FILE = 'session.json';
const IN_MEMORY_SOCKET_PREFIX = 'in-memory://';

/** The one metadata file describing the active session for this user. */
export function getActiveSessionFile(): string {
   return resolve(resolveStateRoot(), ACTIVE_SESSION_FILE);
}

/** Creates a short session id; one session is active at a time so it only needs to be unique. */
export function createSessionId(): string {
   return `drv_${randomBytes(SESSION_ID_BYTES).toString('hex')}`;
}

/** Socket path for one session: a named pipe on Windows, a short path under the OS tmpdir elsewhere. */
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

export function isInMemorySession(session: Pick<AccessibilityDriverSession, 'socketPath'>): boolean {
   return session.socketPath.startsWith(IN_MEMORY_SOCKET_PREFIX);
}

export async function ensureStateDirectory(): Promise<void> {
   await mkdir(resolveStateRoot(), { recursive: true });
}

export async function writeSessionMetadata(
   session: AccessibilityDriverSession,
): Promise<void> {
   await mkdir(dirname(session.metadataFile), { recursive: true });
   const json = JSON.stringify(session, undefined, JSON_INDENT);
   await writeFile(session.metadataFile, `${json}\n`, 'utf8');
}

export function createMissingSessionError(): CliEnvironmentError {
   return new CliEnvironmentError(
      'session-not-found',
      'No active screen reader session. Start one with "a1 sr start".',
   );
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

export async function removeSessionArtifacts(
   session: Pick<AccessibilityDriverSession, 'metadataFile' | 'socketPath'>,
): Promise<void> {
   await rm(session.metadataFile, { force: true });
   if (process.platform !== 'win32' && !isInMemorySession(session)) {
      await rm(session.socketPath, { force: true });
   }
}

/** Synchronous twin of removeSessionArtifacts for process exit handlers. */
export function removeSessionArtifactsSync(
   session: Pick<AccessibilityDriverSession, 'metadataFile' | 'socketPath'>,
): void {
   rmSync(session.metadataFile, { force: true });
   if (process.platform !== 'win32' && !isInMemorySession(session)) {
      rmSync(session.socketPath, { force: true });
   }
}

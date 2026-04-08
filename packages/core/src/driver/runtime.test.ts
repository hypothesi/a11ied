import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
   type CliEnvironmentError,
   cleanupStaleDriverSessions,
   getDriverSessionMetadataPath,
   getDriverSocketPath,
   getDriverSessionStatus,
   runDriverSessionAction,
   runEphemeralDriverAction,
   startDriverSession,
   stopDriverSession,
} from '../index.js';

const TIMEOUT_MS = 15_000;
const UNIX_SOCKET_PATH_MAX = 104;
const WINDOWS_PIPE_PREFIX = String.raw`\\.\pipe\a11lied-`;
const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11lied-driver-'));
   tempRoots.push(root);
   return root;
}

afterEach(async () => {
   await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
   tempRoots.length = 0;
});

function expectValidSession(
   session: { target: string; sessionId: string; metadataFile: string },
   cwd: string,
): void {
   expect(session.target).toBe('virtual');
   expect(session.sessionId).toMatch(/^drv_/);
   expect(session.metadataFile).toBe(
      getDriverSessionMetadataPath(session.sessionId, cwd),
   );
}

async function runAndVerifyDriverActions(sessionId: string, cwd: string): Promise<void> {
   const stepped = await runDriverSessionAction(sessionId, 'next', { cwd });
   expect(stepped.action).toBe('next');
   expect(stepped.state.logCursor).toBeGreaterThanOrEqual(1);

   const cleared = await runDriverSessionAction(sessionId, 'clear-logs', { cwd });
   expect(cleared.state.spokenPhraseLog).toEqual([]);

   const logged = await runDriverSessionAction(sessionId, 'logs', { cwd });
   expect(logged.state.spokenPhraseLog).toEqual([]);
}

describe('driver runtime sessions', () => {
   it(
      'starts, reports, and stops a virtual session',
      async () => {
         const cwd = await createTempRoot();
         const session = await startDriverSession('virtual', cwd);
         expectValidSession(session, cwd);

         const status = await getDriverSessionStatus(session.sessionId, cwd);
         expect(status.action).toBe('status');
         expect(status.session.sessionId).toBe(session.sessionId);
         expect(status.state.logCursor).toBeGreaterThan(0);

         const stopped = await stopDriverSession(session.sessionId, cwd);
         expect(stopped.action).toBe('stop');

         await expect(
            getDriverSessionStatus(session.sessionId, cwd),
         ).rejects.toMatchObject({
            code: 'session-not-found',
         } satisfies Partial<CliEnvironmentError>);
      },
      TIMEOUT_MS,
   );

   it('fails cleanly for an unknown session', async () => {
      const cwd = await createTempRoot();

      await expect(getDriverSessionStatus('missing-session', cwd)).rejects.toMatchObject({
         code: 'session-not-found',
      } satisfies Partial<CliEnvironmentError>);
   });
});

describe('driver runtime actions', () => {
   it('keeps unix socket paths short enough for long temp directories', async () => {
      const cwd = await createTempRoot();
      const socketPath = getDriverSocketPath(
         'drv_12345678-1234-1234-1234-123456789abc',
         resolve(cwd, 'a', 'very', 'long', 'nested', 'directory', 'structure'),
      );

      if (process.platform === 'win32') {
         expect(socketPath).toContain(WINDOWS_PIPE_PREFIX);
         return;
      }

      expect(socketPath.startsWith('/tmp/a11lied-')).toBe(true);
      expect(socketPath.length).toBeLessThan(UNIX_SOCKET_PATH_MAX);
   });

   it(
      'cleans up stale session metadata for dead brokers',
      async () => {
         const cwd = await createTempRoot();
         const session = await startDriverSession('virtual', cwd);
         const stopped = await stopDriverSession(session.sessionId, cwd);

         expect(stopped.session.sessionId).toBe(session.sessionId);
         expect(await cleanupStaleDriverSessions(cwd)).toEqual([]);
      },
      TIMEOUT_MS,
   );

   it(
      'runs persistent and ephemeral driver actions against the virtual target',
      async () => {
         const cwd = await createTempRoot();
         const session = await startDriverSession('virtual', cwd);
         await runAndVerifyDriverActions(session.sessionId, cwd);

         const ephemeral = await runEphemeralDriverAction('virtual', 'next', { cwd });
         expect(ephemeral.action).toBe('next');
         expect(ephemeral.session.sessionId).toMatch(/^ephemeral_/);

         await stopDriverSession(session.sessionId, cwd);
      },
      TIMEOUT_MS,
   );
});

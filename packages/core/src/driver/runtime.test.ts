import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempRoots, withStateDir } from '../../../cli/src/testing/fixtures.js';

import {
   type CliEnvironmentError,
   cleanupStaleDriverSessions,
   getActiveDriverSession,
   getActiveSessionFile,
   getDriverSocketPath,
   getDriverSessionStatus,
   runDriverSessionAction,
   runEphemeralDriverAction,
   startDriverSession,
   stopDriverSession,
} from '../index.js';

const TIMEOUT_MS = 15_000;
const UNIX_SOCKET_PATH_MAX = 104;
const WINDOWS_PIPE_PREFIX = String.raw`\\.\pipe\a11ied-`;
const tempRoots: string[] = [];

afterEach(async () => {
   await cleanupTempRoots(tempRoots);
});

async function runAndVerifyDriverActions(): Promise<void> {
   const stepped = await runDriverSessionAction({ action: 'next' });
   expect(stepped.action).toBe('next');
   expect(stepped.state.logCursor).toBeGreaterThanOrEqual(1);

   const pressed = await runDriverSessionAction({
      action: 'press',
      payload: { keys: ['Tab', 'Tab'] },
   });
   expect(pressed.details).toEqual({ keys: ['Tab', 'Tab'] });

   await runDriverSessionAction({ action: 'checkpoint', payload: { label: 'here' } });
   const transcript = await runDriverSessionAction({ action: 'transcript' });
   expect(transcript.state.transcript.at(-1)).toMatchObject({ checkpoint: 'here' });
   expect(transcript.state.transcript[0]).toMatchObject({ index: 0, phrase: 'document' });
}

function startVirtualSession(): ReturnType<typeof startDriverSession> {
   return startDriverSession({ target: 'virtual', mode: 'in-process' });
}

async function assertStartReplacesLiveSession(): Promise<void> {
   const first = await startVirtualSession();
   const second = await startVirtualSession();

   expect(second.replacedSession?.sessionId).toBe(first.session.sessionId);
   const active = await getActiveDriverSession();
   expect(active?.sessionId).toBe(second.session.sessionId);

   await stopDriverSession();
}

describe('driver runtime sessions', () => {
   it(
      'starts, reports, and stops the one active session',
      () =>
         withStateDir(tempRoots, async (stateDir) => {
            const started = await startVirtualSession();
            expect(started.session.target).toBe('virtual');
            expect(started.session.sessionId).toMatch(/^drv_/);
            expect(started.session.metadataFile).toBe(getActiveSessionFile());
            expect(started.session.metadataFile).toBe(resolve(stateDir, 'session.json'));
            expect(started.replacedSession).toBeUndefined();

            const status = await getDriverSessionStatus();
            expect(status.action).toBe('status');
            expect(status.session.sessionId).toBe(started.session.sessionId);
            expect(status.state.logCursor).toBeGreaterThan(0);

            const stopped = await stopDriverSession();
            expect(stopped.action).toBe('stop');
            expect(await getActiveDriverSession()).toBeUndefined();

            await expect(getDriverSessionStatus()).rejects.toMatchObject({
               code: 'session-not-found',
            } satisfies Partial<CliEnvironmentError>);
         }),
      TIMEOUT_MS,
   );

   it(
      'replaces a live session on start and reports the one it stopped',
      () => withStateDir(tempRoots, assertStartReplacesLiveSession),
      TIMEOUT_MS,
   );

   it('reports no session cleanly when nothing was started', () =>
      withStateDir(tempRoots, async () => {
         expect(await getActiveDriverSession()).toBeUndefined();
         await expect(getDriverSessionStatus()).rejects.toMatchObject({
            code: 'session-not-found',
         } satisfies Partial<CliEnvironmentError>);
      }));
});

describe('driver runtime actions', () => {
   it('keeps unix socket paths short enough for the tmpdir', () => {
      const socketPath = getDriverSocketPath('drv_123456789abc');

      if (process.platform === 'win32') {
         expect(socketPath).toContain(WINDOWS_PIPE_PREFIX);
         return;
      }

      expect(socketPath.endsWith('/a11ied-drv_123456789abc.sock')).toBe(true);
      expect(socketPath.length).toBeLessThan(UNIX_SOCKET_PATH_MAX);
   });

   it(
      'cleans up stale session metadata for dead brokers',
      () =>
         withStateDir(tempRoots, async () => {
            const started = await startVirtualSession();
            const stopped = await stopDriverSession();

            expect(stopped.session.sessionId).toBe(started.session.sessionId);
            expect(await cleanupStaleDriverSessions()).toEqual([]);
         }),
      TIMEOUT_MS,
   );

   it(
      'fails fast when persistent recording is unsupported',
      () =>
         withStateDir(tempRoots, async () => {
            await expect(
               startDriverSession({
                  target: 'virtual',
                  mode: 'in-process',
                  recordingPath: './recordings/session.mov',
               }),
            ).rejects.toMatchObject({
               code: 'recording-target-unsupported',
            } satisfies Partial<CliEnvironmentError>);
         }),
      TIMEOUT_MS,
   );
});

describe('driver runtime execution', () => {
   it(
      'runs persistent and ephemeral driver actions against the virtual target',
      () =>
         withStateDir(tempRoots, async () => {
            await startVirtualSession();
            await runAndVerifyDriverActions();

            const ephemeral = await runEphemeralDriverAction({
               target: 'virtual',
               request: { action: 'next' },
            });
            expect(ephemeral.action).toBe('next');
            expect(ephemeral.session.sessionId).toMatch(/^ephemeral_/);

            await stopDriverSession();
         }),
      TIMEOUT_MS,
   );
});

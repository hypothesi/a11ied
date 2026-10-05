import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionRecordingSchema } from '@a11ied/contracts';
import * as sessionUtils from './session-utils.js';
import { listInProcessSessionIds, requestInProcess } from './runtime-internal.js';
import { createDriverSessionContext } from './session-context.js';
import * as sessionContext from './session-context.js';
import { createVirtualContextFixture } from './test-fixtures.js';
import * as guidepup from '@a11ied/guidepup';
import { driverCapabilities, isVoiceOverRunning } from '@a11ied/guidepup';
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
   setVoiceOverLivenessCheckerForTesting,
   startDriverSession,
   stopDriverSession,
} from '../index.js';
import {
   readActiveSessionMetadata,
   removeSessionArtifacts,
   removeSessionArtifactsSync,
   writeSessionMetadata,
} from './session-utils.js';

const TIMEOUT_MS = 15_000,
   UNIX_SOCKET_PATH_MAX = 104;
const WINDOWS_PIPE_PREFIX = String.raw`\\.\pipe\a11ied-`;
const tempRoots: string[] = [];
const COMPLETED_RECORDING = sessionRecordingSchema.parse({
   path: '/tmp/fixture.mov',
   format: 'mov',
   status: 'completed',
   startedAt: '2026-10-01T00:00:00.000Z',
   stoppedAt: '2026-10-01T00:00:01.000Z',
});

afterEach(async () => {
   vi.restoreAllMocks();
   setVoiceOverLivenessCheckerForTesting(isVoiceOverRunning);
   await Promise.all(
      listInProcessSessionIds().map((sessionId) =>
         requestInProcess(sessionId, { command: 'stop' }),
      ),
   );
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

describe('session startup persistence', () => {
   it('stops the adapter when initial observation fails', async () => {
      const adapter = guidepup.createDriverAdapter('virtual'),
         stop = vi.spyOn(adapter, 'stop');
      vi.spyOn(guidepup, 'createDriverAdapter').mockReturnValue(adapter);
      vi.spyOn(adapter, 'readState').mockRejectedValue(new Error('Observation failed'));

      await expect(
         createDriverSessionContext({
            target: 'voiceover',
            sessionId: 'failed-start',
            metadataFile: 'in-memory://failed-start',
            socketPath: 'in-memory://failed-start',
            persist: false,
         }),
      ).rejects.toThrow('Observation failed');

      expect(stop).toHaveBeenCalledTimes(1);
   });

   it('stops and removes an in-process session after its first metadata write fails', async () => {
      await withStateDir(tempRoots, async () => {
         const finish = vi
               .fn<() => Promise<typeof COMPLETED_RECORDING>>()
               .mockResolvedValue(COMPLETED_RECORDING),
            fixture = await createVirtualContextFixture('failed-metadata');
         fixture.context.finishRecording = finish;
         fixture.context.session.metadataFile = getActiveSessionFile();
         fixture.context.session.socketPath = sessionUtils.getInMemorySocketPath(
            fixture.context.session.sessionId,
         );
         vi.spyOn(sessionContext, 'createDriverSessionContext').mockImplementation(
            async (options) => {
               fixture.context.session.sessionId = options.sessionId;
               return fixture;
            },
         );
         vi.spyOn(sessionUtils, 'writeRecoveryMetadata').mockRejectedValue(
            new Error('Disk unavailable'),
         );

         await expect(startVirtualSession()).rejects.toThrow('Disk unavailable');

         expect(finish).toHaveBeenCalledTimes(1);

         expect(listInProcessSessionIds()).to.eql([]);
         expect(await getActiveDriverSession()).toBeUndefined();
      });
   });
});

describe('session artifact ownership', () => {
   it('preserves replacement metadata when old cleanup runs again', async () => {
      await withStateDir(tempRoots, async () => {
         const first = await startVirtualSession();
         await stopDriverSession();
         const replacement = await startVirtualSession();
         await removeSessionArtifacts(first.session);
         removeSessionArtifactsSync(first.session);
         const active = await readActiveSessionMetadata();

         expect(active?.sessionId).toStrictEqual(replacement.session.sessionId);
         await stopDriverSession();
      });
   });
});

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

describe('driver runtime voiceover liveness', () => {
   it(
      'detects when VoiceOver is manually stopped and clears the active session',
      () =>
         withStateDir(tempRoots, async (stateDir) => {
            const sessionFile = resolve(stateDir, 'session.json'),
               sessionId = 'drv_vo_manual_stop_test';
            const mockSession = {
               sessionId,
               target: 'voiceover' as const,
               targetType: 'real' as const,
               startedAt: new Date().toISOString(),
               capabilities: driverCapabilities,
               logCursor: 0,
               metadataFile: sessionFile,
               socketPath: getDriverSocketPath(sessionId),
               brokerPid: process.pid,
            };

            await writeSessionMetadata(mockSession);

            expect(await readActiveSessionMetadata()).toBeDefined();

            setVoiceOverLivenessCheckerForTesting(async () => false);
            const active = await getActiveDriverSession();

            expect(active).toBeUndefined();
            expect(await readActiveSessionMetadata()).toBeUndefined();
         }),
      TIMEOUT_MS,
   );
});

describe('driver runtime execution', () => {
   it('finishes recording after an ephemeral action fails', async () => {
      const finish = vi
            .fn<() => Promise<typeof COMPLETED_RECORDING>>()
            .mockResolvedValue(COMPLETED_RECORDING),
         fixture = await createVirtualContextFixture('failed-ephemeral');
      fixture.context.finishRecording = finish;
      vi.spyOn(sessionContext, 'createDriverSessionContext').mockResolvedValue(fixture);
      vi.spyOn(fixture.adapter, 'performPortable').mockRejectedValueOnce(
         new Error('Action failed'),
      );
      const stop = vi.spyOn(fixture.adapter, 'stop');

      await expect(
         runEphemeralDriverAction({ target: 'virtual', request: { action: 'next' } }),
      ).rejects.toThrow('Action failed');

      expect(finish).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
   });

   it(
      'preserves the persistent virtual reader when an ephemeral reader conflicts',
      () =>
         withStateDir(tempRoots, async () => {
            await startVirtualSession();
            await runAndVerifyDriverActions();

            await expect(
               runEphemeralDriverAction({
                  target: 'virtual',
                  request: { action: 'next' },
               }),
            ).rejects.toMatchObject({ code: 'virtual-session-conflict' });

            await runAndVerifyDriverActions();
            await stopDriverSession();

            const ephemeral = await runEphemeralDriverAction({
               target: 'virtual',
               request: { action: 'next' },
            });

            expect(ephemeral.action).toBe('next');
            expect(ephemeral.session.sessionId).toMatch(/^ephemeral_/);
         }),
      TIMEOUT_MS,
   );
});

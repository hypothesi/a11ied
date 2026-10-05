import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionRecordingSchema } from '@a11ied/contracts';
import * as guidepup from '@a11ied/guidepup';
import type { DriverAdapter } from '@a11ied/guidepup';
import { cleanupTempRoots, withStateDir } from '../../../cli/src/testing/fixtures.js';
import * as sessionContext from './session-context.js';
import * as sessionUtils from './session-utils.js';
import {
   startInProcessSession,
   hasInProcessSession,
   listInProcessSessionIds,
   requestInProcess,
} from './runtime-internal.js';
import {
   getActiveDriverSession,
   runEphemeralDriverAction,
   stopDriverSession,
   startDriverSession,
} from './runtime.js';
import { createVirtualContextFixture } from './test-fixtures.js';
import { createBrokerServer, shutdownServer } from './broker-server.js';
import { connectToBroker, waitForBroker } from './broker-client.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';
import { screenReader } from './screen-reader-node.js';

const BROKER_WAIT_MS = 5000;
const tempRoots: string[] = [];
const adapters: DriverAdapter[] = [];
const COMPLETED_RECORDING = sessionRecordingSchema.parse({
   path: '/tmp/recovery-fixture.mov',
   format: 'mov',
   status: 'completed',
   startedAt: '2026-10-01T00:00:00.000Z',
   stoppedAt: '2026-10-01T00:00:01.000Z',
});

afterEach(async () => {
   vi.restoreAllMocks();
   await Promise.all(
      listInProcessSessionIds().map((sessionID) =>
         requestInProcess(sessionID, { command: 'stop' }),
      ),
   );
   await Promise.all(adapters.splice(0).map((adapter) => adapter.stop()));
   await cleanupTempRoots(tempRoots);
});

async function createContext(
   sessionID: string,
): ReturnType<typeof createVirtualContextFixture> {
   const fixture = await createVirtualContextFixture(sessionID);
   adapters.push(fixture.adapter);
   return fixture;
}

describe('startup recovery owners', () => {
   it('retains failed startup and permits public stop to finish recorder cleanup', async () => {
      await withStateDir(tempRoots, async () => {
         const adapter = guidepup.createDriverAdapter('virtual'),
            create = sessionContext.createDriverSessionContext,
            stop = vi
               .fn<() => Promise<typeof COMPLETED_RECORDING>>()
               .mockRejectedValueOnce(new Error('Recorder busy'))
               .mockResolvedValue(COMPLETED_RECORDING);
         vi.spyOn(guidepup, 'createDriverAdapter').mockReturnValue(adapter);
         vi.spyOn(adapter, 'readState').mockRejectedValueOnce(
            new Error('Initial observation failed'),
         );
         vi.spyOn(sessionContext, 'createDriverSessionContext').mockImplementation(
            async (options) =>
               create({ ...options, recording: { metadata: COMPLETED_RECORDING, stop } }),
         );
         const readerStop = vi.spyOn(adapter, 'stop');

         await expect(
            startInProcessSession({
               target: 'voiceover',
               sessionId: 'drv_startup_recovery',
            }),
         ).rejects.toMatchObject({
            code: 'session-cleanup-failed',
            details: {
               sessionId: 'drv_startup_recovery',
               failures: [
                  { code: 'broker-error', message: 'Initial observation failed' },
                  { code: 'broker-error', message: 'Recorder busy' },
               ],
            },
         });
         const retained = await getActiveDriverSession();

         expect(retained?.sessionId).toStrictEqual('drv_startup_recovery');
         expect(readerStop).not.toHaveBeenCalled();
         await stopDriverSession({ sessionId: 'drv_startup_recovery' });

         expect(stop.mock.calls).to.eql([[], []]);
         expect(readerStop).toHaveBeenCalledTimes(1);
         expect(hasInProcessSession('drv_startup_recovery')).toStrictEqual(false);
      });
   });
});

describe('metadata recovery owners', () => {
   it('does not replace another owner when publishing or removing recovery metadata', async () => {
      await withStateDir(tempRoots, async () => {
         const owner = await createContext('drv_owner');
         owner.context.session.metadataFile = sessionUtils.getActiveSessionFile();
         const recovery = {
            ...owner.context.session,
            sessionId: 'drv_recovery',
            socketPath: 'in-memory://drv_recovery',
         };
         try {
            await sessionUtils.writeSessionMetadata(owner.context.session);
            await sessionUtils.writeRecoveryMetadata(recovery);
            await sessionUtils.removeSessionArtifacts(recovery);
            const active = await sessionUtils.readActiveSessionMetadata();

            expect(active?.sessionId).toStrictEqual('drv_owner');
         } finally {
            await owner.adapter.stop();
         }
      });
   });

   it('keeps a public owner when metadata and cleanup both fail', async () => {
      await withStateDir(tempRoots, async () => {
         const fixture = await createContext('drv_metadata_recovery');
         fixture.context.session.metadataFile = sessionUtils.getActiveSessionFile();
         vi.spyOn(sessionContext, 'createDriverSessionContext').mockResolvedValue(
            fixture,
         );
         const publish = vi
               .spyOn(sessionUtils, 'writeRecoveryMetadata')
               .mockRejectedValue(new Error('Disk unavailable')),
            stop = vi
               .spyOn(fixture.adapter, 'stop')
               .mockRejectedValueOnce(new Error('Reader busy'));

         await expect(
            startInProcessSession({
               target: 'virtual',
               sessionId: 'drv_metadata_recovery',
            }),
         ).rejects.toMatchObject({ code: 'session-cleanup-failed' });
         const retained = await getActiveDriverSession();

         expect(retained?.sessionId).toStrictEqual('drv_metadata_recovery');
         expect(await sessionUtils.readActiveSessionMetadata()).toBeUndefined();
         publish.mockResolvedValue();
         await stopDriverSession({ sessionId: 'drv_metadata_recovery' });

         expect(stop.mock.calls).to.eql([[], []]);
         expect(hasInProcessSession('drv_metadata_recovery')).toStrictEqual(false);
      });
   });
});
describe('library recovery owners', () => {
   it('retains failed disposal and removes the owner after a library stop retry', async () => {
      await withStateDir(tempRoots, async () => {
         const fixture = await createContext('test_disposal_recovery');
         vi.spyOn(sessionContext, 'createDriverSessionContext').mockResolvedValue(
            fixture,
         );
         const adapterStop = vi
               .spyOn(fixture.adapter, 'stop')
               .mockRejectedValueOnce(new Error('Reader busy')),
            reader = await screenReader();

         await expect(reader.stop()).rejects.toMatchObject({
            code: 'session-cleanup-failed',
            details: { failures: [{ code: 'broker-error', message: 'Reader busy' }] },
         });

         expect(hasInProcessSession('test_disposal_recovery')).toStrictEqual(true);
         await reader.stop();

         expect(adapterStop.mock.calls).to.eql([[], []]);
         expect(hasInProcessSession('test_disposal_recovery')).toStrictEqual(false);
         expect(await getActiveDriverSession()).toBeUndefined();
      });
   });

   it('refuses replacement while preserving the existing owner', async () => {
      await withStateDir(tempRoots, async () => {
         const started = await startDriverSession({
            target: 'virtual',
            mode: 'in-process',
         });

         await expect(
            startDriverSession({
               target: 'virtual',
               mode: 'in-process',
               replaceActive: false,
            }),
         ).rejects.toMatchObject({ code: 'session-already-active' });

         expect(hasInProcessSession(started.session.sessionId)).toStrictEqual(true);
         const active = await getActiveDriverSession();

         expect(active?.sessionId).toStrictEqual(started.session.sessionId);
         await stopDriverSession();
      });
   });
});

describe('ephemeral recovery owners', () => {
   it('retains a failed action until public stop confirms cleanup', async () => {
      await withStateDir(tempRoots, async () => {
         const finish = vi
               .fn<() => Promise<typeof COMPLETED_RECORDING>>()
               .mockRejectedValueOnce(new Error('Recorder busy'))
               .mockResolvedValue(COMPLETED_RECORDING),
            fixture = await createContext('ephemeral_recovery');
         fixture.context.finishRecording = finish;
         vi.spyOn(sessionContext, 'createDriverSessionContext').mockResolvedValue(
            fixture,
         );
         vi.spyOn(fixture.adapter, 'performPortable').mockRejectedValue(
            new Error('Action failed'),
         );
         const stop = vi.spyOn(fixture.adapter, 'stop');

         await expect(
            runEphemeralDriverAction({ target: 'virtual', request: { action: 'next' } }),
         ).rejects.toMatchObject({ code: 'session-cleanup-failed' });

         expect(stop).not.toHaveBeenCalled();
         await stopDriverSession({ sessionId: 'ephemeral_recovery' });

         expect(stop).toHaveBeenCalledTimes(1);
         expect(await getActiveDriverSession()).toBeUndefined();
      });
   });
});

describe('broker startup recovery', () => {
   it('polls the prebound endpoint until startup finishes', async () => {
      await withStateDir(tempRoots, async () => {
         const { context } = await createContext(sessionUtils.createSessionId());
         context.session.socketPath = sessionUtils.getDriverSocketPath(
            context.session.sessionId,
         );
         let ready = false;
         const server = createBrokerServer({
            context: () => (ready ? context : undefined),
            onStop: vi.fn(),
            onActivity: vi.fn(),
         });
         server.listen(context.session.socketPath);
         await once(server, 'listening');
         try {
            const waiting = waitForBroker({
               sessionId: context.session.sessionId,
               readSession: sessionUtils.readActiveSessionMetadata,
               timeoutMs: BROKER_WAIT_MS,
            });
            const pending = await connectToBroker(context.session.socketPath, {
               command: 'ping',
            });

            expect(pending).toMatchObject({
               ok: false,
               error: { code: 'session-starting' },
            });
            ready = true;

            const started = await waiting;

            expect(started.sessionId).toStrictEqual(context.session.sessionId);
         } finally {
            await shutdownServer(server, async () => context.adapter.stop());
            await sessionUtils.removeSessionArtifacts(context.session);
         }
      });
   });
});
describe('broker startup failure recovery', () => {
   it('reports startup failure without metadata and keeps its stop endpoint', async () => {
      await withStateDir(tempRoots, async () => {
         const { context } = await createContext(sessionUtils.createSessionId());
         context.session.socketPath = sessionUtils.getDriverSocketPath(
            context.session.sessionId,
         );
         context.session.metadataFile = sessionUtils.getActiveSessionFile();
         context.stopping = true;
         context.startupError = new CliEnvironmentError(
            'session-startup-cleanup-failed',
            'Startup failed',
            {
               sessionId: context.session.sessionId,
            },
         );
         const server = createBrokerServer({
            context,
            onStop: vi.fn(),
            onActivity: vi.fn(),
         });
         server.listen(context.session.socketPath);
         await once(server, 'listening');
         try {
            await expect(
               waitForBroker({
                  sessionId: context.session.sessionId,
                  readSession: sessionUtils.readActiveSessionMetadata,
                  timeoutMs: BROKER_WAIT_MS,
               }),
            ).rejects.toMatchObject({
               code: 'session-startup-cleanup-failed',
               details: { sessionId: context.session.sessionId },
            });
            const stopped = await connectToBroker(context.session.socketPath, {
               command: 'stop',
            });

            expect(stopped.ok).toStrictEqual(true);
            expect(context.resourcesStopped).toStrictEqual(true);
         } finally {
            await shutdownServer(server, async () => context.adapter.stop());
            await sessionUtils.removeSessionArtifacts(context.session);
         }
      });
   });
});

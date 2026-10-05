import { afterEach, describe, expect, it, vi } from 'vitest';

import { CliEnvironmentError } from '#core';

import { createMockDriveSession } from './recording-fixtures.js';
import { getCLIDriverMode } from '../lib/execute.js';
import {
   EXIT_ENVIRONMENT,
   EXIT_SUCCESS,
   TEST_TIMEOUT_SHORT,
   parseJsonOutput,
   runCliInProcess,
   useTestServer,
   withStateDir,
} from './setup.js';

const coreMocks = vi.hoisted(() => ({
   getActiveDriverSessionMock: vi.fn(),
   getDriverSessionStatusMock: vi.fn(),
   openUrlInBrowserMock: vi.fn(),
   runDriverSessionActionMock: vi.fn(),
   startDriverSessionMock: vi.fn(),
   stopDriverSessionMock: vi.fn(),
   waitForWindowFocusMock: vi.fn(),
}));

vi.mock('#core', async () => {
   const actual = await vi.importActual('#core');

   return {
      ...actual,
      getActiveDriverSession: coreMocks.getActiveDriverSessionMock,
      getDriverSessionStatus: coreMocks.getDriverSessionStatusMock,
      openUrlInBrowser: coreMocks.openUrlInBrowserMock,
      runDriverSessionAction: coreMocks.runDriverSessionActionMock,
      startDriverSession: coreMocks.startDriverSessionMock,
      stopDriverSession: coreMocks.stopDriverSessionMock,
      waitForWindowFocus: coreMocks.waitForWindowFocusMock,
   };
});

const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);

afterEach(() => {
   vi.unstubAllEnvs();
   for (const mock of Object.values(coreMocks)) {
      mock.mockReset();
   }
});

async function runDriveRecordingSmoke(stateDir: string): Promise<void> {
   coreMocks.startDriverSessionMock.mockResolvedValueOnce({
      session: createMockDriveSession(stateDir),
   });

   const result = await runCliInProcess([
      'sr',
      'start',
      '--sr',
      'voiceover',
      '--recording',
      './recordings/voiceover.mov',
      '--json',
   ]);

   const json = parseJsonOutput(result.stdout);

   expect(result.status).toBe(EXIT_SUCCESS);
   expect(coreMocks.startDriverSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
         target: 'voiceover',
         mode: 'broker',
         recordingPath: './recordings/voiceover.mov',
      }),
   );
   expect(
      (json.result as { session: { recording: { path: string } } }).session.recording
         .path,
   ).toContain('recordings/voiceover.mov');
}

describe('cli recording flag wiring', () => {
   it('keeps native owners outside a one-shot CLI even with the in-process environment override', () => {
      vi.stubEnv('A11IED_DRIVER_MODE', 'in-process');

      expect(getCLIDriverMode('voiceover')).toStrictEqual('broker');
      expect(getCLIDriverMode('nvda')).toStrictEqual('broker');
      expect(getCLIDriverMode('virtual')).toStrictEqual('in-process');
   });

   it(
      'passes recording through sr start',
      () => withStateDir(tempRoots, runDriveRecordingSmoke),
      TEST_TIMEOUT_SHORT,
   );
});

describe('real screen reader safety gates', () => {
   it('propagates typed core startup focus failures', async () => {
      coreMocks.startDriverSessionMock.mockRejectedValueOnce(
         new CliEnvironmentError(
            'browser-focus-unconfirmed',
            'Browser focus was unconfirmed.',
         ),
      );

      const result = await runCliInProcess([
         'sr',
         'start',
         `${testServer.getBaseUrl()}/basic-page.html`,
         '--sr',
         'voiceover',
         '--json',
      ]);
      const json = parseJsonOutput(result.stdout);

      expect(result.status).toBe(EXIT_ENVIRONMENT);
      expect((json.errors as Array<{ code: string }>)[0]?.code).toBe(
         'browser-focus-unconfirmed',
      );
      expect(coreMocks.startDriverSessionMock).toHaveBeenCalledWith(
         expect.objectContaining({
            target: 'voiceover',
            url: `${testServer.getBaseUrl()}/basic-page.html`,
         }),
      );
      expect(coreMocks.openUrlInBrowserMock).not.toHaveBeenCalled();
   });
});

describe('started real screen reader safety gates', () => {
   it('delegates timed startup and cleanup to core', async () => {
      coreMocks.startDriverSessionMock.mockRejectedValueOnce(
         new CliEnvironmentError(
            'browser-focus-unconfirmed',
            'Reader startup could not confirm browser focus.',
         ),
      );

      const result = await runCliInProcess([
         'sr',
         'start',
         `${testServer.getBaseUrl()}/basic-page.html`,
         '--sr',
         'voiceover',
         '--timeout',
         '1000',
         '--json',
      ]);
      const json = parseJsonOutput(result.stdout);

      expect(result.status).toBe(EXIT_ENVIRONMENT);
      expect((json.errors as Array<{ code: string }>)[0]?.code).toBe(
         'browser-focus-unconfirmed',
      );
      expect(coreMocks.startDriverSessionMock).toHaveBeenCalledWith(
         expect.objectContaining({ timeoutMs: 1000 }),
      );
      expect(coreMocks.stopDriverSessionMock).not.toHaveBeenCalled();
   });
});

describe('real screen reader walk safety gates', () => {
   it('rejects an empty transcript from a real reader walk', async () => {
      const session = createMockDriveSession('/tmp/a11ied-test');
      coreMocks.getActiveDriverSessionMock.mockResolvedValueOnce(session);
      coreMocks.getDriverSessionStatusMock.mockResolvedValueOnce({
         session,
         state: { transcript: [] },
      });
      coreMocks.runDriverSessionActionMock
         .mockResolvedValueOnce({ session, state: { transcript: [] } })
         .mockResolvedValueOnce({ session, state: { transcript: [] } });

      const result = await runCliInProcess(['sr', 'walk', '--sr', 'voiceover', '--json']);
      const json = parseJsonOutput(result.stdout);

      expect(result.status).toBe(EXIT_ENVIRONMENT);
      expect((json.errors as Array<{ code: string }>)[0]?.code).toBe(
         'screen-reader-empty-transcript',
      );
   });
});

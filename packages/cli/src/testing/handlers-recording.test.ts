import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockDriveSession } from './recording-fixtures.js';
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
         mode: 'in-process',
         recordingPath: './recordings/voiceover.mov',
      }),
   );
   expect(
      (json.result as { session: { recording: { path: string } } }).session.recording
         .path,
   ).toContain('recordings/voiceover.mov');
}

describe('cli recording flag wiring', () => {
   it(
      'passes recording through sr start',
      () => withStateDir(tempRoots, runDriveRecordingSmoke),
      TEST_TIMEOUT_SHORT,
   );
});

describe('real screen reader safety gates', () => {
   it('does not start the reader when the browser cannot be focused', async () => {
      coreMocks.openUrlInBrowserMock.mockResolvedValueOnce({
         focusTarget: { appName: 'Chromium' },
      });
      coreMocks.waitForWindowFocusMock.mockResolvedValueOnce({
         focused: false,
         frontmost: { appName: 'Terminal' },
         waitedMs: 5000,
      });

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
      expect(coreMocks.startDriverSessionMock).not.toHaveBeenCalled();
   });
});

describe('started real screen reader safety gates', () => {
   it('stops a reader that takes focus away from the browser', async () => {
      const session = createMockDriveSession('/tmp/a11ied-test');
      coreMocks.openUrlInBrowserMock.mockResolvedValueOnce({
         focusTarget: { appName: 'Chromium' },
      });
      coreMocks.waitForWindowFocusMock
         .mockResolvedValueOnce({ focused: true, waitedMs: 0 })
         .mockResolvedValueOnce({
            focused: false,
            frontmost: { appName: 'Terminal' },
            waitedMs: 5000,
         });
      coreMocks.startDriverSessionMock.mockResolvedValueOnce({ session });
      coreMocks.runDriverSessionActionMock.mockResolvedValueOnce({
         session,
         state: { transcript: [] },
      });
      coreMocks.stopDriverSessionMock.mockResolvedValueOnce({
         session,
         state: { transcript: [] },
      });

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
      expect(coreMocks.stopDriverSessionMock).toHaveBeenCalledWith({ timeoutMs: 1000 });
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

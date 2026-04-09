import { afterEach, describe, expect, it, vi } from 'vitest';

import {
   createMockDriveSession,
   createMockPatternResult,
   createMockVerifyCriterionReport,
} from './recording-fixtures.js';
import {
   type TestServerHandle,
   EXIT_SUCCESS,
   TEST_TIMEOUT_SHORT,
   parseJsonOutput,
   runCliInProcess,
   useTestServer,
   withTempDir,
} from './setup.js';

const coreMocks = vi.hoisted(() => ({
   startDriverSessionMock: vi.fn(),
   runInteractionPatternMock: vi.fn(),
   verifyCriterionMock: vi.fn(),
}));

vi.mock('#core', async () => {
   const actual = await vi.importActual('#core');

   return {
      ...actual,
      startDriverSession: coreMocks.startDriverSessionMock,
      runInteractionPattern: coreMocks.runInteractionPatternMock,
      verifyCriterion: coreMocks.verifyCriterionMock,
   };
});

const tempRoots: string[] = [];
const testServer: TestServerHandle = useTestServer(tempRoots);

afterEach(() => {
   coreMocks.startDriverSessionMock.mockReset();
   coreMocks.runInteractionPatternMock.mockReset();
   coreMocks.verifyCriterionMock.mockReset();
});

async function runDriveRecordingSmoke(): Promise<void> {
   coreMocks.startDriverSessionMock.mockResolvedValueOnce(
      createMockDriveSession(process.cwd()),
   );

   const result = await runCliInProcess([
      'drive',
      'start',
      '--target',
      'voiceover',
      '--recording',
      './recordings/voiceover.mov',
      '--json',
   ]);

   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect(coreMocks.startDriverSessionMock).toHaveBeenCalledWith(
      'voiceover',
      process.cwd(),
      './recordings/voiceover.mov',
   );
   expect(
      (json.result as { session: { recording: { path: string } } }).session.recording
         .path,
   ).toContain('recordings/voiceover.mov');
}

async function runManagedRecordingSmoke(baseUrl: string): Promise<void> {
   coreMocks.runInteractionPatternMock.mockResolvedValueOnce(
      createMockPatternResult(baseUrl, process.cwd()),
   );
   coreMocks.verifyCriterionMock.mockResolvedValueOnce(
      createMockVerifyCriterionReport(baseUrl, process.cwd()),
   );

   const patternResult = await runCliInProcess([
      'run',
      'pattern',
      'landmark_sequence',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--target',
      'voiceover',
      '--recording',
      './recordings/pattern.mov',
      '--json',
   ]);
   const verifyResult = await runCliInProcess([
      'verify',
      'criterion',
      '4.1.3',
      '--url',
      `${baseUrl}/status-message.html`,
      '--target',
      'voiceover',
      '--recording',
      './recordings/verify.mov',
      '--json',
   ]);

   expect(patternResult.status).toBe(EXIT_SUCCESS);
   expect(verifyResult.status).toBe(EXIT_SUCCESS);
   expect(coreMocks.runInteractionPatternMock).toHaveBeenCalledWith(
      expect.objectContaining({
         recordingPath: './recordings/pattern.mov',
      }),
   );
   expect(coreMocks.verifyCriterionMock).toHaveBeenCalledWith(
      expect.objectContaining({
         recordingPath: './recordings/verify.mov',
      }),
   );
}

describe('cli recording flag wiring', () => {
   it(
      'passes recording through drive start',
      () => withTempDir(tempRoots, runDriveRecordingSmoke),
      TEST_TIMEOUT_SHORT,
   );

   it(
      'passes recording through run pattern and verify criterion',
      () =>
         withTempDir(tempRoots, async () =>
            runManagedRecordingSmoke(testServer.getBaseUrl()),
         ),
      TEST_TIMEOUT_SHORT,
   );
});

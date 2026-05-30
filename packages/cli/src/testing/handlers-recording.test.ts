import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockDriveSession } from './recording-fixtures.js';
import {
   EXIT_SUCCESS,
   TEST_TIMEOUT_SHORT,
   parseJsonOutput,
   runCliInProcess,
   withTempDir,
} from './setup.js';

const coreMocks = vi.hoisted(() => ({
   startDriverSessionMock: vi.fn(),
}));

vi.mock('#core', async () => {
   const actual = await vi.importActual('#core');

   return {
      ...actual,
      startDriverSession: coreMocks.startDriverSessionMock,
   };
});

const tempRoots: string[] = [];

afterEach(() => {
   coreMocks.startDriverSessionMock.mockReset();
});

async function runDriveRecordingSmoke(): Promise<void> {
   coreMocks.startDriverSessionMock.mockResolvedValueOnce(
      createMockDriveSession(process.cwd()),
   );

   const result = await runCliInProcess([
      'sr',
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

describe('cli recording flag wiring', () => {
   it(
      'passes recording through sr start',
      () => withTempDir(tempRoots, runDriveRecordingSmoke),
      TEST_TIMEOUT_SHORT,
   );
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockDriveSession } from './recording-fixtures.js';
import {
   EXIT_SUCCESS,
   TEST_TIMEOUT_SHORT,
   parseJsonOutput,
   runCliInProcess,
   withStateDir,
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

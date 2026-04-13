import { afterEach, describe, expect, it, vi } from 'vitest';

import { expectReadyCommands } from './release-test-helpers.js';

const childProcessMocks = vi.hoisted(() => ({
   spawnSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
   spawnSync: childProcessMocks.spawnSync,
   execFile: vi.fn(),
}));

const EXPECTED_TARGET_COUNT = 3;
const VIRTUAL_TARGET_INDEX = 2;

afterEach(() => {
   childProcessMocks.spawnSync.mockReset();
});

function createSpawnResult(
   status: number,
   stdout = '',
): {
   error: undefined;
   status: number;
   stderr: string;
   stdout: string;
} {
   return {
      error: undefined,
      status,
      stderr: '',
      stdout,
   };
}

function mockSpawnForReadyDoctor(): void {
   childProcessMocks.spawnSync.mockImplementation((command: string, args: string[]) => {
      if (command === '/usr/sbin/screencapture') {
         return createSpawnResult(0);
      }
      if (command === 'which' && args[0] === 'google-chrome-stable') {
         return createSpawnResult(0, '/usr/bin/google-chrome-stable\n');
      }
      return createSpawnResult(1);
   });
}

function mockSpawnForFailingRecordingProbe(): void {
   childProcessMocks.spawnSync.mockImplementation((command: string) => {
      if (command === '/usr/sbin/screencapture') {
         return createSpawnResult(1);
      }
      return createSpawnResult(1);
   });
}

describe('core scaffolding', () => {
   it('returns the supported target matrix', async () => {
      mockSpawnForReadyDoctor();
      const { listSupportedTargets } = await import('./index.js');
      const targets = listSupportedTargets();

      expect(targets).toHaveLength(EXPECTED_TARGET_COUNT);
      expect(targets.map((target) => target.platform)).toEqual([
         'voiceover',
         'nvda',
         'virtual',
      ]);
      expect(
         targets[0]?.notes.some((note: string) =>
            note.includes('native macOS video capture'),
         ),
      ).toBe(true);
   });

   it('returns only shipped ready command families in the CLI catalog data', async () => {
      mockSpawnForFailingRecordingProbe();
      const { createDoctorReport, listCliCommands } = await import('./index.js');
      const commands = listCliCommands();
      const report = createDoctorReport();

      expectReadyCommands(commands);
      expect(report.browserAutomation.policyName).toBe('system-browser-first');
      expect(report.browserAutomation.installCommand).toBe(
         'npx playwright install chromium',
      );
      expect(report.targets[VIRTUAL_TARGET_INDEX]?.status).toBe('ready');
      expect(report.targets[0]?.notes).toContain(
         'Recording probe failed: screencapture exited with code 1 without writing a movie file.',
      );
   });
});

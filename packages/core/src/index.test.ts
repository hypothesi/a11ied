import { afterEach, describe, expect, it, vi } from 'vitest';

const childProcessMocks = vi.hoisted(() => ({
   spawnSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
   spawnSync: childProcessMocks.spawnSync,
}));

const EXPECTED_TARGET_COUNT = 3;
const VIRTUAL_TARGET_INDEX = 2;

afterEach(() => {
   childProcessMocks.spawnSync.mockReset();
});

describe('core scaffolding', () => {
   it('returns the supported target matrix', async () => {
      childProcessMocks.spawnSync.mockReturnValue({
         error: undefined,
         status: 0,
         stderr: '',
      });
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
      childProcessMocks.spawnSync.mockReturnValue({
         error: undefined,
         status: 1,
         stderr: '',
      });
      const { createDoctorReport, listCliCommands } = await import('./index.js');
      const commands = listCliCommands();

      expect(commands.map((command) => command.name)).toEqual([
         'wcag',
         'inspect',
         'drive',
         'doctor',
         'run',
         'verify',
         'mcp',
      ]);
      expect(commands.every((command) => command.maturity === 'ready')).toBe(true);
      expect(createDoctorReport().targets[VIRTUAL_TARGET_INDEX]?.status).toBe('ready');
      expect(createDoctorReport().targets[0]?.notes).toContain(
         'Recording probe failed: screencapture exited with code 1 without writing a movie file.',
      );
   });
});

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWindowsRecording } from './recording.js';

const mocks = vi.hoisted(() => ({
   execute: vi.fn(),
   loader: Object.assign(vi.fn().mockReturnValue('/fixture/ffmpeg.exe'), {
      resolve: vi.fn().mockReturnValue('/fixture/record.js'),
   }),
}));

vi.mock('node:child_process', () => ({ spawnSync: mocks.execute }));
vi.mock('node:fs', () => ({ existsSync: vi.fn() }));
vi.mock('node:module', () => ({ createRequire: vi.fn().mockReturnValue(mocks.loader) }));

afterEach(() => vi.clearAllMocks());

describe('Windows recording prerequisite', () => {
   it('refuses a missing recorder binary without executing it', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const check = checkWindowsRecording();

      expect(check.status).toStrictEqual('fail');
      expect(check.detail).toContain('binary is missing');
      expect(spawnSync).not.toHaveBeenCalled();
   });

   it('checks execution without capturing the desktop', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mocks.execute.mockReturnValue({ stdout: 'ffmpeg version 6.1\n', status: 0 });
      const check = checkWindowsRecording();

      expect(check.status).toStrictEqual('pass');
      expect(spawnSync).toHaveBeenCalledWith(
         '/fixture/ffmpeg.exe',
         ['-version'],
         expect.objectContaining({ encoding: 'utf8' }),
      );
   });

   it('reports an execution failure instead of returning ready', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mocks.execute.mockReturnValue({ error: new Error('Recorder cannot execute') });
      const check = checkWindowsRecording();

      expect(check.status).toStrictEqual('fail');
      expect(check.detail).toStrictEqual('Recorder cannot execute');
   });
});

import { execFile } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import { focusExecFile } from './focus-shared.js';

vi.mock('node:child_process', () => ({
   // The callback is the last argument. The promisified helper resolves with its value.
   execFile: vi.fn((...args: unknown[]) => {
      const callback = args.at(-1);

      if (typeof callback === 'function') {
         callback(undefined, { stdout: 'focused', stderr: '' });
      }
   }),
}));

describe('focusExecFile', () => {
   it('hides the console window, so a query never takes the foreground itself', async () => {
      const timeout = 5000;

      await focusExecFile('powershell', ['-Command', 'Get-Date'], { timeout });

      expect(vi.mocked(execFile)).toHaveBeenCalledWith(
         'powershell',
         ['-Command', 'Get-Date'],
         expect.objectContaining({ timeout, windowsHide: true }),
         expect.any(Function),
      );
   });
});

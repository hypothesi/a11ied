import { execFile } from 'node:child_process';
import { sendKeys } from '@guidepup/guidepup/lib/windows/sendKeys.js';
import { describe, expect, it, vi } from 'vitest';

import { hideScriptConsoles } from './hidden-script-console.js';

vi.mock('node:child_process', () => ({
   // The callback is the last argument. The promisified helper resolves with its value.
   execFile: vi.fn((...args: unknown[]) => {
      const callback = args.at(-1);

      if (typeof callback === 'function') {
         callback(undefined, { stdout: '', stderr: '' });
      }
   }),
}));

describe('hideScriptConsoles', () => {
   it('types through cscript with its console window hidden', async () => {
      hideScriptConsoles();

      await sendKeys({ characters: 'a' });

      expect(vi.mocked(execFile)).toHaveBeenCalledWith(
         'cscript',
         [expect.stringMatching(/script\.vbs$/)],
         expect.objectContaining({ windowsHide: true }),
         expect.any(Function),
      );
   });
});

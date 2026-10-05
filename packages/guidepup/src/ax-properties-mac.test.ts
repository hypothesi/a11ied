import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryFocusedAxProperties } from './ax-properties-mac.js';
import { focusExecFile } from './focus-shared.js';

vi.mock('./focus-shared.js', () => ({
   focusExecFile: vi.fn(),
   loadPackageScript: vi.fn().mockReturnValue('fixture-script'),
}));

afterEach(() => {
   vi.resetAllMocks();
});

describe('macOS focus query diagnostics', () => {
   it('propagates process failures instead of returning missing focus', async () => {
      vi.mocked(focusExecFile).mockRejectedValue(new Error('osascript timed out'));

      await expect(queryFocusedAxProperties()).rejects.toThrow('osascript timed out');
   });

   it('rejects malformed property records', async () => {
      vi.mocked(focusExecFile).mockResolvedValue({ stdout: 'AXButton', stderr: '' });

      await expect(queryFocusedAxProperties()).rejects.toMatchObject({
         code: 'keyboard-focus-invalid-response',
      });
   });

   it('treats empty output as absent focus', async () => {
      vi.mocked(focusExecFile).mockResolvedValue({ stdout: '\n', stderr: '' });

      expect(await queryFocusedAxProperties()).toBeUndefined();
   });

   it('preserves optional focus properties and their whitespace', async () => {
      vi.mocked(focusExecFile).mockResolvedValue({
         stdout: `${['AXTextField', '', '  Search', '', 'query ', 'false'].join('\u001E')}\n`,
         stderr: '',
      });

      expect(await queryFocusedAxProperties()).to.eql({
         role: 'AXTextField',
         title: '  Search',
         value: 'query ',
         enabled: false,
      });
   });
});

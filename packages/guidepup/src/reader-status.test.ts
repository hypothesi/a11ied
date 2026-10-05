import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusExecFile } from './focus-shared.js';
import { isRealReaderStopped } from './reader-status.js';

vi.mock('./focus-shared.js', () => ({
   FOCUS_COMMAND_TIMEOUT_MS: 5000,
   focusExecFile: vi.fn(),
}));
afterEach(() => {
   vi.unstubAllGlobals();
   vi.resetAllMocks();
});

describe('reader shutdown confirmation', () => {
   it('requires a successful no-match process result on macOS', async () => {
      vi.stubGlobal('process', { ...process, platform: 'darwin' });
      vi.mocked(focusExecFile).mockResolvedValue({ stdout: '123', stderr: '' });

      expect(await isRealReaderStopped('voiceover')).toStrictEqual(false);
      vi.mocked(focusExecFile).mockRejectedValue(
         Object.assign(new Error('No match'), { code: 1 }),
      );

      expect(await isRealReaderStopped('voiceover')).toStrictEqual(true);
      vi.mocked(focusExecFile).mockRejectedValue(
         Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
      );

      expect(await isRealReaderStopped('voiceover')).toStrictEqual(false);
   });

   it('requires an explicit negative NVDA process query on Windows', async () => {
      vi.stubGlobal('process', { ...process, platform: 'win32' });
      vi.mocked(focusExecFile).mockResolvedValue({ stdout: 'false\r\n', stderr: '' });

      expect(await isRealReaderStopped('nvda')).toStrictEqual(true);
      vi.mocked(focusExecFile).mockResolvedValue({ stdout: 'true', stderr: '' });

      expect(await isRealReaderStopped('nvda')).toStrictEqual(false);
      vi.mocked(focusExecFile).mockResolvedValue({ stdout: '', stderr: '' });

      expect(await isRealReaderStopped('nvda')).toStrictEqual(false);
      vi.mocked(focusExecFile).mockRejectedValue(new Error('Query timed out'));

      expect(await isRealReaderStopped('nvda')).toStrictEqual(false);
   });

   it('does not query an unavailable reader platform', async () => {
      vi.stubGlobal('process', { ...process, platform: 'linux' });

      expect(await isRealReaderStopped('voiceover')).toStrictEqual(true);
      expect(await isRealReaderStopped('nvda')).toStrictEqual(true);
      expect(focusExecFile).not.toHaveBeenCalled();
   });
});

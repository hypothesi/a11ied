import { FOCUS_COMMAND_TIMEOUT_MS, focusExecFile } from './focus-shared.js';
import type { RealTarget } from './real-steps.js';

/** A failed or unavailable process query never counts as proof of reader shutdown. */
export async function isRealReaderStopped(target: RealTarget): Promise<boolean> {
   if (target === 'voiceover' && process.platform !== 'darwin') {
      return true;
   }
   if (target === 'nvda' && process.platform !== 'win32') {
      return true;
   }
   try {
      if (target === 'voiceover') {
         await focusExecFile('pgrep', ['-x', 'VoiceOver'], {
            timeout: FOCUS_COMMAND_TIMEOUT_MS,
         });
         return false;
      }
      const { stdout } = await focusExecFile(
         'powershell',
         [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            "@(Get-Process -ErrorAction Stop).ProcessName -contains 'nvda' | ConvertTo-Json",
         ],
         { timeout: FOCUS_COMMAND_TIMEOUT_MS },
      );
      return String(stdout).trim() === 'false';
   } catch (error) {
      return (
         target === 'voiceover' &&
         error instanceof Error &&
         'code' in error &&
         error.code === 1
      );
   }
}

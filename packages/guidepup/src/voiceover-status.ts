import { execFileSync } from 'node:child_process';

const PGREP_TIMEOUT_MS = 2000;

export type VoiceOverLivenessCheck = () => Promise<boolean>;

/**
 * Checks whether the VoiceOver screen reader process is currently active on macOS. Uses
 * Guidepup's fast process probe on darwin hosts and safely returns false otherwise.
 */
export async function isVoiceOverRunning(
   customCheck?: VoiceOverLivenessCheck,
): Promise<boolean> {
   if (customCheck) {
      return customCheck();
   }
   if (process.platform !== 'darwin') {
      return false;
   }
   try {
      const { isRunning } =
         await import('@guidepup/guidepup/lib/macOS/VoiceOver/isRunning.js');
      return await isRunning(undefined, true);
   } catch {
      try {
         const stdout = execFileSync('pgrep', ['-f', 'VoiceOver launchd -s'], {
            encoding: 'utf8',
            timeout: PGREP_TIMEOUT_MS,
         });
         return stdout.trim().length > 0;
      } catch {
         return false;
      }
   }
}

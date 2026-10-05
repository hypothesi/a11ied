import type { DriverFocusTarget } from '@a11ied/contracts';
import { DriverCommandError } from './driver-command-error.js';
import {
   isFrontmostMatch,
   readFrontmostWindow,
   type FrontmostWindow,
} from './window-focus.js';

/** MacOS preserves stale app focus while its login window owns the desktop. */
export function isNativeDesktopLocked(target: FrontmostWindow | undefined): boolean {
   return (
      target?.bundleId === 'com.apple.loginwindow' || target?.appName === 'loginwindow'
   );
}

/** Empty OS records cannot establish an intended input target. */
export function isNativeTargetAvailable(
   target: FrontmostWindow | undefined,
): target is FrontmostWindow {
   return Boolean(
      target &&
      !isNativeDesktopLocked(target) &&
      (target.pid ||
         target.appName?.trim() ||
         target.processName?.trim() ||
         target.bundleId?.trim()),
   );
}

/** Pin the observed process; window titles are constraints only when requested. */
export async function observeNativeInputTarget(
   expected?: DriverFocusTarget,
): Promise<DriverFocusTarget> {
   const foreground = await readFrontmostWindow();
   if (!isNativeTargetAvailable(foreground)) {
      throw new DriverCommandError(
         'native-target-unavailable',
         isNativeDesktopLocked(foreground)
            ? 'The desktop is locked. Unlock it and focus the intended target before sending input.'
            : 'The foreground target could not be observed. Read the state and refocus the intended target before retrying.',
         { foreground },
      );
   }
   if (expected && !isFrontmostMatch(expected, foreground)) {
      throw new DriverCommandError(
         'native-target-changed',
         'The foreground target changed. Read the state and refocus the intended target before continuing.',
         { expected, foreground },
      );
   }
   return {
      ...expected,
      appName: foreground.appName,
      bundleId: foreground.bundleId,
      processName: foreground.processName,
      pid: foreground.pid,
   };
}

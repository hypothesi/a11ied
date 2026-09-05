import type { Platform } from '@a11ied/contracts';

import { DriverCommandError } from './driver-command-error.js';

const NO_SCREENSHOT_REASON: Record<Exclude<Platform, 'voiceover'>, string> = {
   nvda: 'NVDA has no cursor screenshot command. Record the session with sr start --recording instead.',
   virtual:
      'The virtual reader has no screen to capture. Screenshots need a VoiceOver session.',
};

/** The error NVDA and the virtual reader throw for a cursor screenshot request. */
export function createScreenshotUnsupportedError(
   target: Exclude<Platform, 'voiceover'>,
): DriverCommandError {
   return new DriverCommandError(
      'driver-screenshot-unsupported',
      `sr screenshot is not available on ${target}. ${NO_SCREENSHOT_REASON[target]}`,
      { target },
   );
}

import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Platform } from '@a11ied/contracts';

import { DriverCommandError } from './command-registry.js';
import {
   buildCommandOptions,
   REAL_TARGET_INPUT_TIMEOUT_MS,
   type RealStepContext,
} from './real-steps.js';

const SCREENSHOT_SOURCE = 'VoiceOver cursor screenshot (VoiceOver "grab screenshot")';

const NO_SCREENSHOT_REASON: Record<Exclude<Platform, 'voiceover'>, string> = {
   nvda: 'NVDA has no cursor screenshot command. Record the session with sr start --recording instead.',
   virtual:
      'The virtual reader has no screen to capture. Screenshots need a VoiceOver session.',
};

interface CursorScreenshotReader {
   takeCursorScreenshot(options?: { timeout: number; retries: number }): Promise<string>;
}

function canTakeCursorScreenshot(reader: unknown): reader is CursorScreenshotReader {
   return (
      typeof reader === 'object' &&
      reader !== null &&
      'takeCursorScreenshot' in reader &&
      typeof reader.takeCursorScreenshot === 'function'
   );
}

/** The error every target without a cursor screenshot throws, naming the target. */
export function createScreenshotUnsupportedError(
   target: Exclude<Platform, 'voiceover'>,
): DriverCommandError {
   return new DriverCommandError(
      'driver-screenshot-unsupported',
      `sr screenshot is not available on ${target}. ${NO_SCREENSHOT_REASON[target]}`,
      { target },
   );
}

async function moveFile(from: string, to: string): Promise<void> {
   await mkdir(dirname(to), { recursive: true });
   try {
      await rename(from, to);
   } catch {
      // A rename across volumes fails; copy and remove instead.
      await copyFile(from, to);
      await unlink(from);
   }
}

/**
 * Asks VoiceOver to grab a screenshot of the item in its cursor, then moves the file it
 * wrote (on the Desktop by default) to `path`.
 */
export async function captureVoiceOverCursorScreenshot(
   context: RealStepContext,
   path: string,
): Promise<{ path: string; source: string }> {
   if (context.target !== 'voiceover' || !canTakeCursorScreenshot(context.reader)) {
      throw createScreenshotUnsupportedError(
         context.target === 'voiceover' ? 'virtual' : context.target,
      );
   }
   const written = await context.reader.takeCursorScreenshot(
      buildCommandOptions(REAL_TARGET_INPUT_TIMEOUT_MS, context.options),
   );
   await moveFile(written.trim(), path);
   return { path, source: SCREENSHOT_SOURCE };
}

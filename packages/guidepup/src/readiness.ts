import type { ScreenReader } from './upstream.js';
import {
   driverReadinessSchema,
   type DriverReadiness,
   type Platform,
} from '@a11ied/contracts';

import { A11IED_SETUP_COMMAND } from './environment.js';

export type ScreenReaderLike = Pick<
   ScreenReader,
   | 'start'
   | 'stop'
   | 'next'
   | 'previous'
   | 'nextHeading'
   | 'previousHeading'
   | 'nextLink'
   | 'previousLink'
   | 'nextLandmark'
   | 'previousLandmark'
   | 'press'
   | 'type'
   | 'perform'
   | 'act'
   | 'interact'
   | 'stopInteracting'
   | 'lastSpokenPhrase'
   | 'itemText'
   | 'spokenPhraseLog'
   | 'itemTextLog'
   | 'clearSpokenPhraseLog'
   | 'clearItemTextLog'
> &
   Pick<ScreenReader, 'detect' | 'default'>;

const targetNotes: Record<Platform, string> = {
   nvda: `Automate the real NVDA screen reader on Windows after \`${A11IED_SETUP_COMMAND}\` is complete.`,
   virtual: 'Use the virtual screen reader in fast local and CI feedback loops.',
   voiceover:
      'Automate the real VoiceOver screen reader on macOS after local OS permissions are granted.',
};

/** Returns a short human-readable label for one supported platform. */
export function describePlatform(platform: Platform): string {
   return targetNotes[platform];
}

/** Returns the setup command operators should run before attempting a real-device session. */
export function guidepupSetupCommand(): string {
   return A11IED_SETUP_COMMAND;
}

function getPlatformLabel(expectedPlatform: string): string {
   if (expectedPlatform === 'darwin') {
      return 'macOS';
   }
   return 'Windows';
}

function getErrorDetail(error: unknown): string {
   if (error instanceof Error) {
      return error.message;
   }
   return String(error);
}

function getReadinessDetailForDefault(isDefault: boolean): string {
   if (isDefault) {
      return 'The target is the default screen reader for this host.';
   }
   return 'The target is installed but not the default screen reader.';
}

export async function checkDetectedReadiness(
   target: Extract<Platform, 'voiceover' | 'nvda'>,
   reader: ScreenReaderLike,
): Promise<DriverReadiness> {
   const [detected, isDefault] = await Promise.all([reader.detect(), reader.default()]);
   if (!detected) {
      return driverReadinessSchema.parse({
         target,
         status: 'requires-setup',
         summary: `${target} is not ready for Guidepup automation yet.`,
         details: [
            `Run \`${A11IED_SETUP_COMMAND}\` on this machine before starting a real screen reader session. It downloads what ${target} needs and grants the automation permissions.`,
         ],
         setupCommand: guidepupSetupCommand(),
         debug: {
            detected,
            isDefault,
         },
      });
   }

   return driverReadinessSchema.parse({
      target,
      status: 'ready',
      summary: `${target} is ready for automation.`,
      details: [getReadinessDetailForDefault(isDefault)],
      setupCommand: guidepupSetupCommand(),
      debug: {
         detected,
         isDefault,
      },
   });
}

export function getExpectedPlatform(
   target: Extract<Platform, 'voiceover' | 'nvda'>,
): string {
   if (target === 'voiceover') {
      return 'darwin';
   }
   return 'win32';
}

export function createUnsupportedReadiness(
   target: Extract<Platform, 'voiceover' | 'nvda'>,
   expectedPlatform: string,
): DriverReadiness {
   const platformLabel = getPlatformLabel(expectedPlatform);
   return driverReadinessSchema.parse({
      target,
      status: 'unsupported',
      summary: `${target} automation is only available on ${platformLabel}.`,
      details: [`Current platform is ${process.platform}.`],
   });
}

export function createReadinessError(
   target: Extract<Platform, 'voiceover' | 'nvda'>,
   error: unknown,
): DriverReadiness {
   return driverReadinessSchema.parse({
      target,
      status: 'requires-setup',
      summary: `${target} readiness could not be confirmed.`,
      details: [getErrorDetail(error)],
      setupCommand: guidepupSetupCommand(),
   });
}

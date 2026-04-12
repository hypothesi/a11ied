import { nvda, type ScreenReader, voiceOver } from '@guidepup/guidepup';
import {
   driverReadinessSchema,
   driverStateSnapshotSchema,
   type DriverCapability,
   type DriverCheckpoint,
   type DriverReadiness,
   type DriverStateSnapshot,
   type Platform,
} from '@a11ied/contracts';

import { createVirtualAdapter } from './virtual-adapter.js';

const SPEECH_POLL_INTERVAL_MS = 150;
const SPEECH_STABLE_THRESHOLD_MS = 300;
const SPEECH_STABILIZATION_TIMEOUT_MS = 5_000;

/** Lists the driver actions exposed by the shipped adapter surface. */
export const driverCapabilities: DriverCapability[] = [
   'start',
   'stop',
   'status',
   'attach-document',
   'next',
   'previous',
   'key',
   'type',
   'interact',
   'stop-interacting',
   'click-current-item',
   'read',
   'logs',
   'clear-logs',
   'checkpoint',
];

export interface DriverAdapter {
   target: Platform;
   capabilities: DriverCapability[];
   checkReadiness(): Promise<DriverReadiness>;
   start(): Promise<void>;
   stop(): Promise<void>;
   attachDocument(document: { html: string; url: string }): Promise<void>;
   next(): Promise<void>;
   previous(): Promise<void>;
   press(keys: string): Promise<void>;
   type(text: string): Promise<void>;
   interact(): Promise<void>;
   stopInteracting(): Promise<void>;
   activateCurrentItem(): Promise<void>;
   readState(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot>;
   clearLogs(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot>;
   /** Waits for screen reader speech to settle after an action. No-op for virtual targets. */
   waitForSpeechStabilization(): Promise<void>;
}

type ScreenReaderLike = Pick<
   ScreenReader,
   | 'start'
   | 'stop'
   | 'next'
   | 'previous'
   | 'press'
   | 'type'
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

/** Collects a normalized snapshot from the current screen-reader state. */
export async function buildStateSnapshot(
   reader: {
      lastSpokenPhrase(): Promise<string>;
      itemText(): Promise<string>;
      spokenPhraseLog(): Promise<string[]>;
      itemTextLog(): Promise<string[]>;
   },
   checkpoints: DriverCheckpoint[],
): Promise<DriverStateSnapshot> {
   const [lastSpokenPhrase, currentItemText, spokenPhraseLog, itemTextLog] =
      await Promise.all([
         reader.lastSpokenPhrase().catch(() => ''),
         reader.itemText().catch(() => ''),
         reader.spokenPhraseLog().catch(() => []),
         reader.itemTextLog().catch(() => []),
      ]);

   return driverStateSnapshotSchema.parse({
      lastSpokenPhrase: lastSpokenPhrase || undefined,
      currentItemText: currentItemText || undefined,
      spokenPhraseLog,
      itemTextLog,
      logCursor: spokenPhraseLog.length,
      checkpoints,
   });
}

/** Returns the setup command operators should run before attempting a real-device session. */
export function guidepupSetupCommand(platform?: Platform): string {
   if (platform === 'voiceover') {
      return 'npx @guidepup/setup --record';
   }

   if (platform === 'nvda') {
      return 'npx @guidepup/setup';
   }

   return 'npx @guidepup/setup';
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

async function checkDetectedReadiness(
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
            'Run the Guidepup setup command on the host machine before starting a real screen-reader session.',
         ],
         setupCommand: guidepupSetupCommand(target),
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
      setupCommand: guidepupSetupCommand(target),
      debug: {
         detected,
         isDefault,
      },
   });
}

function getExpectedPlatform(target: Extract<Platform, 'voiceover' | 'nvda'>): string {
   if (target === 'voiceover') {
      return 'darwin';
   }
   return 'win32';
}

class RealScreenReaderAdapter implements DriverAdapter {
   readonly capabilities: DriverCapability[] = driverCapabilities;
   readonly target: Extract<Platform, 'voiceover' | 'nvda'>;
   private readonly reader: ScreenReaderLike;

   constructor(
      target: Extract<Platform, 'voiceover' | 'nvda'>,
      reader: ScreenReaderLike,
   ) {
      this.target = target;
      this.reader = reader;
   }

   async checkReadiness(): Promise<DriverReadiness> {
      const expectedPlatform = getExpectedPlatform(this.target);
      if (process.platform !== expectedPlatform) {
         const platformLabel = getPlatformLabel(expectedPlatform);
         return driverReadinessSchema.parse({
            target: this.target,
            status: 'unsupported',
            summary: `${this.target} automation is only available on ${platformLabel}.`,
            details: [`Current platform is ${process.platform}.`],
         });
      }

      try {
         return await checkDetectedReadiness(this.target, this.reader);
      } catch (error) {
         return driverReadinessSchema.parse({
            target: this.target,
            status: 'requires-setup',
            summary: `${this.target} readiness could not be confirmed.`,
            details: [getErrorDetail(error)],
            setupCommand: guidepupSetupCommand(this.target),
         });
      }
   }

   async start(): Promise<void> {
      await this.reader.start();
   }

   async stop(): Promise<void> {
      await this.reader.stop();
   }

   async attachDocument(): Promise<void> {
      // Real screen readers use the live host environment, no document attachment needed.
      // Verify the adapter is configured before proceeding.
      if (this.reader === undefined) {
         throw new Error('Reader is not initialized');
      }
   }

   async next(): Promise<void> {
      await this.reader.next();
   }

   async previous(): Promise<void> {
      await this.reader.previous();
   }

   async press(keys: string): Promise<void> {
      await this.reader.press(keys);
   }

   async type(text: string): Promise<void> {
      await this.reader.type(text);
   }

   async interact(): Promise<void> {
      await this.reader.interact();
   }

   async stopInteracting(): Promise<void> {
      await this.reader.stopInteracting();
   }

   async activateCurrentItem(): Promise<void> {
      await this.reader.act();
   }

   async readState(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot> {
      return buildStateSnapshot(this.reader, checkpoints);
   }

   async clearLogs(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot> {
      await Promise.all([
         this.reader.clearSpokenPhraseLog(),
         this.reader.clearItemTextLog(),
      ]);
      return buildStateSnapshot(this.reader, checkpoints);
   }

   async waitForSpeechStabilization(): Promise<void> {
      const startedAt = Date.now();
      let lastPhrase = '';
      let stableSince = Date.now();

      while (Date.now() - startedAt < SPEECH_STABILIZATION_TIMEOUT_MS) {
         const phrase = await this.reader.lastSpokenPhrase().catch(() => '');
         if (phrase && phrase === lastPhrase) {
            if (Date.now() - stableSince >= SPEECH_STABLE_THRESHOLD_MS) {
               return;
            }
         } else {
            lastPhrase = phrase;
            stableSince = Date.now();
         }
         await new Promise((resolve) => setTimeout(resolve, SPEECH_POLL_INTERVAL_MS));
      }
   }
}

const targetNotes: Record<Platform, string> = {
   nvda: 'Automate the real NVDA screen reader on Windows after `@guidepup/setup` is complete.',
   virtual: 'Use the virtual screen reader in fast local and CI feedback loops.',
   voiceover:
      'Automate the real VoiceOver screen reader on macOS after local OS permissions are granted.',
};

/** Returns a short human-readable label for one supported platform. */
export function describePlatform(platform: Platform): string {
   return targetNotes[platform];
}

/** Creates the adapter for one supported driver target. */
export function createDriverAdapter(target: Platform): DriverAdapter {
   if (target === 'virtual') {
      return createVirtualAdapter();
   }
   if (target === 'voiceover') {
      return new RealScreenReaderAdapter('voiceover', voiceOver);
   }
   return new RealScreenReaderAdapter('nvda', nvda);
}

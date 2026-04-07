import { nvda, type ScreenReader, voiceOver } from '@guidepup/guidepup';
import { virtual } from '@guidepup/virtual-screen-reader';
import {
   driverReadinessSchema,
   driverStateSnapshotSchema,
   type DriverCapability,
   type DriverCheckpoint,
   type DriverReadiness,
   type DriverStateSnapshot,
   type Platform,
} from '@a11lied/contracts';
import { JSDOM } from 'jsdom';

const defaultVirtualHtml = `
<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>A11lied virtual target</h1>
      <p>No live page is attached to this driver session yet.</p>
      <button type="button">Continue</button>
    </main>
  </body>
</html>
`;

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

async function buildStateSnapshot(
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
      lastSpokenPhrase: lastSpokenPhrase || null,
      currentItemText: currentItemText || null,
      spokenPhraseLog,
      itemTextLog,
      logCursor: spokenPhraseLog.length,
      checkpoints,
   });
}

class RealScreenReaderAdapter implements DriverAdapter {
   readonly capabilities = driverCapabilities;

   constructor(
      readonly target: Extract<Platform, 'voiceover' | 'nvda'>,
      private readonly reader: ScreenReaderLike,
   ) {}

   async checkReadiness(): Promise<DriverReadiness> {
      const expectedPlatform = this.target === 'voiceover' ? 'darwin' : 'win32';
      if (process.platform !== expectedPlatform) {
         return driverReadinessSchema.parse({
            target: this.target,
            status: 'unsupported',
            summary: `${this.target} automation is only available on ${expectedPlatform === 'darwin' ? 'macOS' : 'Windows'}.`,
            details: [`Current platform is ${process.platform}.`],
         });
      }

      try {
         const [detected, isDefault] = await Promise.all([
            this.reader.detect(),
            this.reader.default(),
         ]);
         if (!detected) {
            return driverReadinessSchema.parse({
               target: this.target,
               status: 'requires-setup',
               summary: `${this.target} is not ready for Guidepup automation yet.`,
               details: [
                  'Run the Guidepup setup command on the host machine before starting a real screen-reader session.',
               ],
               setupCommand: guidepupSetupCommand(this.target),
               debug: {
                  detected,
                  isDefault,
               },
            });
         }

         return driverReadinessSchema.parse({
            target: this.target,
            status: 'ready',
            summary: `${this.target} is ready for automation.`,
            details: [
               isDefault
                  ? 'The target is the default screen reader for this host.'
                  : 'The target is installed but not the default screen reader.',
            ],
            setupCommand: guidepupSetupCommand(this.target),
            debug: {
               detected,
               isDefault,
            },
         });
      } catch (error) {
         return driverReadinessSchema.parse({
            target: this.target,
            status: 'requires-setup',
            summary: `${this.target} readiness could not be confirmed.`,
            details: [error instanceof Error ? error.message : String(error)],
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
      // Real screen readers operate against the live host environment.
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
}

class VirtualAdapter implements DriverAdapter {
   readonly target = 'virtual';
   readonly capabilities = driverCapabilities;
   private dom: JSDOM | null = null;

   async checkReadiness(): Promise<DriverReadiness> {
      return driverReadinessSchema.parse({
         target: 'virtual',
         status: 'ready',
         summary: 'Virtual screen reader is ready.',
         details: ['Uses an in-memory DOM when no live target is attached.'],
      });
   }

   async start(): Promise<void> {
      await this.attachDocument({
         html: defaultVirtualHtml,
         url: 'https://a11lied.local/virtual',
      });
   }

   async stop(): Promise<void> {
      await virtual.stop().catch(() => {});
      this.dom?.window.close();
      this.dom = null;
   }

   async attachDocument(document: { html: string; url: string }): Promise<void> {
      await virtual.stop().catch(() => {});
      this.dom?.window.close();
      this.dom = new JSDOM(document.html, {
         pretendToBeVisual: true,
         url: document.url,
      });
      await virtual.start({
         container: this.dom.window.document.body,
         window: this.dom.window,
      });
   }

   async next(): Promise<void> {
      await virtual.next();
   }

   async previous(): Promise<void> {
      await virtual.previous();
   }

   async press(keys: string): Promise<void> {
      await virtual.press(keys);
   }

   async type(text: string): Promise<void> {
      await virtual.type(text);
   }

   async interact(): Promise<void> {
      await virtual.interact();
   }

   async stopInteracting(): Promise<void> {
      await virtual.stopInteracting();
   }

   async activateCurrentItem(): Promise<void> {
      await virtual.act();
   }

   async readState(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot> {
      return buildStateSnapshot(virtual, checkpoints);
   }

   async clearLogs(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot> {
      await Promise.all([virtual.clearSpokenPhraseLog(), virtual.clearItemTextLog()]);
      return buildStateSnapshot(virtual, checkpoints);
   }
}

const targetNotes: Record<Platform, string> = {
   nvda: 'Automate the real NVDA screen reader on Windows after `@guidepup/setup` is complete.',
   virtual: 'Use the virtual screen reader in fast local and CI feedback loops.',
   voiceover:
      'Automate the real VoiceOver screen reader on macOS after local OS permissions are granted.',
};

export function describePlatform(platform: Platform): string {
   return targetNotes[platform];
}

export function guidepupSetupCommand(platform?: Platform): string {
   if (platform === 'voiceover') {
      return 'npx @guidepup/setup --ci --record';
   }

   if (platform === 'nvda') {
      return 'npx @guidepup/setup';
   }

   return 'npx @guidepup/setup';
}

export function createDriverAdapter(target: Platform): DriverAdapter {
   if (target === 'virtual') {
      return new VirtualAdapter();
   }

   if (target === 'voiceover') {
      return new RealScreenReaderAdapter('voiceover', voiceOver);
   }

   return new RealScreenReaderAdapter('nvda', nvda);
}

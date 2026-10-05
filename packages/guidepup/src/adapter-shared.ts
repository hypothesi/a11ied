import {
   driverActionNameSchema,
   driverStateSnapshotSchema,
   type DriverCapability,
   type DriverCheckpoint,
   type DriverCurrentItem,
   type DriverFocusResult,
   type DriverFocusTarget,
   type DriverNavigateRequest,
   type DriverPerformPayload,
   type DriverReadiness,
   type DriverStateSnapshot,
   type DriverTableMove,
   type Platform,
   type PortableDriverVerb,
   type NativeInputPolicy,
} from '@a11ied/contracts';
import type { SerializableDriverCommand } from './command-registry.js';

/** Lists the driver actions exposed by the shipped adapter surface. */
export const driverCapabilities: DriverCapability[] = [...driverActionNameSchema.options];

const NATIVE_OBSERVATION_CAPABILITIES: ReadonlySet<DriverCapability> = new Set([
   'read',
   'transcript',
   'wait',
   'checkpoint',
   'focus',
   'screenshot',
]);

/** Advertise actions implemented by the selected adapter. */
export function getDriverCapabilities(
   target: Platform,
   supportsPerform = true,
   nativeInput: NativeInputPolicy = 'guarded',
): DriverCapability[] {
   return driverCapabilities.filter(function isSupported(
      capability: DriverCapability,
   ): boolean {
      if (
         target !== 'virtual' &&
         nativeInput === 'require-binding' &&
         !NATIVE_OBSERVATION_CAPABILITIES.has(capability)
      ) {
         return false;
      }
      if (capability === 'screenshot') {
         return target === 'voiceover';
      }
      if (capability === 'focus') {
         return target !== 'virtual';
      }
      return capability !== 'perform' || supportsPerform;
   });
}

/** Per-call options an adapter action accepts. */
export interface DriverActionOptions {
   /** Bounds the underlying screen reader command; adapters fall back to their defaults. */
   timeoutMs?: number;
}

export interface DriverAdapter {
   target: Platform;
   capabilities: DriverCapability[];
   checkReadiness(): Promise<DriverReadiness>;
   start(): Promise<void>;
   stop(): Promise<void>;
   /** Protect external desktop side effects with the reader's ownership lease. */
   runOwned<TResult>(run: () => Promise<TResult>): Promise<TResult>;
   attachDocument(document: { html: string; url: string }): Promise<void>;
   focus(target: DriverFocusTarget): Promise<DriverFocusResult>;
   /** Runs one portable verb through the shared portable table. */
   performPortable(
      verb: PortableDriverVerb,
      options?: DriverActionOptions,
   ): Promise<void>;
   /**
    * Jumps by kind through the navigation table. `moved` is reported by the virtual
    * reader, which knows its cursor node; the native announcement text cannot prove
    * movement.
    */
   navigate(
      request: DriverNavigateRequest,
      options?: DriverActionOptions,
   ): Promise<{ moved?: boolean }>;
   /**
    * The current item plus a position token that is equal for two reads of the same spot.
    * Cheaper than readState; the loops call it after every step. `atEnd` is true when the
    * cursor sits on the last item of the document; only the virtual reader knows.
    */
   readCurrentItem(): Promise<{
      item: DriverCurrentItem;
      position?: string | undefined;
      atEnd?: boolean;
   }>;
   /** The page title or window summary, with where it came from. */
   readTitle(options?: DriverActionOptions): Promise<{ title: string; source: string }>;
   /**
    * Moves the cursor to the next place the text appears; `found` is false when it is not
    * on the page.
    */
   findText(text: string, options?: DriverActionOptions): Promise<{ found: boolean }>;
   /** Moves between cells of the table the cursor is in, or reads a header without moving. */
   moveInTable(
      move: DriverTableMove,
      options?: DriverActionOptions,
   ): Promise<{ moved?: boolean; header?: string }>;
   /**
    * Saves a picture of what the cursor is on to `path`. VoiceOver grabs it through its
    * cursor; NVDA and the virtual reader throw a DriverCommandError that says so.
    */
   captureCursorScreenshot(
      path: string,
      options?: DriverActionOptions,
   ): Promise<{ path: string; source: string }>;
   /** Presses each chord in order; one chord per array entry. */
   press(keys: readonly string[], options?: DriverActionOptions): Promise<void>;
   type(text: string, options?: DriverActionOptions): Promise<void>;
   performCommand(
      command: DriverPerformPayload,
      options?: DriverActionOptions,
   ): Promise<SerializableDriverCommand & { requestedCommand: string }>;
   readState(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot>;
   /** Waits for screen reader speech to settle after an action. No-op for virtual targets. */
   waitForSpeechStabilization(): Promise<void>;
}

/**
 * Collects a normalized snapshot from the current screen-reader state. `describeItem`
 * turns the phrase and item text into the current item; the virtual adapter passes one
 * that reads its active node instead.
 */
export async function buildStateSnapshot(
   reader: {
      lastSpokenPhrase(): Promise<string>;
      itemText(): Promise<string>;
      spokenPhraseLog(): Promise<string[]>;
      itemTextLog(): Promise<string[]>;
   },
   checkpoints: DriverCheckpoint[],
   describeItem?: (phrase: string, itemText: string) => Promise<DriverCurrentItem>,
): Promise<DriverStateSnapshot> {
   const [lastSpokenPhrase, currentItemText, spokenPhraseLog, itemTextLog] =
      await Promise.all([
         reader.lastSpokenPhrase(),
         reader.itemText(),
         reader.spokenPhraseLog(),
         reader.itemTextLog(),
      ]);
   const currentItem = describeItem
      ? await describeItem(lastSpokenPhrase, currentItemText)
      : undefined;

   return driverStateSnapshotSchema.parse({
      observedAt: new Date().toISOString(),
      lastSpokenPhrase: lastSpokenPhrase || undefined,
      currentItemText: currentItemText || undefined,
      spokenPhraseLog,
      itemTextLog,
      logCursor: spokenPhraseLog.length,
      checkpoints,
      currentItem,
   });
}

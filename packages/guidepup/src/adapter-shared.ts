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
} from '@a11ied/contracts';
import type { SerializableDriverCommand } from './command-registry.js';

/** Lists the driver actions exposed by the shipped adapter surface. */
export const driverCapabilities: DriverCapability[] = [...driverActionNameSchema.options];

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
   attachDocument(document: { html: string; url: string }): Promise<void>;
   focus(target: DriverFocusTarget): Promise<DriverFocusResult>;
   /** Runs one portable verb through the shared portable table. */
   performPortable(
      verb: PortableDriverVerb,
      options?: DriverActionOptions,
   ): Promise<void>;
   /**
    * Jumps by kind through the navigation table. `moved` is reported by the virtual
    * reader, which knows its cursor node; the real readers say so in their phrase.
    */
   navigate(
      request: DriverNavigateRequest,
      options?: DriverActionOptions,
   ): Promise<{ moved?: boolean }>;
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
         reader.lastSpokenPhrase().catch(() => ''),
         reader.itemText().catch(() => ''),
         reader.spokenPhraseLog().catch(() => []),
         reader.itemTextLog().catch(() => []),
      ]);
   const currentItem = describeItem
      ? await describeItem(lastSpokenPhrase, currentItemText)
      : undefined;

   return driverStateSnapshotSchema.parse({
      lastSpokenPhrase: lastSpokenPhrase || undefined,
      currentItemText: currentItemText || undefined,
      spokenPhraseLog,
      itemTextLog,
      logCursor: spokenPhraseLog.length,
      checkpoints,
      currentItem,
   });
}

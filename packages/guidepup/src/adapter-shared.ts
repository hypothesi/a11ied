import {
   driverActionNameSchema,
   driverStateSnapshotSchema,
   type DriverCapability,
   type DriverCheckpoint,
   type DriverFocusResult,
   type DriverFocusTarget,
   type DriverPerformPayload,
   type DriverReadiness,
   type DriverStateSnapshot,
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

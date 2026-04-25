import {
   driverStateSnapshotSchema,
   type DriverCapability,
   type DriverCheckpoint,
   type DriverFocusResult,
   type DriverFocusTarget,
   type DriverReadiness,
   type DriverStateSnapshot,
   type Platform,
} from '@a11ied/contracts';
import type { SerializableDriverCommand } from './command-registry.js';

/** Lists the driver actions exposed by the shipped adapter surface. */
export const driverCapabilities: DriverCapability[] = [
   'start',
   'stop',
   'status',
   'attach-document',
   'focus',
   'next',
   'previous',
   'key',
   'type',
   'perform',
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
   focus(target: DriverFocusTarget): Promise<DriverFocusResult>;
   next(): Promise<void>;
   previous(): Promise<void>;
   press(keys: string): Promise<void>;
   type(text: string): Promise<void>;
   performCommand(command: {
      command: string;
      commandSet?: string;
   }): Promise<SerializableDriverCommand & { requestedCommand: string }>;
   interact(): Promise<void>;
   stopInteracting(): Promise<void>;
   activateCurrentItem(): Promise<void>;
   readState(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot>;
   clearLogs(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot>;
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

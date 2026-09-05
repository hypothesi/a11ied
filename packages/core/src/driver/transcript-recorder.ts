import type { DriverStateSnapshot, DriverTranscriptEntry } from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';

function resolveEntryItemText(args: {
   items: string[];
   offset: number;
   phrases: string[];
   state: DriverStateSnapshot;
}): string | undefined {
   if (args.items.length === args.phrases.length) {
      return args.items[args.offset] || undefined;
   }
   if (args.offset === args.phrases.length - 1) {
      return args.state.currentItemText ?? undefined;
   }
   return undefined;
}

/**
 * Keeps the timestamped transcript for one session. The broker calls `capture` after
 * every action so each phrase is stamped when it was produced, not when it was read
 * back.
 */
export class TranscriptRecorder {
   readonly entries: DriverTranscriptEntry[] = [];
   private phraseCount = 0;
   private itemCount = 0;

   /** Appends every phrase spoken since the previous capture. */
   capture(state: DriverStateSnapshot): void {
      if (state.spokenPhraseLog.length < this.phraseCount) {
         // The reader restarted (the virtual target attaches a new document), so its
         // Logs begin again at zero while the transcript keeps what was already said.
         this.phraseCount = 0;
         this.itemCount = 0;
      }
      const items = state.itemTextLog.slice(this.itemCount),
         now = new Date().toISOString(),
         phrases = state.spokenPhraseLog.slice(this.phraseCount);
      for (const [offset, phrase] of phrases.entries()) {
         this.entries.push(
            this.buildEntry({ phrase, items, offset, phrases, now, state }),
         );
      }
      this.phraseCount = state.spokenPhraseLog.length;
      this.itemCount = state.itemTextLog.length;
      this.captureUnloggedPhrase(state, now);
   }

   /**
    * VoiceOver's log only records phrases that followed a Guidepup command, so a live
    * region that speaks on its own shows up in the last phrase alone. Keep it.
    */
   private captureUnloggedPhrase(state: DriverStateSnapshot, now: string): void {
      const phrase = state.lastSpokenPhrase ?? '';
      const lastPhrase = this.entries.findLast((entry) => entry.checkpoint === undefined);
      if (!phrase || phrase === lastPhrase?.phrase) {
         return;
      }
      const entry: DriverTranscriptEntry = {
         index: this.entries.length,
         at: now,
         phrase,
      };
      if (state.currentItemText) {
         entry.itemText = state.currentItemText;
      }
      this.entries.push(entry);
   }

   private buildEntry(args: {
      phrase: string;
      items: string[];
      offset: number;
      phrases: string[];
      now: string;
      state: DriverStateSnapshot;
   }): DriverTranscriptEntry {
      const entry: DriverTranscriptEntry = {
         index: this.entries.length,
         at: args.now,
         phrase: args.phrase,
      };
      const itemText = resolveEntryItemText(args);
      if (itemText) {
         entry.itemText = itemText;
      }
      return entry;
   }

   addCheckpoint(label: string, at = new Date().toISOString()): void {
      this.entries.push({
         index: this.entries.length,
         at,
         phrase: '',
         checkpoint: label,
      });
   }

   /** Returns the snapshot with the transcript entries attached. */
   attach(state: DriverStateSnapshot): DriverStateSnapshot {
      return { ...state, transcript: [...this.entries] };
   }
}

export interface TranscriptSelection {
   /** Keep only entries after the last checkpoint with this label. */
   since?: string | undefined;
   /** Keep only the last N phrases (checkpoints between them are kept too). */
   tail?: number | undefined;
}

function sliceSinceCheckpoint(
   entries: DriverTranscriptEntry[],
   label: string,
): DriverTranscriptEntry[] {
   const position = entries.findLastIndex((entry) => entry.checkpoint === label);
   if (position === -1) {
      throw new CliUsageError(
         'checkpoint-not-found',
         `No checkpoint named "${label}" exists in this session.`,
         { checkpoint: label },
      );
   }
   return entries.slice(position + 1);
}

function sliceTail(
   entries: DriverTranscriptEntry[],
   tail: number,
): DriverTranscriptEntry[] {
   let phrases = 0;
   let start = entries.length;
   while (start > 0 && phrases < tail) {
      start -= 1;
      if (entries[start]?.checkpoint === undefined) {
         phrases += 1;
      }
   }
   return entries.slice(start);
}

/** Applies --since and --tail to a transcript, in that order. */
export function selectTranscriptEntries(
   entries: DriverTranscriptEntry[],
   selection: TranscriptSelection = {},
): DriverTranscriptEntry[] {
   let selected = entries;
   if (selection.since !== undefined) {
      selected = sliceSinceCheckpoint(selected, selection.since);
   }
   if (selection.tail !== undefined) {
      selected = sliceTail(selected, selection.tail);
   }
   return selected;
}

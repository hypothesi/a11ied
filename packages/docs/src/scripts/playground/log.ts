/** The playground's log: what one line holds, and how a spoken phrase becomes a line. */
import type { TranscriptEntry } from '@a11ied/support-data/types';

export type EntryKind = 'item' | 'live' | 'edge' | 'mark';

export interface LogEntry {
   readonly command: string;
   readonly phrase: string;
   readonly kind: EntryKind;
   /** A short label shown before the text: the role, or the kind of live region. */
   readonly tag: string;
   readonly text: string;
   /** The role of the item under the cursor, when this phrase is that item's. */
   readonly role?: string | undefined;
}

const LIVE_PATTERN = /^(polite|assertive): /;

const EDGE_PHRASES = new Set(['document', 'end of document']);

/** Turns one spoken phrase into a log entry, using the cursor's role when it applies. */
export function toEntry(
   command: string,
   phrase: string,
   role: string | undefined,
): LogEntry {
   const live = LIVE_PATTERN.exec(phrase);

   if (live) {
      return {
         command,
         phrase,
         kind: 'live',
         tag: `live: ${live[1] ?? ''}`,
         text: phrase.slice(live[0].length),
      };
   }
   if (EDGE_PHRASES.has(phrase)) {
      return { command, phrase, kind: 'edge', tag: '', text: phrase };
   }
   const rolePrefix = `${role ?? ''}, `;

   if (role && phrase.startsWith(rolePrefix)) {
      return {
         command,
         phrase,
         kind: 'item',
         tag: role,
         text: phrase.slice(rolePrefix.length),
         role,
      };
   }
   return { command, phrase, kind: 'item', tag: '', text: phrase, role };
}

export function toTranscriptEntry(entry: LogEntry, index: number): TranscriptEntry {
   const base = { step: index + 1, command: entry.command, phrase: entry.phrase };

   // The runner grades by the role the reader reported, so the same role goes with each line.
   return entry.role === undefined ? base : { ...base, role: entry.role };
}

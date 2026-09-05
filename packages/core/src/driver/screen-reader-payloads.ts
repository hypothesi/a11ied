import {
   driverLoopItemSchema,
   type DriverCurrentItem,
   type DriverStateSnapshot,
} from '@a11ied/contracts';

import type { WantedItem } from './broker-loops.js';
import type { ScreenReaderRunOptions } from './screen-reader-transport.js';
import type { SpokenMatch } from './spoken-matchers.js';

export interface NavigateOptions extends ScreenReaderRunOptions {
   /** Heading level 1 to 6. Only kind `heading` reads it. */
   level?: number | undefined;
   /** How many times to repeat the move. */
   times?: number | undefined;
}

export interface LoopOptions extends ScreenReaderRunOptions {
   /** Caps the number of steps. The loop reports `cap` when it stops there. */
   max?: number | undefined;
}

export interface WaitOptions extends ScreenReaderRunOptions {
   /** A phrase to wait for. Without it, `ms` is a fixed pause. */
   for?: SpokenMatch | undefined;
   ms?: number | undefined;
}

export const loopItemsSchema = driverLoopItemSchema.array();

export function readString(
   details: Record<string, unknown> | undefined,
   key: string,
): string {
   const value = details?.[key];
   return typeof value === 'string' ? value : '';
}

export function describeMatch(match: SpokenMatch): string {
   return typeof match === 'string' ? `"${match}"` : String(match);
}

export function pickMove(options: NavigateOptions): { level?: number; times?: number } {
   const move: { level?: number; times?: number } = {};
   if (options.level !== undefined) {
      move.level = options.level;
   }
   if (options.times !== undefined) {
      move.times = options.times;
   }
   return move;
}

export function pickMax(options: LoopOptions): { max?: number } {
   return options.max === undefined ? {} : { max: options.max };
}

export function buildWaitPayload(options: WaitOptions): {
   for?: string;
   ms?: number;
   timeoutMs?: number;
} {
   const payload: { for?: string; ms?: number; timeoutMs?: number } = {};
   if (options.for !== undefined) {
      payload.for =
         typeof options.for === 'string'
            ? options.for
            : `/${options.for.source}/${options.for.flags}`;
   }
   if (options.ms !== undefined) {
      payload.ms = options.ms;
   }
   if (options.timeoutMs !== undefined) {
      payload.timeoutMs = options.timeoutMs;
   }
   return payload;
}

export function describeWanted(wanted: WantedItem): string {
   const parts = [
      wanted.role,
      wanted.name === undefined ? undefined : `named "${wanted.name}"`,
   ];
   return parts.filter((part) => part !== undefined).join(' ') || 'item';
}

export function transcriptPhrasesOf(state: DriverStateSnapshot): string[] {
   return state.transcript
      .filter((entry) => entry.checkpoint === undefined)
      .map((entry) => entry.phrase);
}

/** The current item, or one built from the phrase alone when the reader gave none. */
export function currentItemOf(state: DriverStateSnapshot): DriverCurrentItem {
   if (state.currentItem) {
      return state.currentItem;
   }
   const phrase = state.lastSpokenPhrase ?? '';
   return {
      states: [],
      phrase,
      source: 'phrase only: the reader reported no current item',
   };
}

import type {
   DriverCurrentItem,
   DriverElementsPayload,
   DriverGotoPayload,
   DriverLoopItem,
   DriverLoopStop,
   DriverNavigationKind,
   DriverReadAllPayload,
} from '@a11ied/contracts';
import type { DriverActionOptions, DriverAdapter } from '@a11ied/guidepup';

import type { ActionExecutionResult } from './broker-types.js';

/** NVDA says this when a structural jump has nowhere to go; VoiceOver repeats the phrase. */
const NO_NEXT_PATTERN = /\bno (next|previous|more)\b/iu;

interface LoopStop {
   item: DriverCurrentItem;
   position: string;
   moved: boolean | undefined;
   atEnd: boolean | undefined;
}

interface LoopState {
   first: string | undefined;
   previous: string;
   items: DriverLoopItem[];
}

/**
 * Whether the reader has nothing left to visit: the adapter said it did not move, the
 * phrase says so, the position repeated, or the loop came back around to its first stop.
 */
function reachedEnd(state: LoopState, stop: LoopStop): boolean {
   if (stop.moved === false || NO_NEXT_PATTERN.test(stop.item.phrase ?? '')) {
      return true;
   }
   return stop.position === state.previous || stop.position === state.first;
}

function toLoopItem(index: number, item: DriverCurrentItem): DriverLoopItem {
   const entry: DriverLoopItem = { index, phrase: item.phrase ?? '' };
   if (item.role) {
      entry.role = item.role;
   }
   if (item.name) {
      entry.name = item.name;
   }
   if (item.level !== undefined) {
      entry.level = item.level;
   }
   return entry;
}

interface LoopArgs {
   adapter: DriverAdapter;
   max: number;
   /** One step forward; returns what the adapter knows about whether it moved. */
   step: () => Promise<{ moved?: boolean }>;
   /** Ends the loop early with `match` when the item is the one wanted. */
   isMatch?: (item: DriverCurrentItem) => boolean;
}

async function stepOnce(args: LoopArgs): Promise<LoopStop> {
   const { moved } = await args.step();
   await args.adapter.waitForSpeechStabilization();
   const { item, position, atEnd } = await args.adapter.readCurrentItem();
   return { item, position, moved, atEnd };
}

async function runLoop(
   args: LoopArgs,
   state: LoopState,
   remaining: number,
): Promise<{ items: DriverLoopItem[]; stoppedAt: DriverLoopStop }> {
   if (remaining <= 0) {
      return { items: state.items, stoppedAt: 'cap' };
   }
   const stop = await stepOnce(args);
   if (reachedEnd(state, stop)) {
      return { items: state.items, stoppedAt: 'end' };
   }
   const items = [...state.items, toLoopItem(state.items.length + 1, stop.item)];
   const next: LoopState = {
      first: state.first ?? stop.position,
      previous: stop.position,
      items,
   };
   if (args.isMatch?.(stop.item)) {
      return { items, stoppedAt: 'match' };
   }
   if (stop.atEnd === true) {
      // The closing phrase of the document is the last thing the reader says.
      return { items, stoppedAt: 'end' };
   }
   return runLoop(args, next, remaining - 1);
}

/** Steps until the end detector fires, the cap is reached, or `isMatch` accepts an item. */
export async function runBoundedLoop(
   args: LoopArgs,
): Promise<{ items: DriverLoopItem[]; stoppedAt: DriverLoopStop }> {
   const start = await args.adapter.readCurrentItem();
   return runLoop(
      args,
      { first: undefined, previous: start.position, items: [] },
      args.max,
   );
}

/** The rotor: from the top, every element of one kind as the reader announces it. */
export async function runElementsAction(
   adapter: DriverAdapter,
   payload: DriverElementsPayload,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   await adapter.performPortable('top', options);
   const { items, stoppedAt } = await runBoundedLoop({
      adapter,
      max: payload.max,
      step: () => adapter.navigate({ direction: 'next', kind: payload.kind }, options),
   });
   return {
      details: {
         kind: payload.kind,
         count: items.length,
         items,
         stoppedAt,
         max: payload.max,
      },
   };
}

/** Say-all as a transcript: item by item from the cursor until the end or the cap. */
export async function runReadAllAction(
   adapter: DriverAdapter,
   payload: DriverReadAllPayload,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   const { items, stoppedAt } = await runBoundedLoop({
      adapter,
      max: payload.max,
      step: () => adapter.navigate({ direction: 'next', kind: 'item' }, options),
   });
   return { details: { count: items.length, items, stoppedAt, max: payload.max } };
}

/** Roles whose elements have a jump key, so goto can use it instead of stepping by item. */
const ROLE_KINDS: Readonly<Record<string, DriverNavigationKind>> = {
   heading: 'heading',
   link: 'link',
   button: 'button',
   table: 'table',
   list: 'list',
   img: 'graphic',
   image: 'graphic',
   graphic: 'graphic',
   figure: 'graphic',
   region: 'region',
   banner: 'landmark',
   navigation: 'landmark',
   main: 'landmark',
   complementary: 'landmark',
   contentinfo: 'landmark',
   form: 'landmark',
   search: 'landmark',
   textbox: 'form-field',
   searchbox: 'form-field',
   combobox: 'form-field',
   checkbox: 'control',
   radio: 'control',
   switch: 'control',
   slider: 'control',
};

function normalizeWords(value: string): string {
   return value
      .toLowerCase()
      .replaceAll(/[\s_-]+/gu, ' ')
      .trim();
}

function matchesGoto(item: DriverCurrentItem, payload: DriverGotoPayload): boolean {
   if (payload.role !== undefined) {
      const wanted = normalizeWords(payload.role);
      if (normalizeWords(item.role ?? '') !== wanted) {
         return false;
      }
   }
   if (payload.name !== undefined) {
      const haystack = normalizeWords(`${item.name ?? ''} ${item.phrase ?? ''}`);
      return haystack.includes(normalizeWords(payload.name));
   }
   return true;
}

/** Steps forward, by kind when the role has a jump key, until the item matches. */
export async function runGotoAction(
   adapter: DriverAdapter,
   payload: DriverGotoPayload,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   const kind = ROLE_KINDS[normalizeWords(payload.role ?? '')] ?? 'item';
   const start = await adapter.readCurrentItem();
   if (matchesGoto(start.item, payload)) {
      return { details: { ...payload, found: true, steps: 0, kind } };
   }
   const { items, stoppedAt } = await runBoundedLoop({
      adapter,
      max: payload.max,
      step: () => adapter.navigate({ direction: 'next', kind }, options),
      isMatch: (item) => matchesGoto(item, payload),
   });
   return {
      details: {
         ...payload,
         found: stoppedAt === 'match',
         steps: items.length,
         kind,
         stoppedAt,
      },
   };
}

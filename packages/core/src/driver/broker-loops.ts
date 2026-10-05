import type {
   DriverCurrentItem,
   DriverElementsPayload,
   DriverGotoPayload,
   DriverLoopItem,
   DriverLoopStop,
   DriverNavigationKind,
   DriverReadAllPayload,
   Platform,
} from '@a11ied/contracts';
import type { DriverActionOptions, DriverAdapter } from '@a11ied/guidepup/browser';

import type { ActionExecutionResult } from './broker-types.js';

interface LoopStop {
   item: DriverCurrentItem;
   position?: string | undefined;
   moved: boolean | undefined;
   atEnd: boolean | undefined;
}

interface LoopState {
   first: string | undefined;
   previous: string | undefined;
   items: DriverLoopItem[];
}

/** Only adapter movement and simulated node identities can confirm the end. */
function reachedEnd(state: LoopState, stop: LoopStop, target: Platform): boolean {
   if (stop.moved === false) {
      return true;
   }
   return (
      target === 'virtual' &&
      stop.position !== undefined &&
      (stop.position === state.previous || stop.position === state.first)
   );
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
   if (reachedEnd(state, stop, args.adapter.target)) {
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
export async function runBoundedLoop(args: LoopArgs): Promise<{
   items: DriverLoopItem[];
   stoppedAt: DriverLoopStop;
   complete: boolean;
   limitations: string[];
}> {
   const start = await args.adapter.readCurrentItem();
   const result = await runLoop(
      args,
      { first: undefined, previous: start.position, items: [] },
      args.max,
   );
   return {
      ...result,
      complete: result.stoppedAt !== 'cap',
      limitations:
         args.adapter.target === 'virtual'
            ? []
            : [
                 'Item names depend on screen reader language and verbosity.',
                 'Spoken text does not identify the real reader cursor or prove the end of a document.',
              ],
   };
}

/** The rotor: from the top, every element of one kind as the reader announces it. */
export async function runElementsAction(
   adapter: DriverAdapter,
   payload: DriverElementsPayload,
   options: DriverActionOptions,
): Promise<ActionExecutionResult> {
   await adapter.performPortable('top', options);
   const loop = await runBoundedLoop({
      adapter,
      max: payload.max,
      step: () => adapter.navigate({ direction: 'next', kind: payload.kind }, options),
   });
   return {
      details: {
         kind: payload.kind,
         count: loop.items.length,
         ...loop,
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
   const loop = await runBoundedLoop({
      adapter,
      max: payload.max,
      step: () => adapter.navigate({ direction: 'next', kind: 'item' }, options),
   });
   return { details: { count: loop.items.length, ...loop, max: payload.max } };
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

/** What goto and the toHaveCursorOn matcher look for: a role, a name, or both. */
export interface WantedItem {
   role?: string | undefined;
   name?: string | undefined;
}

/**
 * Whether the item has the wanted role, spelled the way the reader or the caller spells
 * it, and the wanted name somewhere in its name or phrase, without regard to case.
 */
export function matchesItem(item: DriverCurrentItem, wanted: WantedItem): boolean {
   if (
      wanted.role !== undefined &&
      normalizeWords(item.role ?? '') !== normalizeWords(wanted.role)
   ) {
      return false;
   }
   if (wanted.name !== undefined) {
      const haystack = normalizeWords(`${item.name ?? ''} ${item.phrase ?? ''}`);
      return haystack.includes(normalizeWords(wanted.name));
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
   if (matchesItem(start.item, payload)) {
      return { details: { ...payload, found: true, steps: 0, kind } };
   }
   const loop = await runBoundedLoop({
      adapter,
      max: payload.max,
      step: () => adapter.navigate({ direction: 'next', kind }, options),
      isMatch: (item) => matchesItem(item, payload),
   });
   return {
      details: {
         ...payload,
         found: loop.stoppedAt === 'match',
         steps: loop.items.length,
         kind,
         ...loop,
      },
   };
}

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
import { resolveLoopBudgetMs } from './loop-budget.js';

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
   /** When the loop runs out of time, as a `Date.now()` value. */
   deadline: number;
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
   /** Aborts the loop, even in the middle of a step, when the session starts stopping. */
   signal?: AbortSignal | undefined;
   /** Overrides the time the loop may run, which defaults to the target's budget. */
   budgetMs?: number;
}

/** How a loop action talks to the adapter, and what cancels it. */
export interface LoopRun {
   options: DriverActionOptions;
   /** Aborts the loop, even in the middle of a step, when the session starts stopping. */
   signal?: AbortSignal | undefined;
}

/** Settles with the abort reason as soon as the signal aborts, leaving `work` running. */
async function raceAbort<TResult>(
   work: Promise<TResult>,
   signal: AbortSignal | undefined,
): Promise<TResult> {
   if (!signal) {
      return work;
   }
   signal.throwIfAborted();
   let abort: (() => void) | undefined = undefined;
   const aborted = new Promise<never>((_resolve, reject) => {
      abort = (): void => {
         reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
   });
   try {
      return await Promise.race([work, aborted]);
   } finally {
      if (abort) {
         signal.removeEventListener('abort', abort);
      }
   }
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
   if (Date.now() >= state.deadline) {
      return { items: state.items, stoppedAt: 'time' };
   }
   const stop = await raceAbort(stepOnce(args), args.signal);
   if (reachedEnd(state, stop, args.adapter.target)) {
      return { items: state.items, stoppedAt: 'end' };
   }
   const items = [...state.items, toLoopItem(state.items.length + 1, stop.item)];
   const next: LoopState = {
      first: state.first ?? stop.position,
      previous: stop.position,
      items,
      deadline: state.deadline,
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

/**
 * Steps until the end detector fires, the cap is reached, the time budget runs out, or
 * `isMatch` accepts an item.
 */
export async function runBoundedLoop(args: LoopArgs): Promise<{
   items: DriverLoopItem[];
   stoppedAt: DriverLoopStop;
   complete: boolean;
   limitations: string[];
}> {
   const deadline =
      Date.now() + (args.budgetMs ?? resolveLoopBudgetMs(args.adapter.target, args.max));
   const start = await args.adapter.readCurrentItem();
   const result = await runLoop(
      args,
      { first: undefined, previous: start.position, items: [], deadline },
      args.max,
   );
   return {
      ...result,
      complete: result.stoppedAt !== 'cap' && result.stoppedAt !== 'time',
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
   run: LoopRun,
): Promise<ActionExecutionResult> {
   await adapter.performPortable('top', run.options);
   const loop = await runBoundedLoop({
      adapter,
      signal: run.signal,
      max: payload.max,
      step: () =>
         adapter.navigate({ direction: 'next', kind: payload.kind }, run.options),
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
   run: LoopRun,
): Promise<ActionExecutionResult> {
   const loop = await runBoundedLoop({
      adapter,
      signal: run.signal,
      max: payload.max,
      step: () => adapter.navigate({ direction: 'next', kind: 'item' }, run.options),
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
   run: LoopRun,
): Promise<ActionExecutionResult> {
   const kind = ROLE_KINDS[normalizeWords(payload.role ?? '')] ?? 'item';
   const start = await adapter.readCurrentItem();
   if (matchesItem(start.item, payload)) {
      return { details: { ...payload, found: true, steps: 0, kind } };
   }
   const loop = await runBoundedLoop({
      adapter,
      signal: run.signal,
      max: payload.max,
      step: () => adapter.navigate({ direction: 'next', kind }, run.options),
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

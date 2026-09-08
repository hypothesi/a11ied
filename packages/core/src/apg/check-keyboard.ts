import type {
   ApgKeyboardCheckRow,
   ApgKeyboardRow,
   ApgKeyboardTable,
} from '@a11ied/contracts';
import { runInOrder } from '@a11ied/guidepup';
import type { Page } from 'playwright';

import { toPlaywrightKeys } from './keys.js';
import { diffObservations, focusWidget, observeWidget } from './observe.js';
import { buildRowKey } from './row-key.js';

const SETTLE_MS = 250;

/**
 * The key pressed to move a widget off a boundary before the second attempt.
 *
 * A listbox that loads with its first option selected correctly does nothing on Up Arrow,
 * so the first attempt reports no effect for a widget that is behaving. Moving in the
 * opposite direction first is what separates a boundary from a dead key.
 */
const OPPOSITE_KEYS: Record<string, string> = {
   ArrowDown: 'ArrowUp',
   ArrowLeft: 'ArrowRight',
   ArrowRight: 'ArrowLeft',
   ArrowUp: 'ArrowDown',
   End: 'Home',
   Home: 'End',
   PageDown: 'PageUp',
   PageUp: 'PageDown',
};

export interface KeyboardProbeContext {
   page: Page;
   selector: string;
   /** Returns the page to the state the keyboard table documents. */
   reset: () => Promise<void>;
   setupKeys: string[];
}

interface PressOutcome {
   changes: ApgKeyboardCheckRow['observedChanges'];
   focusedElement: string;
}

function oppositeKey(chord: string): string | undefined {
   const last = chord.split('+').at(-1);
   return last ? OPPOSITE_KEYS[last] : undefined;
}

async function pressKey(page: Page, chord: string): Promise<void> {
   await page.keyboard.press(chord);
   await page.waitForTimeout(SETTLE_MS);
}

async function prepare(context: KeyboardProbeContext): Promise<string> {
   await context.reset();
   await runInOrder(context.setupKeys, (chord) => pressKey(context.page, chord));
   return focusWidget(context.page, context.selector);
}

/** Presses one chord from the documented starting state and reports what changed. */
async function pressAndDiff(
   context: KeyboardProbeContext,
   chord: string,
   nudge?: string,
): Promise<PressOutcome> {
   const focusedElement = await prepare(context);
   if (nudge) {
      await pressKey(context.page, nudge);
   }

   const before = await observeWidget(context.page, context.selector);
   await pressKey(context.page, chord);
   const after = await observeWidget(context.page, context.selector);

   return { changes: diffObservations(before, after), focusedElement };
}

/** One chord, tried from the documented state and then again off a boundary. */
async function tryChord(
   context: KeyboardProbeContext,
   chord: string,
): Promise<(PressOutcome & { decidedBy: 'initial' | 'nudged' }) | undefined> {
   const initial = await pressAndDiff(context, chord);
   if (initial.changes.length > 0) {
      return { ...initial, decidedBy: 'initial' };
   }

   const nudge = oppositeKey(chord);
   if (!nudge) {
      return undefined;
   }

   const nudged = await pressAndDiff(context, chord, nudge);
   return nudged.changes.length > 0 ? { ...nudged, decidedBy: 'nudged' } : undefined;
}

function readChords(row: ApgKeyboardRow): { chords: string[]; untestable?: string } {
   const chords: string[] = [];
   let untestable: string | undefined = undefined;

   for (const group of row.keyGroups) {
      const mapped = toPlaywrightKeys(group);
      if ('chord' in mapped) {
         chords.push(mapped.chord);
         continue;
      }
      untestable ??= mapped.untestable;
   }

   return untestable === undefined ? { chords } : { chords, untestable };
}

function buildRowBase(
   row: ApgKeyboardRow,
   index: number,
): Pick<ApgKeyboardCheckRow, 'testId' | 'rowKey' | 'keys' | 'description'> {
   return {
      ...(row.testId === undefined ? {} : { testId: row.testId }),
      rowKey: buildRowKey(row.testId, index),
      keys: row.keyGroups.flat(),
      description: row.description,
   };
}

/**
 * Tries every alternative the row lists, in order, and stops at the first that changes
 * something. The APG lists them as alternatives rather than as a sequence, so one is
 * enough.
 */
async function firstChordThatChanges(
   context: KeyboardProbeContext,
   chords: string[],
): Promise<
   (PressOutcome & { decidedBy: 'initial' | 'nudged'; chord: string }) | undefined
> {
   let found:
      | (PressOutcome & { decidedBy: 'initial' | 'nudged'; chord: string })
      | undefined = undefined;

   await runInOrder(chords, async (chord) => {
      if (found) {
         return;
      }
      const outcome = await tryChord(context, chord);
      if (outcome) {
         found = { ...outcome, chord };
      }
   });

   return found;
}

async function probeRow(
   context: KeyboardProbeContext,
   row: ApgKeyboardRow,
   index: number,
): Promise<ApgKeyboardCheckRow> {
   const base = buildRowBase(row, index);
   const { chords, untestable } = readChords(row);

   if (chords.length === 0) {
      return {
         ...base,
         status: 'not-testable',
         reason: untestable ?? 'no browser key matches this row',
         observedChanges: [],
      };
   }

   const changed = await firstChordThatChanges(context, chords);
   if (changed) {
      return {
         ...base,
         chord: changed.chord,
         status: 'changed',
         focusedElement: changed.focusedElement,
         observedChanges: changed.changes,
         decidedBy: changed.decidedBy,
      };
   }

   return {
      ...base,
      chord: chords[0],
      status: 'no-observable-effect',
      focusedElement: await focusWidget(context.page, context.selector),
      observedChanges: [],
      decidedBy: 'nudged',
   };
}

/**
 * Presses every key one keyboard table declares and reports what changed.
 *
 * The only verdict the tool reaches on its own is the negative one: the APG says this key
 * does something, and nothing observable happened. Everything else is reported as an
 * observation next to the guide's own description, for a person to judge.
 *
 * The rows run one at a time. Each press depends on the state the last one left, so they
 * can never run concurrently.
 */
export async function probeApgKeyboard(
   context: KeyboardProbeContext,
   table: ApgKeyboardTable,
): Promise<ApgKeyboardCheckRow[]> {
   const rows: ApgKeyboardCheckRow[] = [];
   await runInOrder(table.rows, async (row, index) => {
      rows.push(await probeRow(context, row, index));
   });
   return rows;
}

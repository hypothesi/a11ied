import { expect } from 'vitest';

import { runA1, runA1Json, type CommandOptions } from './run-a1.js';

/*
 * The parts of `a1 --json` results the example suites read. Each guard checks the field
 * the suite relies on, so a changed envelope fails a test instead of passing an empty one.
 */

export interface AxeResult {
   violations: Array<{ id: string; nodes: Array<{ target: string[] }> }>;
   verdict: { passed: boolean };
}

export interface CheckRow {
   rowKey: string;
   status: string;
   reason?: string;
   observedValue?: string;
   recorded?: { outcome: string; stale: boolean };
}

export interface CheckResult {
   keyboardRows: CheckRow[];
   attributeRows: CheckRow[];
   applicabilityHints: Array<{ attribute: string }>;
}

export interface BatchResult {
   failedExpectations: number;
   failedActions: number;
   exitCode: number;
}

/** One judgment to record about an APG row: what was decided, and why. */
export interface Judgment {
   rowKey: string;
   outcome: 'passed' | 'failed' | 'inapplicable';
   note: string;
}

/** The target, example, and widget a set of `pattern` commands share. */
export interface PatternTarget {
   url: string;
   example: string;
   selector: string;
   /** A selector for the element to click first, for a widget rendered only after a click. */
   click?: string;
   /** Who or what records judgments, for `--by`. */
   recordedBy: string;
}

export const EXIT_SUCCESS = 0;
const START_ARGS = ['--sr', 'virtual', '--allow-virtual', '--idle-timeout', '1'];

export function isAxeResult(value: unknown): value is AxeResult {
   return typeof value === 'object' && value !== null && 'verdict' in value;
}

export function isCheckResult(value: unknown): value is CheckResult {
   return typeof value === 'object' && value !== null && 'keyboardRows' in value;
}

export function isBatchResult(value: unknown): value is BatchResult {
   return typeof value === 'object' && value !== null && 'failedExpectations' in value;
}

function clickArgs(target: PatternTarget): string[] {
   return target.click === undefined ? [] : ['--click', target.click];
}

/** Runs `a1 pattern check` and returns its result, with recorded judgments when given. */
export async function checkPattern(
   target: PatternTarget,
   options: { results?: string; table?: string; setup?: string } = {},
): Promise<CheckResult> {
   const run = await runA1Json([
      'pattern',
      'check',
      target.url,
      '--pattern',
      target.example,
      '--selector',
      target.selector,
      ...clickArgs(target),
      ...(options.table === undefined ? [] : ['--table', options.table]),
      ...(options.setup === undefined ? [] : ['--setup', options.setup]),
      ...(options.results === undefined ? [] : ['--results', options.results]),
   ]);
   if (!isCheckResult(run.result)) {
      throw new Error('pattern check printed no result');
   }
   return run.result;
}

async function recordRow(
   target: PatternTarget,
   judgment: Judgment,
   results: string,
): Promise<void> {
   const recorded = await runA1([
      'pattern',
      'record',
      target.url,
      '--pattern',
      target.example,
      '--row',
      judgment.rowKey,
      '--outcome',
      judgment.outcome,
      '--selector',
      target.selector,
      ...clickArgs(target),
      '--note',
      judgment.note,
      '--by',
      target.recordedBy,
      '--results',
      results,
   ]);

   expect(recorded.status, recorded.stderr).toBe(EXIT_SUCCESS);
}

/** Records judgments one at a time, because each one appends to the same evidence file. */
export async function recordRows(
   target: PatternTarget,
   judgments: Judgment[],
   results: string,
): Promise<void> {
   const [first, ...rest] = judgments;
   if (first === undefined) {
      return;
   }
   await recordRow(target, first, results);
   await recordRows(target, rest, results);
}

/** The row keys `a1 pattern pending` lists for the target. */
export async function pendingRows(
   target: PatternTarget,
   results: string,
): Promise<unknown> {
   const run = await runA1Json([
      'pattern',
      'pending',
      target.url,
      '--pattern',
      target.example,
      '--results',
      results,
   ]);
   return run.result;
}

/** Starts a reader on the page, runs one batch file over it, and stops the reader. */
export async function runBatch(
   url: string,
   batchFile: string,
   options: Pick<CommandOptions, 'stateDir'>,
): Promise<{ status: number; result: unknown }> {
   const started = await runA1(['sr', 'start', url, ...START_ARGS], options);

   expect(started.status, started.stderr).toBe(EXIT_SUCCESS);
   try {
      return await runA1Json(['sr', 'batch', batchFile], options);
   } finally {
      await runA1(['sr', 'stop'], options);
   }
}

/** Runs `a1 axe` at WCAG level AA, scoped to one selector, after an optional click. */
export async function scanAtAA(
   url: string,
   selector: string,
   click?: string,
): Promise<{ status: number; result: unknown }> {
   return runA1Json([
      'axe',
      url,
      '--selector',
      selector,
      ...(click === undefined ? [] : ['--click', click]),
      '--level',
      'AA',
   ]);
}

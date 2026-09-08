import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { CaseOutcome } from './run.js';

const packageRoot = resolve(import.meta.dirname, '..');

/** Matches the indent oxfmt writes for the repo's other committed JSON. */
const JSON_INDENT = 3;

export const BASELINE_PATH = join(packageRoot, 'baseline.json');

export interface BaselineEntry {
   actRuleId: string;
   axeRuleId: string;
   testcaseId: string;
   expected: string;
   actual: string;
}

export interface Baseline {
   /**
    * Contradictions that already existed when the check was switched on. axe-core's own
    * W3C-accepted report contains 111 of them, so a check that fails on any contradiction
    * would never pass. These are recorded so a new one still fails.
    */
   contradictions: BaselineEntry[];
}

export interface BaselineDiff {
   added: BaselineEntry[];
   removed: BaselineEntry[];
}

function toKey(entry: BaselineEntry): string {
   return [
      entry.actRuleId,
      entry.axeRuleId,
      entry.testcaseId,
      entry.expected,
      entry.actual,
   ].join('|');
}

/** The contradictions in a run, in the order the baseline stores them. */
export function listContradictions(outcomes: CaseOutcome[]): BaselineEntry[] {
   return outcomes
      .filter((outcome) => outcome.contradiction)
      .map((outcome) => ({
         actRuleId: outcome.actRuleId,
         axeRuleId: outcome.axeRuleId,
         testcaseId: outcome.testcaseId,
         expected: outcome.expected,
         actual: outcome.actual,
      }))
      .toSorted((left, right) => toKey(left).localeCompare(toKey(right)));
}

/**
 * Compares a run against the baseline in both directions. A new contradiction is a
 * regression. A contradiction that disappeared means the baseline is stale, and leaving
 * it in place would hide the next regression on that rule.
 */
export function diffBaseline(baseline: Baseline, current: BaselineEntry[]): BaselineDiff {
   const baselineKeys = new Set(baseline.contradictions.map((entry) => toKey(entry)));
   const currentKeys = new Set(current.map((entry) => toKey(entry)));

   return {
      added: current.filter((entry) => !baselineKeys.has(toKey(entry))),
      removed: baseline.contradictions.filter((entry) => !currentKeys.has(toKey(entry))),
   };
}

/** Reads the committed baseline, treating a missing file as an empty one. */
export async function readBaseline(): Promise<Baseline> {
   try {
      const parsed: unknown = JSON.parse(await readFile(BASELINE_PATH, 'utf8'));
      if (
         typeof parsed === 'object' &&
         parsed !== null &&
         'contradictions' in parsed &&
         Array.isArray(parsed.contradictions)
      ) {
         return { contradictions: parsed.contradictions };
      }
      return { contradictions: [] };
   } catch {
      return { contradictions: [] };
   }
}

export async function writeBaseline(entries: BaselineEntry[]): Promise<void> {
   const body = JSON.stringify({ contradictions: entries }, undefined, JSON_INDENT);
   await writeFile(BASELINE_PATH, `${body}\n`, 'utf8');
}

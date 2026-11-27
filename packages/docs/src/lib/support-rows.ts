import { formatOutcomeLabel, type TestOutcome } from '@a11ied/support-data/types';
import { formatScreenReader } from './support-grouping';

const OUTCOME_ORDER: readonly TestOutcome[] = [
   'pass',
   'partial',
   'fail',
   'not-applicable',
   'untested',
];

/**
 * A group's row count with its outcomes, such as "13 results: 4 pass, 9 fail", so a
 * reader can judge the group before reading its rows.
 */
export function formatGroupCount(outcomes: readonly string[], noun: string): string {
   const total = outcomes.length;
   const countText = `${String(total)} ${total === 1 ? noun : `${noun}s`}`;
   const tallies = OUTCOME_ORDER.map((outcome) => ({
      label: formatOutcomeLabel(outcome).toLowerCase(),
      count: outcomes.filter((each) => each === outcome).length,
   })).filter((tally) => tally.count > 0);
   const [first] = tallies;

   if (!first) {
      return countText;
   }
   if (tallies.length === 1) {
      return `${countText}: ${total === 1 ? '' : 'all '}${first.label}`;
   }

   return `${countText}: ${tallies.map((tally) => `${String(tally.count)} ${tally.label}`).join(', ')}`;
}

/** The screen reader label for a row, or nothing when it only repeats the group heading. */
export function formatRowScreenReader(groupTitle: string, version: string): string {
   const label = formatScreenReader(groupTitle, version);

   return label === groupTitle ? '' : label;
}

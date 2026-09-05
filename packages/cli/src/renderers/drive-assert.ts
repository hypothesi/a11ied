import chalk from 'chalk';
import type { CliOutputEnvelope } from '#contracts';
import type { ExpectationResult } from '#core';
import { dim, fields, indent, title } from '../lib/format.js';
import { verdictLines } from './drive.js';

function isExpectation(value: unknown): value is ExpectationResult {
   return (
      typeof value === 'object' &&
      value !== null &&
      'passed' in value &&
      'expected' in value &&
      'checked' in value
   );
}

/** Text for `sr expect`: what was expected, where it was looked for, and the verdict. */
export function renderDriveExpectText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const expectation = envelope.result?.expectation;
   if (!isExpectation(expectation)) {
      return 'No result.';
   }
   const entries: Array<[string, string]> = [
      ['Expected', `${expectation.not ? 'not ' : ''}${expectation.expected}`],
      [
         'Checked',
         `${String(expectation.checked)} phrases${expectation.since === undefined ? '' : ` since "${expectation.since}"`}`,
      ],
      [
         'Matched',
         expectation.entry ? chalk.bold(expectation.entry.phrase) : dim('nothing'),
      ],
      ['Result', expectation.passed ? chalk.green('pass') : chalk.red('fail')],
   ];
   return [
      title('sr expect'),
      ...indent(fields(entries)),
      ...verdictLines(envelope),
   ].join('\n');
}

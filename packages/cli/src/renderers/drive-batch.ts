import chalk from 'chalk';
import type { CliOutputEnvelope, DriverBatchStep } from '#contracts';
import type { BatchStepResult } from '#core';
import { count, dim, symbols, title } from '../lib/format.js';
import { verdictLines } from './drive.js';

function describeStep(step: DriverBatchStep): string {
   if (step.action === 'expect') {
      const prefix = step.payload.not ? 'expect not ' : 'expect ';
      const since =
         step.payload.since === undefined ? '' : ` since "${step.payload.since}"`;
      return `${prefix}${step.payload.match}${since}`;
   }
   if (!('payload' in step) || step.payload === undefined) {
      return step.action;
   }
   return `${step.action} ${JSON.stringify(step.payload)}`;
}

function isStepResult(value: unknown): value is BatchStepResult {
   return typeof value === 'object' && value !== null && 'line' in value && 'ok' in value;
}

function describeOutcome(step: BatchStepResult): string {
   if (step.error) {
      return chalk.red(step.error.message);
   }
   if (step.expectation) {
      return chalk.green('pass');
   }
   const phrase = step.outcome?.phrase;
   return phrase ? dim(phrase) : '';
}

function stepLine(step: BatchStepResult): string {
   const mark = step.ok ? symbols.pass : symbols.fail;
   return `${mark} ${String(step.line)}. ${describeStep(step.step)}  ${describeOutcome(step)}`;
}

/** Text for `sr batch`: one line per step with its outcome, then the totals. */
export function renderDriveBatchText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = envelope.result;
   const steps = Array.isArray(result?.steps) ? result.steps.filter(isStepResult) : [];
   const total = typeof result?.total === 'number' ? result.total : steps.length;
   const failed = steps.filter((step) => !step.ok).length;
   const summary =
      failed === 0
         ? chalk.green(`${count(steps.length, 'step')} passed.`)
         : chalk.red(
              `${count(failed, 'step')} failed, ${String(steps.length)} of ${String(total)} ran.`,
           );
   return [
      title('sr batch'),
      ...steps.map((step) => stepLine(step)),
      '',
      summary,
      ...verdictLines(envelope),
   ].join('\n');
}

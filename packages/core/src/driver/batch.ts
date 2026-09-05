import {
   cliExitCodes,
   type DriverActionResult,
   type DriverBatchExpectStep,
   type DriverBatchStep,
   type DriverCurrentItem,
} from '@a11ied/contracts';

import { openBrokerConnection, type BrokerConnection } from './broker-connection.js';
import type { BrokerRequest } from './broker-types.js';
import {
   describeExpectationFailure,
   evaluateExpectation,
   type ExpectationResult,
} from './expectation.js';
import { parseTextMatcher } from './matcher.js';
import { getActiveDriverSession } from './runtime.js';
import { parseBrokerActionResult } from './runtime-support.js';
import { createMissingSessionError } from './session-utils.js';
import { CliEnvironmentError, CliUsageError } from '../errors/cli-errors.js';

export interface BatchStepError {
   code: string;
   message: string;
   exitCode: number;
}

/** What one step left behind, without the transcript the full action result repeats. */
export interface BatchStepOutcome {
   action: string;
   phrase?: string;
   item?: DriverCurrentItem;
   details?: Record<string, unknown>;
}

export interface BatchStepResult {
   /** One-based line number in the batch. */
   line: number;
   step: DriverBatchStep;
   ok: boolean;
   outcome?: BatchStepOutcome;
   expectation?: ExpectationResult;
   error?: BatchStepError;
}

function toOutcome(result: DriverActionResult): BatchStepOutcome {
   const outcome: BatchStepOutcome = { action: result.action };
   if (result.state.lastSpokenPhrase) {
      outcome.phrase = result.state.lastSpokenPhrase;
   }
   if (result.state.currentItem) {
      outcome.item = result.state.currentItem;
   }
   if (result.details) {
      outcome.details = result.details;
   }
   return outcome;
}

export interface BatchRunOptions {
   steps: DriverBatchStep[];
   /** Keep going after a failed expect or a failed action. */
   continueOnFailure?: boolean | undefined;
   timeoutMs?: number | undefined;
}

export interface BatchRunResult {
   steps: BatchStepResult[];
   /** How many lines ran; fewer than the batch length when it stopped early. */
   ran: number;
   failedExpectations: number;
   failedActions: number;
   /**
    * The exit code the batch as a whole earns: 4 for a failed expect, else the first
    * error's.
    */
   exitCode: number;
}

function toStepError(error: unknown): BatchStepError {
   if (error instanceof CliUsageError || error instanceof CliEnvironmentError) {
      return { code: error.code, message: error.message, exitCode: error.exitCode };
   }
   return {
      code: 'batch-step-failed',
      message: error instanceof Error ? error.message : String(error),
      exitCode: cliExitCodes.internal,
   };
}

async function sendAction(
   connection: BrokerConnection,
   request: BrokerRequest,
): Promise<DriverActionResult> {
   const response = await connection.send(request);
   return parseBrokerActionResult({
      actionErrorMessage: `Could not run driver action "${String(request.action)}".`,
      response,
   });
}

async function runExpectStep(
   connection: BrokerConnection,
   step: DriverBatchExpectStep,
   line: number,
): Promise<BatchStepResult> {
   const result = await sendAction(connection, {
      command: 'action',
      action: 'transcript',
   });
   const expectation = evaluateExpectation(result.state.transcript, {
      matcher: parseTextMatcher(step.payload.match),
      since: step.payload.since,
      not: step.payload.not,
   });
   if (expectation.passed) {
      return { line, step, ok: true, expectation };
   }
   return {
      line,
      step,
      ok: false,
      expectation,
      error: {
         code: 'expectation-failed',
         message: describeExpectationFailure(expectation),
         exitCode: cliExitCodes.assertion,
      },
   };
}

interface StepArgs {
   connection: BrokerConnection;
   step: DriverBatchStep;
   line: number;
   timeoutMs: number | undefined;
}

async function runStep({
   connection,
   step,
   line,
   timeoutMs,
}: StepArgs): Promise<BatchStepResult> {
   try {
      if (step.action === 'expect') {
         return await runExpectStep(connection, step, line);
      }
      const result = await sendAction(connection, {
         command: 'action',
         action: step.action,
         payload: 'payload' in step ? step.payload : undefined,
         timeoutMs,
      });
      return { line, step, ok: true, outcome: toOutcome(result) };
   } catch (error) {
      return { line, step, ok: false, error: toStepError(error) };
   }
}

function summarize(steps: BatchStepResult[], total: number): BatchRunResult {
   const failedExpectations = steps.filter(
      (step) => step.error?.code === 'expectation-failed',
   ).length;
   const failedActions = steps.filter(
      (step) => !step.ok && step.error?.code !== 'expectation-failed',
   ).length;
   const firstError = steps.find((step) => !step.ok)?.error;
   let exitCode: number = cliExitCodes.success;
   if (failedExpectations > 0) {
      exitCode = cliExitCodes.assertion;
   } else if (firstError) {
      exitCode = firstError.exitCode;
   }
   return {
      steps,
      ran: Math.min(steps.length, total),
      failedExpectations,
      failedActions,
      exitCode,
   };
}

async function runSteps(args: {
   connection: BrokerConnection;
   options: BatchRunOptions;
   done: BatchStepResult[];
}): Promise<BatchStepResult[]> {
   const index = args.done.length;
   const step = args.options.steps[index];
   if (step === undefined) {
      return args.done;
   }
   const outcome = await runStep({
      connection: args.connection,
      step,
      line: index + 1,
      timeoutMs: args.options.timeoutMs,
   });
   const done = [...args.done, outcome];
   if (!outcome.ok && !args.options.continueOnFailure) {
      return done;
   }
   return runSteps({ ...args, done });
}

/**
 * Runs every line over one broker connection in this process. Stops at the first failed
 * expect or failed action unless `continueOnFailure` is set.
 */
export async function runDriverSessionBatch(
   options: BatchRunOptions,
): Promise<BatchRunResult> {
   const session = await getActiveDriverSession();
   if (!session) {
      throw createMissingSessionError();
   }
   const connection = openBrokerConnection(session);
   try {
      const steps = await runSteps({ connection, options, done: [] });
      return summarize(steps, options.steps.length);
   } finally {
      connection.close();
   }
}

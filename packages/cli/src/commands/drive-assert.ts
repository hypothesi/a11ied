import type { Command } from 'commander';
import {
   cliExitCodes,
   DEFAULT_WAIT_PAUSE_MS,
   DEFAULT_WAIT_TIMEOUT_MS,
   type CliMessage,
   type DriverActionResult,
   type DriverWaitPayload,
} from '#contracts';
import type { CommandExecution } from '../lib/helpers.js';
import { addJsonOption, addVerboseOption } from '../lib/options.js';
import {
   addDriveActionOptions,
   parseCountOption,
   parseTimeoutMs,
   type DriveActionOptions,
} from './drive-options.js';

interface WaitOptions {
   json?: boolean;
   verbose?: boolean;
   for?: string;
   ms?: string;
   timeout?: string;
}

interface ExpectOptions extends DriveActionOptions {
   since?: string;
   not?: boolean;
}

/** Fails `sr wait --for` with exit code 4 when the phrase never arrived. */
export function waitVerdict(result: DriverActionResult): CliMessage | undefined {
   if (result.details?.matched !== false) {
      return undefined;
   }
   return {
      code: 'phrase-not-announced',
      message: `${String(result.details.for)} was not announced within ${String(result.details.waitedMs)} ms.`,
      details: result.details,
   };
}

function buildWaitPayload(options: WaitOptions): DriverWaitPayload {
   const payload: DriverWaitPayload = {
      timeoutMs: parseTimeoutMs(options.timeout) ?? DEFAULT_WAIT_TIMEOUT_MS,
   };
   if (options.for !== undefined) {
      payload.for = options.for;
   }
   const ms = parseCountOption(options.ms, 'ms');
   if (ms !== undefined) {
      payload.ms = ms;
   }
   return payload;
}

export function registerWaitCommand(driveCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         driveCommand
            .command('wait')
            .description(
               'Pause, or wait until the reader announces a phrase. Polls the transcript, so a phrase that arrives between two commands is not missed. Exits 4 on timeout.',
            )
            .option('--for <text|/regex/>', 'The phrase to wait for; text ignores case.')
            .option(
               '--ms <n>',
               `Pause this long when --for is absent. Defaults to ${String(DEFAULT_WAIT_PAUSE_MS)}.`,
            )
            .option(
               '--timeout <ms>',
               `Give up waiting for --for after this long. Defaults to ${String(DEFAULT_WAIT_TIMEOUT_MS)}.`,
            ),
      ),
   ).action(async (options: WaitOptions) => {
      const [{ executeDriveActionCommand }, { renderDriveReadText }] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);
      const payload = buildWaitPayload(options);
      await executeDriveActionCommand({
         subcommand: 'wait',
         commandLine: options.for === undefined ? 'wait' : `wait --for ${options.for}`,
         request: { action: 'wait', payload },
         // The reply may take the whole wait budget, so the socket waits that long too.
         options: { ...options, timeout: String(payload.timeoutMs) },
         renderText: renderDriveReadText,
         verdict: waitVerdict,
      });
   });
}

async function executeExpectAction(
   pattern: string,
   options: ExpectOptions,
): Promise<CommandExecution> {
   const core = await import('#core');
   const matcher = core.parseTextMatcher(pattern);
   const result = await core.runDriverSessionAction(
      { action: 'transcript' },
      { timeoutMs: parseTimeoutMs(options.timeout) },
   );
   const expectation = core.evaluateExpectation(result.state.transcript, {
      matcher,
      since: options.since,
      not: options.not,
   });
   const execution: CommandExecution = {
      target: { kind: 'driver-session', value: result.session.target },
      result: { action: 'expect', session: result.session, expectation },
   };
   if (expectation.passed) {
      return execution;
   }
   return {
      ...execution,
      ok: false,
      exitCode: cliExitCodes.assertion,
      errors: [
         {
            code: 'expectation-failed',
            message: core.describeExpectationFailure(expectation),
            details: { ...expectation },
         },
      ],
   };
}

export function registerExpectCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('expect <text|/regex/>')
         .description(
            'Check that the reader announced a phrase. Exits 4 when it did not, or with --not when it did.',
         )
         .option('--since <checkpoint>', 'Only count phrases after the named checkpoint.')
         .option('--not', 'Pass when the phrase was not announced.'),
   ).action(async (pattern: string, options: ExpectOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive-assert.js'),
      ]);
      await executeCommand(
         {
            family: 'sr',
            subcommand: 'expect',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => executeExpectAction(pattern, options),
         renderers.renderDriveExpectText,
      );
   });
}

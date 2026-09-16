import type { Command } from 'commander';
import {
   DEFAULT_READ_ALL_MAX,
   type CliMessage,
   type DriverActionResult,
} from '#contracts';
import type { CommandExecution } from '../lib/helpers.js';
import { addScreenReaderOption } from '../lib/options.js';
import { parseMaxOption } from './drive-loops.js';
import { addDriveActionOptions, DRIVE_GROUPS, parseTimeoutMs } from './drive-options.js';
import { executeOpenAction } from './drive-session.js';
import { executeStartAction, type StartActionOptions } from './drive-start.js';

interface WalkOptions extends StartActionOptions {
   max?: string;
   out?: string;
   format?: string;
}

/** Starts a session when none is active, or opens the URL in the active one. */
async function prepareWalkSession(
   url: string | undefined,
   options: WalkOptions,
): Promise<CliMessage[]> {
   const core = await import('#core');
   const session = await core.getActiveDriverSession();
   if (!session) {
      const started = await executeStartAction(url, options);
      return [
         {
            code: 'session-auto-started',
            message: 'No session was active, so one was started.',
         },
         ...(started.warnings ?? []),
      ];
   }
   if (url !== undefined) {
      await executeOpenAction(url, options);
   }
   return [];
}

async function readFromTop(options: WalkOptions): Promise<DriverActionResult> {
   const core = await import('#core');
   const timeoutMs = parseTimeoutMs(options.timeout);
   await core.runDriverSessionAction({ action: 'top' }, { timeoutMs });
   return core.runDriverSessionAction(
      {
         action: 'read-all',
         payload: { max: parseMaxOption(options.max, DEFAULT_READ_ALL_MAX) },
      },
      { timeoutMs },
   );
}

async function executeWalkAction(
   url: string | undefined,
   options: WalkOptions,
): Promise<CommandExecution> {
   const core = await import('#core');
   if (options.out) {
      core.resolveTranscriptFormat(options.out, options.format);
   }
   const warnings = await prepareWalkSession(url, options);
   const before = await core.getDriverSessionStatus({
      timeoutMs: parseTimeoutMs(options.timeout),
   });
   const result = await readFromTop(options);
   // Only what the reader said during this walk belongs in the walk's transcript.
   const entries = result.state.transcript.slice(before.state.transcript.length);
   const transcript = core.buildDriverTranscript(result.session, entries);
   const file = options.out
      ? await core.writeDriverTranscript({
           transcript,
           outPath: options.out,
           format: options.format,
        })
      : undefined;
   return {
      target: { kind: 'driver-session', value: result.session.target },
      result: { ...result, commandLine: url ? `walk ${url}` : 'walk', transcript, file },
      warnings,
   };
}

export function registerWalkCommand(driveCommand: Command): void {
   addDriveActionOptions(
      addScreenReaderOption(
         driveCommand
            .command('walk [url]')
            .helpGroup(DRIVE_GROUPS.move)
            .summary('Read a whole page, starting the session if needed.')
            .description(
               'Read the whole page top to bottom and print the transcript. Starts a session when none is active, defaulting to VoiceOver; with a URL, opens that page first. Pass --sr virtual for the simulated reader instead.',
            ),
      )
         .option(
            '--max <n>',
            `Stop after this many items. Defaults to ${String(DEFAULT_READ_ALL_MAX)}.`,
         )
         .option(
            '--out <path>',
            'Also write the transcript of the walk to a .json or .md file.',
         )
         .option(
            '--format <format>',
            'Transcript format, json or md. Defaults to the --out extension.',
         ),
   ).action(async (url: string | undefined, options: WalkOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive-loops.js'),
      ]);
      await executeCommand(
         {
            family: 'sr',
            subcommand: 'walk',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => executeWalkAction(url, options),
         renderers.renderDriveWalkText,
      );
   });
}

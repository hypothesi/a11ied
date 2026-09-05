import type { Command } from 'commander';
import type { CommandExecution } from '../lib/helpers.js';
import {
   addDriveActionOptions,
   parseCountOption,
   parseTimeoutMs,
   type DriveActionOptions,
} from './drive-options.js';

interface TranscriptActionOptions extends DriveActionOptions {
   since?: string;
   tail?: string;
   out?: string;
   format?: string;
}

async function executeTranscriptAction(
   options: TranscriptActionOptions,
): Promise<CommandExecution> {
   const [{ createNoSessionError }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('#core'),
   ]);
   const session = await core.getActiveDriverSession();
   if (!session) {
      throw createNoSessionError();
   }
   if (options.out) {
      core.resolveTranscriptFormat(options.out, options.format);
   }
   const result = await core.runDriverSessionAction(
      { action: 'transcript' },
      { timeoutMs: parseTimeoutMs(options.timeout) },
   );
   const entries = core.selectTranscriptEntries(result.state.transcript, {
      since: options.since,
      tail: parseCountOption(options.tail, 'tail'),
   });
   const transcript = core.buildDriverTranscript(result.session, entries);
   const file = options.out
      ? await core.writeDriverTranscript({
           transcript,
           outPath: options.out,
           format: options.format,
        })
      : undefined;
   return {
      target: { kind: 'driver-session', value: session.target },
      result: { action: 'transcript', session: result.session, transcript, file },
   };
}

export function registerTranscriptCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('transcript')
         .description('Print what the reader said, with timestamps and checkpoints.')
         .option('--since <checkpoint>', 'Only entries after the named checkpoint.')
         .option('--tail <count>', 'Only the last N phrases.')
         .option('--out <path>', 'Write the transcript to a .json or .md file.')
         .option(
            '--format <format>',
            'Transcript format, json or md. Defaults to the --out extension.',
         ),
   ).action(async (options: TranscriptActionOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive-transcript.js'),
      ]);
      await executeCommand(
         {
            family: 'sr',
            subcommand: 'transcript',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => executeTranscriptAction(options),
         renderers.renderDriveTranscriptText,
      );
   });
}

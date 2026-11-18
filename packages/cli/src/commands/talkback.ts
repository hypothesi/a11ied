import type { Command } from 'commander';
import type { CliOutputEnvelope } from '#contracts';
import type { TalkBackKey, TalkBackStep } from '#core';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import type { CommandExecution } from '../lib/helpers.js';

interface TalkBackOptions {
   serial?: string;
   json?: boolean;
}

interface WalkOptions extends TalkBackOptions {
   key: string;
   count: string;
}

const DEFAULT_WALK_COUNT = '10';

function renderSteps(envelope: CliOutputEnvelope): string {
   const steps = envelope.result?.['steps'];
   if (!Array.isArray(steps)) {
      return envelope.ok ? String(envelope.result?.['message'] ?? 'Done.') : '';
   }
   return steps
      .map((step: TalkBackStep) => {
         const spoken = step.spoken.length === 0 ? '(silent)' : step.spoken.join(' | ');
         return `${String(step.step)}. ${step.key}: ${spoken}`;
      })
      .join('\n');
}

async function run(
   subcommand: string,
   options: TalkBackOptions,
   handler: () => Promise<CommandExecution>,
): Promise<void> {
   const { executeCommand } = await import('../lib/execute.js');
   await executeCommand(
      { family: 'talkback', subcommand, wcagVersion: undefined, json: options.json },
      handler,
      renderSteps,
   );
}

async function walk(options: WalkOptions): Promise<CommandExecution> {
   const core = await import('#core');
   const { key } = options;
   const count = Number(options.count);
   if (!core.isTalkBackKey(key)) {
      throw new core.CliUsageError(
         'invalid-key',
         `Unknown key "${key}". Use one of: ${Object.keys(core.TALKBACK_KEYS).join(', ')}.`,
      );
   }
   if (!Number.isInteger(count) || count < 1) {
      throw new core.CliUsageError(
         'invalid-count',
         '--count must be a whole number above 0.',
      );
   }
   const keys: TalkBackKey[] = Array.from({ length: count }, () => key);
   const steps = await core.walkWithTalkBack({ serial: options.serial, keys });
   return { result: { steps } };
}

function addCommonOptions(command: Command): Command {
   return command
      .option(
         '--serial <id>',
         'Device serial when more than one is attached (adb devices).',
      )
      .option('--json', 'Print JSON instead of human-readable text.');
}

/**
 * Registers `a1 talkback`: drive TalkBack on an Android device over adb and record its
 * speech.
 */
export function registerTalkBackCommand(program: Command): void {
   const talkback = program
      .command('talkback')
      .helpGroup(TOP_LEVEL_GROUPS.drive)
      .summary('Turn TalkBack on or off on an Android device and record what it says.')
      .description(
         'Drives TalkBack over adb on a phone or a Google Play emulator image. TalkBack must ' +
            'log its speech: set TalkBack settings > Advanced settings > Developer settings > ' +
            'Log output level to VERBOSE once per device.',
      );

   addCommonOptions(talkback.command('on').summary('Turn TalkBack on.')).action(
      async (options: TalkBackOptions) => {
         await run('on', options, async () => {
            const core = await import('#core');
            await core.enableTalkBack({ serial: options.serial });
            return { result: { message: 'TalkBack is on.' } };
         });
      },
   );

   addCommonOptions(talkback.command('off').summary('Turn TalkBack off.')).action(
      async (options: TalkBackOptions) => {
         await run('off', options, async () => {
            const core = await import('#core');
            await core.disableTalkBack({ serial: options.serial });
            return { result: { message: 'TalkBack is off.' } };
         });
      },
   );

   addCommonOptions(
      talkback
         .command('walk')
         .summary('Press a key repeatedly and print what TalkBack said after each press.')
         .option(
            '--key <key>',
            'next (Tab), previous (Shift+Tab), activate (Enter), up, or down.',
            'next',
         )
         .option('--count <n>', 'How many times to press it.', DEFAULT_WALK_COUNT),
   ).action(async (options: WalkOptions) => {
      await run('walk', options, async () => walk(options));
   });
}

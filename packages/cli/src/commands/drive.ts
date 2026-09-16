import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import {
   registerCheckpointCommand,
   registerFocusCommand,
   registerNavigationCommands,
   registerPressCommand,
   registerReadCommand,
   registerTypeCommand,
} from './drive-actions.js';
import { registerExpectCommand, registerWaitCommand } from './drive-assert.js';
import { registerBatchCommand } from './drive-batch.js';
import { registerDoCommand, registerListCommand } from './drive-command-sets.js';
import {
   registerElementsCommand,
   registerGotoCommand,
   registerReadAllCommand,
} from './drive-loops.js';
import {
   registerOpenCommand,
   registerStatusCommand,
   registerStopCommand,
} from './drive-session.js';
import { registerStartCommand } from './drive-start.js';
import {
   registerFindCommand,
   registerTableCommand,
   registerTitleCommand,
} from './drive-structure.js';
import { DRIVE_GROUPS } from './drive-options.js';
import { registerScreenshotCommand } from './drive-screenshot.js';
import { registerTranscriptCommand } from './drive-transcript.js';
import { registerWalkCommand } from './drive-walk.js';

const SR_EXAMPLES = `
Examples:
  a1 sr start --sr virtual
  a1 sr next heading
  a1 sr read
`;

/**
 * The sr subcommands in the order `sr --help` lists them, grouped by what a reader wants
 * to do. registerNavigationCommands emits both "Move through the page" and "Act on it"
 * commands; each one carries its own .helpGroup(), so the two groups stay separated in
 * the listing even though they are registered together.
 */
const registrars: ReadonlyArray<(driveCommand: Command) => void> = [
   registerStartCommand,
   registerOpenCommand,
   registerStopCommand,
   registerStatusCommand,
   registerReadCommand,
   registerTitleCommand,
   registerNavigationCommands,
   registerFindCommand,
   registerTableCommand,
   registerGotoCommand,
   registerElementsCommand,
   registerReadAllCommand,
   registerWalkCommand,
   registerPressCommand,
   registerTypeCommand,
   registerDoCommand,
   registerFocusCommand,
   registerWaitCommand,
   registerExpectCommand,
   registerCheckpointCommand,
   registerTranscriptCommand,
   registerScreenshotCommand,
   registerBatchCommand,
   registerListCommand,
];

function registerDriverCommands(program: Command, commandName: string): void {
   const driveCommand = program
      .command(commandName)
      .helpGroup(TOP_LEVEL_GROUPS.drive)
      .summary('Read a page as VoiceOver, NVDA, or the simulated reader does.')
      .description('Control a target screen reader through stable sessions.')
      .addHelpText('after', SR_EXAMPLES)
      // Realizes the help command now, so it lands in this group, not "Commands:".
      .commandsGroup(DRIVE_GROUPS.other)
      .helpCommand('help [command]', 'display help for command');

   for (const register of registrars) {
      register(driveCommand);
   }
}

export function registerSessionCommands(program: Command): void {
   registerDriverCommands(program, 'sr');
}

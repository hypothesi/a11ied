import type { Command } from 'commander';
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
import { registerScreenshotCommand } from './drive-screenshot.js';
import { registerTranscriptCommand } from './drive-transcript.js';
import { registerWalkCommand } from './drive-walk.js';

/** The sr subcommands in the order `sr --help` lists them. */
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
   registerScreenshotCommand,
   registerWaitCommand,
   registerExpectCommand,
   registerCheckpointCommand,
   registerTranscriptCommand,
   registerBatchCommand,
   registerListCommand,
];

function registerDriverCommands(program: Command, commandName: string): void {
   const driveCommand = program
      .command(commandName)
      .description('Control a target screen reader through stable sessions.');

   for (const register of registrars) {
      register(driveCommand);
   }
}

export function registerSessionCommands(program: Command): void {
   registerDriverCommands(program, 'sr');
}

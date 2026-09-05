import type { Command } from 'commander';
import {
   registerCheckpointCommand,
   registerFocusCommand,
   registerNavigationCommands,
   registerPressCommand,
   registerReadCommand,
   registerTypeCommand,
} from './drive-actions.js';
import { registerDoCommand, registerListCommand } from './drive-command-sets.js';
import {
   registerOpenCommand,
   registerStatusCommand,
   registerStopCommand,
} from './drive-session.js';
import { registerStartCommand } from './drive-start.js';
import { registerTranscriptCommand } from './drive-transcript.js';

function registerDriverCommands(program: Command, commandName: string): void {
   const driveCommand = program
      .command(commandName)
      .description('Control a target screen reader through stable sessions.');

   registerStartCommand(driveCommand);
   registerOpenCommand(driveCommand);
   registerStopCommand(driveCommand);
   registerStatusCommand(driveCommand);
   registerReadCommand(driveCommand);
   registerNavigationCommands(driveCommand);
   registerPressCommand(driveCommand);
   registerTypeCommand(driveCommand);
   registerDoCommand(driveCommand);
   registerFocusCommand(driveCommand);
   registerCheckpointCommand(driveCommand);
   registerTranscriptCommand(driveCommand);
   registerListCommand(driveCommand);
}

export function registerSessionCommands(program: Command): void {
   registerDriverCommands(program, 'sr');
}

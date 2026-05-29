import chalk from 'chalk';
import type { Command } from 'commander';
import { styleCommandText } from './text.js';

const SEPARATOR_WIDTH = 60;

function renderSeparator(): string {
   return chalk.dim('─'.repeat(SEPARATOR_WIDTH));
}

function getCommandPath(command: Command): string {
   const names: string[] = [];
   let current: Command | undefined = command;

   while (current) {
      const currentName = current.name();
      if (currentName) {
         names.unshift(currentName);
      }
      current = current.parent ?? undefined;
   }

   return names.join(' ');
}

function isGeneratedHelpCommand(command: Command): boolean {
   return command.name() === 'help';
}

function isHiddenCommand(command: Command): boolean {
   return Boolean((command as unknown as { _noHelp?: boolean })._noHelp);
}

function collectHelpBlocks(command: Command, blocks: string[]): void {
   const heading = chalk.bold.cyan(getCommandPath(command));
   const body = styleCommandText(command.helpInformation().trim());
   blocks.push(`${heading}\n\n${body}`);

   for (const child of command.commands) {
      if (!isGeneratedHelpCommand(child) && !isHiddenCommand(child)) {
         collectHelpBlocks(child, blocks);
      }
   }
}

export function renderFullHelp(
   command: Command,
   options: { extraBlocks?: string[] } = {},
): string {
   const blocks: string[] = [];
   collectHelpBlocks(command, blocks);
   blocks.push(...(options.extraBlocks ?? []));
   return blocks.join(`\n\n${renderSeparator()}\n\n`);
}

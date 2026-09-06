import type { Argument, Command } from 'commander';
import { dim, heading } from './format.js';
import { styleCommandText } from './text.js';

const SEPARATOR_WIDTH = 60;

/** The headings that group the top-level commands in `a1 --help`. */
export const TOP_LEVEL_GROUPS = {
   fix: 'Find and fix problems:',
   drive: 'Drive a screen reader:',
   lookUp: 'Look things up:',
   setUp: 'Set up this machine:',
   other: 'Other:',
} as const;

function renderSeparator(): string {
   return dim('─'.repeat(SEPARATOR_WIDTH));
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

/** Renders one argument the way Commander does: `<name>` required, `[name]` optional. */
function formatArgumentTerm(argument: Argument): string {
   const rawName = `${argument.name()}${argument.variadic ? '...' : ''}`;
   return argument.required ? `<${rawName}>` : `[${rawName}]`;
}

/**
 * The command term shown in a parent's listing: its name and arguments, never the generic
 * `[options]` Commander adds by default. That suffix widens the name column for every
 * command that takes any option, which is nearly all of them.
 */
export function subcommandTerm(command: Command): string {
   const args = command.registeredArguments.map(formatArgumentTerm).join(' ');
   const alias = command.aliases()[0] ? `|${command.aliases()[0]}` : '';
   return `${command.name()}${alias}${args ? ` ${args}` : ''}`;
}

function collectHelpBlocks(command: Command, blocks: string[]): void {
   const commandHeading = heading(getCommandPath(command));
   const body = styleCommandText(command.helpInformation().trim());
   blocks.push(`${commandHeading}\n\n${body}`);

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

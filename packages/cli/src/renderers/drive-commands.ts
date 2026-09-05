import chalk from 'chalk';
import type { CliOutputEnvelope } from '#contracts';
import type { DriverCommandList, SerializableDriverCommand } from '#core';
import { dim, heading, title } from '../lib/format.js';
import { groupByCategory } from './drive-command-categories.js';

const COMMAND_SET_LABELS: Readonly<Record<string, string>> = {
   portable: 'Portable',
   'voiceover-commander': 'VoiceOver — Commander',
   'voiceover-keycode': 'VoiceOver — Key Codes',
   'nvda-keycode': 'NVDA — Key Codes',
} as const;

const VOICEOVER_COMMAND_SETS = new Set(['voiceover-commander', 'voiceover-keycode']);
const NVDA_COMMAND_SETS = new Set(['nvda-keycode']);

function isPlatformRelevantCommandSet(commandSet: string): boolean {
   if (process.platform === 'darwin' && NVDA_COMMAND_SETS.has(commandSet)) {
      return false;
   }
   if (process.platform === 'win32' && VOICEOVER_COMMAND_SETS.has(commandSet)) {
      return false;
   }
   return true;
}

function formatCommandLine(
   command: SerializableDriverCommand,
   aliasWidth: number,
): string {
   const paddedAlias = command.alias.padEnd(aliasWidth);
   const parts = [chalk.cyan(paddedAlias)];

   const keySeq = command.representation ?? command.upstreamValue ?? '';
   if (keySeq) {
      parts.push(chalk.yellow(keySeq));
   }

   if (command.description) {
      parts.push(chalk.dim(command.description));
   }

   return `    ${parts.join('  ')}`;
}

function formatCommandSet(group: DriverCommandList['commandSets'][number]): string[] {
   const label =
      COMMAND_SET_LABELS[group.commandSet] ?? `${group.target} / ${group.commandSet}`;
   const aliasWidth = Math.max(...group.commands.map((cmd) => cmd.alias.length));
   const lines = ['', heading(`${label}  ${dim(`(${group.commandSet}:<name>)`)}`)];
   for (const [category, commands] of groupByCategory(group.commands)) {
      lines.push(`  ${chalk.bold(category)}`);
      for (const command of commands) {
         lines.push(formatCommandLine(command, aliasWidth));
      }
   }
   return lines;
}

/** Renders the command list grouped by command set, then by what the commands do. */
export function formatDriveCommands(
   result: DriverCommandList,
   options: { queried?: boolean } = {},
): string {
   const relevantSets = result.commandSets.filter((group) =>
      isPlatformRelevantCommandSet(group.commandSet),
   );

   if (relevantSets.length === 0) {
      return 'No driver commands matched.';
   }

   const lines = [title('Driver commands')];
   if (!options.queried) {
      lines.push(
         dim('Narrow this with --query, for example: a1 sr list --query heading'),
         dim(
            'Run one with sr do <name>, or <command-set>:<name> when two sets share a name.',
         ),
      );
   }
   for (const group of relevantSets) {
      lines.push(...formatCommandSet(group));
   }
   return lines.join('\n');
}

function isCommandList(value: unknown): value is DriverCommandList {
   return typeof value === 'object' && value !== null && 'commandSets' in value;
}

export function renderDriveCommandsText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   if (!isCommandList(envelope.result)) {
      return 'No driver commands matched.';
   }
   return formatDriveCommands(envelope.result, {
      queried: typeof envelope.result.query === 'string',
   });
}

import chalk from 'chalk';
import type { CliOutputEnvelope } from '#contracts';
import type { DriverCommandList, SerializableDriverCommand } from '#core';
import { heading, title } from '../lib/format.js';

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

   return `  ${parts.join('  ')}`;
}

export function formatDriveCommands(result: DriverCommandList): string {
   const relevantSets = result.commandSets.filter((group) =>
      isPlatformRelevantCommandSet(group.commandSet),
   );

   if (relevantSets.length === 0) {
      return 'No driver commands matched.';
   }

   const lines = [title('Driver commands')];
   for (const group of relevantSets) {
      const label =
         COMMAND_SET_LABELS[group.commandSet] ?? `${group.target} / ${group.commandSet}`;
      const aliasWidth = Math.max(...group.commands.map((cmd) => cmd.alias.length));
      lines.push('', heading(label));
      for (const command of group.commands) {
         lines.push(formatCommandLine(command, aliasWidth));
      }
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
   return formatDriveCommands(envelope.result);
}

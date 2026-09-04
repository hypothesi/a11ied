import chalk from 'chalk';
import type { CliOutputEnvelope } from '#contracts';
import type { DriverCommandList, SerializableDriverCommand } from '#core';
import {
   dim,
   fields,
   heading,
   indent,
   numberedItems,
   section,
   title,
} from '../lib/format.js';

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

interface DriveRecording {
   path: string;
   status: string;
   format: string;
}

interface DriveSessionInfo {
   sessionId: string;
   target: string;
   recording?: DriveRecording;
}

interface DriveStateWithCursor {
   logCursor: number;
   checkpoints?: Array<{ label: string }>;
}

interface DriveStatusState extends DriveStateWithCursor {
   lastSpokenPhrase: string | null;
   currentItemText: string | null;
}

interface DriveLogsState extends DriveStateWithCursor {
   spokenPhraseLog: string[];
   itemTextLog: string[];
}

interface DriveResult<TState extends DriveStateWithCursor> {
   action: string;
   session: DriveSessionInfo;
   state: TState;
   details?: {
      focus?: {
         status?: string;
         details?: string[];
      };
      command?: SerializableDriverCommand & { requestedCommand: string };
   };
}

function sessionId(value: string): string {
   return chalk.greenBright(value);
}

function target(value: string): string {
   return chalk.magentaBright(value);
}

function spoken(value: string | null | undefined): string {
   if (!value) {
      return dim('none');
   }
   return chalk.bold(value);
}

function formatCheckpoints(checkpoints?: Array<{ label: string }>): string {
   return checkpoints?.map((entry) => entry.label).join(', ') || dim('none');
}

function formatRecording(recording?: DriveRecording): string {
   if (!recording) {
      return dim('none');
   }
   return `${recording.status} ${recording.format} ${recording.path}`;
}

function sessionHeading(action: string, session: DriveSessionInfo): string {
   return `${title(`sr ${action}`)}  ${sessionId(session.sessionId)}  ${target(session.target)}`;
}

function focusDetailFields(
   result: DriveResult<DriveStatusState>,
   verbose: boolean,
): Array<[string, string]> {
   if (result.action !== 'focus' || !result.details?.focus) {
      return [];
   }
   const entries: Array<[string, string]> = [
      ['Focus status', result.details.focus.status ?? 'unknown'],
   ];
   if (verbose && result.details.focus.details?.length) {
      entries.push(['Focus notes', result.details.focus.details.join(' | ')]);
   }
   return entries;
}

function performDetailFields(
   result: DriveResult<DriveStatusState>,
   verbose: boolean,
): Array<[string, string]> {
   if (result.action !== 'perform' || !result.details?.command) {
      return [];
   }
   const command = result.details.command;
   const entries: Array<[string, string]> = [
      ['Command', `${command.alias} ${dim(`(${command.commandSet})`)}`],
      ['Requested command', command.requestedCommand],
      ['Upstream key', command.upstreamKey],
   ];
   if (verbose && command.representation) {
      entries.push(['Key sequence', command.representation]);
   }
   if (verbose && command.upstreamValue) {
      entries.push(['Upstream value', command.upstreamValue]);
   }
   return entries;
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

// Fallow-ignore-next-line unused-export
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

// Fallow-ignore-next-line unused-export
export function renderDriveSessionText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = envelope.result as {
      session: {
         sessionId: string;
         target: string;
         startedAt: string;
         brokerPid: number;
         socketPath: string;
         recording?: DriveRecording;
      };
   };

   return [
      chalk.bold.green('Drive session ready'),
      '',
      ...indent(
         fields([
            ['Session ID', sessionId(result.session.sessionId)],
            ['Target', target(result.session.target)],
            ['Started', result.session.startedAt],
            ['Broker PID', String(result.session.brokerPid)],
            ['Socket', result.session.socketPath],
            ['Recording', formatRecording(result.session.recording)],
         ]),
      ),
      '',
      dim('Session cached — run sr commands without --session'),
   ].join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderDriveStatusText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as unknown as DriveResult<DriveStatusState> & {
      noSession?: boolean;
   };

   if (result.noSession) {
      return ['No active session.', '', dim('Start one with: a11ied sr start')].join(
         '\n',
      );
   }

   const entries: Array<[string, string]> = [
      ['Last spoken phrase', spoken(result.state.lastSpokenPhrase)],
      ['Current item text', spoken(result.state.currentItemText)],
      ['Log cursor', String(result.state.logCursor)],
      ...focusDetailFields(result, options.verbose),
      ...performDetailFields(result, options.verbose),
      ['Recording', formatRecording(result.session.recording)],
   ];
   if (options.verbose) {
      entries.push(['Checkpoints', formatCheckpoints(result.state.checkpoints)]);
   }

   return [
      sessionHeading(result.action, result.session),
      ...indent(fields(entries)),
   ].join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderDriveStopText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = envelope.result as {
      action: string;
      session: { sessionId: string; target: string; recording?: DriveRecording };
      details?: { alreadyGone?: boolean };
   };
   const entries: Array<[string, string]> = [
      ['Session ID', sessionId(result.session.sessionId)],
   ];

   if (result.details?.alreadyGone) {
      entries.push(['Note', 'Session was already ended.']);
   } else {
      entries.push(
         ['Target', target(result.session.target)],
         ['Recording', formatRecording(result.session.recording)],
      );
   }

   return [title('Drive session stopped'), '', ...indent(fields(entries))].join('\n');
}

// Fallow-ignore-next-line unused-export
export function renderDriveCommandsText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   return formatDriveCommands(envelope.result as unknown as DriverCommandList);
}

// Fallow-ignore-next-line unused-export
export function renderDriveLogsText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as unknown as DriveResult<DriveLogsState>;
   const entries: Array<[string, string]> = [
      ['Log cursor', String(result.state.logCursor)],
      ['Recording', formatRecording(result.session.recording)],
   ];
   if (options.verbose) {
      entries.push(['Checkpoints', formatCheckpoints(result.state.checkpoints)]);
   }

   return [
      sessionHeading(result.action, result.session),
      ...indent(fields(entries)),
      ...section(
         `Spoken phrases ${dim(`(${result.state.spokenPhraseLog.length})`)}`,
         numberedItems(result.state.spokenPhraseLog),
      ),
      ...section(
         `Item text ${dim(`(${result.state.itemTextLog.length})`)}`,
         numberedItems(result.state.itemTextLog),
      ),
   ].join('\n');
}

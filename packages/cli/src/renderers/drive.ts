import chalk from 'chalk';
import {
   accessibilityDriverSessionSchema,
   driverActionResultSchema,
   type AccessibilityDriverSession,
   type CliOutputEnvelope,
   type DriverActionResult,
   type DriverCurrentItem,
} from '#contracts';
import { count, dim, errorLine, fields, indent, title } from '../lib/format.js';
import { navigationEntries, structureEntries, waitEntries } from './drive-details.js';

export { formatDriveCommands, renderDriveCommandsText } from './drive-commands.js';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

type Entry = [string, string];

function target(value: string): string {
   return chalk.magentaBright(value);
}

function spoken(value: string | null | undefined): string {
   if (!value) {
      return dim('none');
   }
   return chalk.bold(value);
}

function formatRecording(recording: AccessibilityDriverSession['recording']): string {
   if (!recording) {
      return dim('none');
   }
   return `${recording.status} ${recording.format} ${recording.path}`;
}

function formatUptime(startedAt: string): string {
   const totalSeconds = Math.max(
      0,
      Math.round((Date.now() - Date.parse(startedAt)) / MS_PER_SECOND),
   );
   const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)),
      minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR,
      seconds = totalSeconds % SECONDS_PER_MINUTE;
   if (hours > 0) {
      return `${String(hours)}h ${String(minutes)}m ${String(seconds)}s`;
   }
   if (minutes > 0) {
      return `${String(minutes)}m ${String(seconds)}s`;
   }
   return `${String(seconds)}s`;
}

function formatIdleTimeout(minutes: number | undefined): string {
   if (minutes === undefined) {
      return dim('default');
   }
   if (minutes === 0) {
      return 'disabled';
   }
   return `${String(minutes)} min`;
}

function sessionDetailEntries(
   session: AccessibilityDriverSession,
   verbose: boolean,
): Entry[] {
   if (!verbose) {
      return [];
   }
   return [
      ['Session ID', session.sessionId],
      ['Broker PID', String(session.brokerPid)],
      ['Socket', session.socketPath],
      ['State file', session.metadataFile],
      ['Started', session.startedAt],
   ];
}

function formatEngine(engine: AccessibilityDriverSession['engine']): string {
   if (engine === 'browser') {
      return 'browser (a headless Chromium page; the page scripts run)';
   }
   return 'jsdom (an in-memory document; the page scripts do not run)';
}

function sessionSummaryEntries(session: AccessibilityDriverSession): Entry[] {
   return [
      ['Target', target(session.target)],
      ...(session.engine === undefined
         ? []
         : [['Engine', formatEngine(session.engine)] satisfies Entry]),
      ['URL', session.url ?? dim('none')],
      ['Recording', formatRecording(session.recording)],
      ['Idle timeout', formatIdleTimeout(session.idleTimeoutMinutes)],
   ];
}

/** The heading names the command the user typed, not the broker action behind it. */
function actionHeading(
   envelope: CliOutputEnvelope,
   session: AccessibilityDriverSession,
): string {
   const typed = envelope.result?.commandLine;
   const commandLine = typeof typed === 'string' ? typed : envelope.command.subcommand;
   return `${title(`sr ${commandLine}`)}  ${target(session.target)}`;
}

function itemIdentityEntries(item: DriverCurrentItem): Entry[] {
   const entries: Entry[] = [];
   if (item.role) {
      const level = item.level === undefined ? '' : ` level ${String(item.level)}`;
      entries.push(['Role', `${item.role}${level}`]);
   }
   if (item.name) {
      entries.push(['Name', item.name]);
   }
   return entries;
}

/**
 * Role, name, value, and states of the current item. `read` and --verbose add where the
 * fields came from, because VoiceOver's are parsed from speech and NVDA's from the phrase
 * alone.
 */
function currentItemEntries(result: DriverActionResult, withSource: boolean): Entry[] {
   const item = result.state.currentItem;
   if (!item) {
      return [];
   }
   const entries = itemIdentityEntries(item);
   if (item.value !== undefined) {
      entries.push(['Value', item.value]);
   }
   if (item.states.length > 0) {
      entries.push(['States', item.states.join(', ')]);
   }
   if (withSource) {
      entries.push(['Source', dim(item.source)]);
   }
   return entries;
}

function detailEntries(result: DriverActionResult, verbose: boolean): Entry[] {
   const entries: Entry[] = [];
   const { details } = result;
   if (!details) {
      return entries;
   }
   if (
      typeof details.focus === 'object' &&
      details.focus !== null &&
      'status' in details.focus
   ) {
      entries.push(['Focus status', String(details.focus.status)]);
   }
   if (
      typeof details.command === 'object' &&
      details.command !== null &&
      'alias' in details.command
   ) {
      const command = details.command;
      entries.push([
         'Command',
         `${String(command.alias)} ${dim(`(${String('commandSet' in command ? command.commandSet : '')})`)}`,
      ]);
      if (verbose && 'representation' in command && command.representation) {
         entries.push(['Key sequence', String(command.representation)]);
      }
   }
   if (Array.isArray(details.keys)) {
      entries.push(['Keys', details.keys.map(String).join(' ')]);
   }
   return [...entries, ...structureEntries(details), ...waitEntries(details)];
}

function axEntries(result: DriverActionResult, verbose: boolean): Entry[] {
   const element = result.state.axFocusedElement;
   if (!verbose || !element) {
      return [];
   }
   return Object.entries(element)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]): Entry => [`AX ${key}`, String(value)]);
}

/** Text for `sr start`: what the session is, with ids only under --verbose. */
export function renderDriveSessionText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const parsed = accessibilityDriverSessionSchema.safeParse(envelope.result?.session);
   if (!parsed.success) {
      return 'Session ready';
   }
   const session = parsed.data;
   return [
      chalk.bold.green('Session ready'),
      '',
      ...indent(
         fields([
            ...sessionSummaryEntries(session),
            ...sessionDetailEntries(session, options.verbose),
         ]),
      ),
      '',
      dim('Every sr command now uses this session. Stop it with: a1 sr stop'),
   ].join('\n');
}

/** Text for `sr status`: session metadata, not the current item. */
export function renderDriveStatusText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   if (envelope.result?.noSession === true) {
      return ['No active session.', '', dim('Start one with: a1 sr start')].join('\n');
   }
   const parsed = driverActionResultSchema.safeParse(envelope.result);
   if (!parsed.success) {
      return 'No active session.';
   }
   const { session, state } = parsed.data;
   const phrases = state.transcript.filter(
      (entry) => entry.checkpoint === undefined,
   ).length;
   const entries: Entry[] = [
      ...sessionSummaryEntries(session),
      ['Uptime', formatUptime(session.startedAt)],
      [
         'Transcript',
         `${count(phrases, 'phrase')}, ${count(state.checkpoints.length, 'checkpoint')}`,
      ],
      ...sessionDetailEntries(session, options.verbose),
   ];
   return [title('Session active'), '', ...indent(fields(entries))].join('\n');
}

/** A failed check (exit code 4) keeps the result block and adds its message below. */
export function verdictLines(envelope: CliOutputEnvelope): string[] {
   if (envelope.ok) {
      return [];
   }
   return ['', ...envelope.errors.map((error) => errorLine(error.code, error.message))];
}

/** Text for read and every navigation or input verb: the phrase and the current item. */
export function renderDriveReadText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const parsed = driverActionResultSchema.safeParse(envelope.result);
   if (!parsed.success) {
      return 'No result.';
   }
   const result = parsed.data;
   const entries: Entry[] = [
      ['Phrase', spoken(result.state.lastSpokenPhrase)],
      ['Item', spoken(result.state.currentItemText)],
      ...currentItemEntries(result, result.action === 'read' || options.verbose),
      ...navigationEntries(result),
      ...detailEntries(result, options.verbose),
      ...axEntries(result, options.verbose),
   ];
   if (options.verbose) {
      entries.push([
         'Checkpoints',
         result.state.checkpoints.map((entry) => entry.label).join(', ') || dim('none'),
      ]);
   }
   return [
      actionHeading(envelope, result.session),
      ...indent(fields(entries)),
      ...verdictLines(envelope),
   ].join('\n');
}

function transcriptFileLines(files: unknown): string[] {
   if (!Array.isArray(files) || files.length === 0) {
      return [];
   }
   return files
      .filter(
         (file): file is { path: string } =>
            typeof file === 'object' && file !== null && 'path' in file,
      )
      .map((file) => `  ${dim('Transcript written to')} ${file.path}`);
}

/** Text for `sr stop`. */
export function renderDriveStopText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const parsed = driverActionResultSchema.safeParse(envelope.result);
   if (!parsed.success) {
      return 'Session stopped';
   }
   const { session } = parsed.data;
   return [
      title('Session stopped'),
      '',
      ...indent(
         fields([
            ['Target', target(session.target)],
            ['Recording', formatRecording(session.recording)],
         ]),
      ),
      ...transcriptFileLines(envelope.result?.transcriptFiles),
   ].join('\n');
}

import type { Command } from 'commander';
import {
   addAllowVirtualOption,
   addEphemeralOption,
   addJsonOption,
   addSessionOption,
   addTargetOption,
   addVerboseOption,
} from '../lib/options.js';

interface DriveActionOptions {
   json?: boolean;
   verbose?: boolean;
   session?: string;
   target?: string;
   ephemeral?: boolean;
   allowVirtual?: boolean;
}

interface FocusActionOptions extends DriveActionOptions {
   app?: string;
   bundleId?: string;
   process?: string;
   pid?: string;
   windowTitle?: string;
   match?: string;
}

interface SimpleActionConfig {
   name: string;
   description: string;
   renderer: 'status' | 'logs';
}

const DRIVE_KEY_HELP = `
Supported key tokens:
  Chord syntax: join tokens with "+", for example Tab, Shift+Tab, Control+F,
  VO+ArrowRight, or NVDA+N.

  Common:
    Modifiers: Shift, Control, Alt
    Letters: a-z, A-Z, KeyA-KeyZ
    Digits: 0-9, Digit0-Digit9
    Arrows: ArrowUp, ArrowDown, ArrowLeft, ArrowRight
    Arrow aliases: Up, Down, Left, Right, UpArrow, DownArrow, LeftArrow, RightArrow
    Navigation/editing: Backspace, Tab, Enter, Escape, Space, Spacebar, Delete,
      ForwardDelete, Home, End, PageUp, PageDown, Insert, Help, Clear, CapsLock
    Functions: F1-F20
    Punctuation: Backquote, Backtick, Minus, Dash, Equal, Equals, Backslash,
      LeftSquareBracket, RightSquareBracket, SingleQuote, Comma, Period, FullStop,
      Tilde, Plus

  VoiceOver (macOS):
    Modifier aliases: VO (Control+Option), Command, CommandLeft, CommandRight,
      Meta, Option, OptionLeft, OptionRight
    macOS-only keys: Fn, SectionSign, LineFeed, Return, VolumeUp, VolumeDown,
      Mute, Add, Subtract, Multiply, Divide, Decimal
    Examples: VO+ArrowRight, VO+ArrowLeft, VO+Shift+ArrowDown, VO+Space,
      Command+F5

  NVDA (Windows):
    Modifier aliases: NVDA or Nvda (Insert), Windows
    Windows-only keys: Application, Pause, Break, PrintScreen, ScrollLock,
      Numlock, NumPad0, NumPad1, NumPad2, NumPad3, NumPad4, NumPad5, NumPad6,
      NumPad7, NumPad8, NumPad9, NumPadEnter, NumPadDelete, NumPadDivide,
      NumPadMinus, NumPadMultiply, NumPadPlus
    Examples: NVDA+N, NVDA+ArrowDown, NVDA+NumPad5, Control+Alt+N
`;

function addDriveActionOptions(command: Command): Command {
   return addVerboseOption(
      addJsonOption(
         addEphemeralOption(
            addAllowVirtualOption(addTargetOption(addSessionOption(command))),
         ),
      ),
   );
}

function registerSimpleAction(driveCommand: Command, config: SimpleActionConfig): void {
   addDriveActionOptions(
      driveCommand.command(config.name).description(config.description),
   ).action(async (options: DriveActionOptions) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);
      let renderText = renderers.renderDriveStatusText;
      if (config.renderer === 'logs') {
         renderText = renderers.renderDriveLogsText;
      }

      await executeDriveActionCommand({
         subcommand: config.name,
         action: config.name as 'next',
         options,
         payload: undefined,
         renderText,
      });
   });
}

function registerKeyCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('key')
         .description('Send one or more target-specific key chords.')
         .requiredOption('--keys <keys>', 'Send keys such as VO+ArrowRight or Tab.')
         .addHelpText('after', DRIVE_KEY_HELP),
   ).action(async (options: DriveActionOptions & { keys: string }) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'key',
         action: 'key',
         options,
         payload: { keys: options.keys },
         renderText: renderers.renderDriveStatusText,
      });
   });
}

function registerTypeCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('type')
         .description('Type text through the active driver target.')
         .requiredOption('--text <text>', 'Text to type into the target.'),
   ).action(async (options: DriveActionOptions & { text: string }) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'type',
         action: 'type',
         options,
         payload: { text: options.text },
         renderText: renderers.renderDriveStatusText,
      });
   });
}

function parsePidValue(pid: string | undefined): number | undefined {
   if (!pid) {
      return undefined;
   }
   const parsed = Number(pid);
   if (Number.isNaN(parsed)) {
      return undefined;
   }
   return parsed;
}

function buildFocusEntries(options: FocusActionOptions): Array<[string, unknown]> {
   return [
      ['appName', options.app],
      ['bundleId', options.bundleId],
      ['processName', options.process],
      ['windowTitle', options.windowTitle],
      ['match', options.match],
      ['pid', parsePidValue(options.pid)],
   ];
}

function buildFocusPayload(options: FocusActionOptions): Record<string, unknown> {
   const payload: Record<string, unknown> = {};
   for (const [key, value] of buildFocusEntries(options)) {
      if (value !== undefined && value !== '') {
         payload[key] = value;
      }
   }
   if (!payload.match && payload.windowTitle) {
      payload.match = 'contains';
   }
   return payload;
}

function registerFocusCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('focus')
         .description('Focus a window so the screen reader follows the right app.')
         .option('--app <name>', 'macOS app name to bring to the front.')
         .option('--bundle-id <id>', 'macOS bundle identifier to focus.')
         .option('--process <name>', 'Windows process name to focus.')
         .option('--pid <pid>', 'Windows process id to focus.')
         .option('--window-title <title>', 'Window title to focus.')
         .option('--match <mode>', 'Window title match: contains or exact.'),
   ).action(async (options: FocusActionOptions) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'focus',
         action: 'focus',
         options,
         payload: buildFocusPayload(options),
         renderText: renderers.renderDriveStatusText,
      });
   });
}

function registerClearLogsCommand(driveCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         driveCommand
            .command('clear-logs')
            .description('Clear captured speech and action logs.')
            .requiredOption('--session <id>', 'Reuse an existing driver session.'),
      ),
   ).action(async (options: { json?: boolean; verbose?: boolean; session: string }) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'clear-logs',
         action: 'clear-logs',
         options,
         payload: undefined,
         renderText: renderers.renderDriveLogsText,
      });
   });
}

function registerCheckpointCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('checkpoint')
         .description('Record a named checkpoint in the current session.')
         .requiredOption('--label <label>', 'Attach a label to this checkpoint.'),
   ).action(async (options: DriveActionOptions & { label: string }) => {
      const [{ executeDriveActionCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeDriveActionCommand({
         subcommand: 'checkpoint',
         action: 'checkpoint',
         options,
         payload: { label: options.label },
         renderText: renderers.renderDriveStatusText,
      });
   });
}

export function registerSimpleActions(driveCommand: Command): void {
   registerSimpleAction(driveCommand, {
      name: 'next',
      description: 'Move to the next item.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'previous',
      description: 'Move to the previous item.',
      renderer: 'status',
   });
}

export function registerMiddleActions(driveCommand: Command): void {
   registerKeyCommand(driveCommand);
   registerTypeCommand(driveCommand);
   registerFocusCommand(driveCommand);
   registerSimpleAction(driveCommand, {
      name: 'interact',
      description: 'Enter interaction mode.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'stop-interacting',
      description: 'Leave interaction mode.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'click-current-item',
      description: 'Activate the current item.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'read',
      description: 'Read the current driver state.',
      renderer: 'status',
   });
   registerSimpleAction(driveCommand, {
      name: 'logs',
      description: 'Read captured speech and action logs.',
      renderer: 'logs',
   });
}

export function registerTrailingActions(driveCommand: Command): void {
   registerClearLogsCommand(driveCommand);
   registerCheckpointCommand(driveCommand);
}

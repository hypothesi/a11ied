import type { Command } from 'commander';
import { DEFAULT_TARGET_TIMEOUT_MS } from '#core';
import {
   getPlatformScreenReaders,
   getPlatformTargets,
} from '../commands/drive-key-help.js';

export function addJsonOption(command: Command): Command {
   return command.option('--json', 'Print JSON instead of human-readable text.');
}

export function addVerboseOption(command: Command): Command {
   return command.option('--verbose', 'Print more detail in text output.');
}

/** The two options every lookup command takes, whichever corpus it reads. */
export function addLookupOptions(command: Command): Command {
   return addVerboseOption(addJsonOption(command));
}

export function addWcagVersionOption(command: Command): Command {
   return command.option(
      '--wcag <version>',
      'Use a specific WCAG version. Defaults to 2.2.',
      '2.2',
   );
}

export function addScreenReaderOption(command: Command): Command {
   return command.option(
      '--sr <reader>',
      `Screen reader to drive: ${getPlatformTargets()}. Defaults to an available ${getPlatformScreenReaders()} target, then falls back to virtual as a last resort.`,
   );
}

export function addRecordingOption(command: Command): Command {
   return command.option(
      '--recording <path>',
      'Write one screen recording to the given .mov or .mp4 path when the target supports it.',
   );
}

export function addTimeoutOption(command: Command): Command {
   return command.option(
      '--timeout <ms>',
      'Bound the screen reader command in milliseconds instead of using the built-in limits.',
   );
}

export function addPhraseOption(command: Command): Command {
   return command.option(
      '--phrase',
      'Print only the last spoken phrase, one line, for shell loops.',
   );
}

export function addHtmlOption(command: Command): Command {
   return command.option(
      '--html <markup>',
      'Load inline HTML instead of the positional target.',
   );
}

export function addClickOption(command: Command): Command {
   return command.option(
      '--click <selector>',
      'Click the one element this selector matches after the page loads, before anything ' +
         'else runs. Reaches a widget the page renders only after a click, such as a dialog.',
   );
}

export function addWaitForOption(command: Command): Command {
   return command.option(
      '--wait-for <css>',
      'Wait for an element matching this CSS selector before scanning or reading.',
   );
}

export function addTargetTimeoutOption(command: Command): Command {
   return command.option(
      '--timeout <ms>',
      `Timeout for loading the target, in milliseconds. Defaults to ${DEFAULT_TARGET_TIMEOUT_MS}.`,
   );
}

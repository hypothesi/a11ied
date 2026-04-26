import type { Command } from 'commander';

const SESSION_OPTION_DESCRIPTION =
   'Reuse an existing driver session. Defaults to the current drive session or $A11IED_DRIVE_SESSION when available.';

export function addJsonOption(command: Command): Command {
   return command.option('--json', 'Print JSON instead of human-readable text.');
}

export function addVerboseOption(command: Command): Command {
   return command.option('--verbose', 'Print more detail in text output.');
}

export function addWcagVersionOption(command: Command): Command {
   return command.option(
      '--version <version>',
      'Use a specific WCAG version. Defaults to 2.2.',
      '2.2',
   );
}

export function addSessionOption(command: Command): Command {
   return command.option('--session <id>', SESSION_OPTION_DESCRIPTION);
}

export function addEphemeralOption(command: Command): Command {
   return command.option(
      '--ephemeral',
      'Run one action in a temporary session and tear it down immediately.',
   );
}

export function addTargetOption(command: Command): Command {
   return command.option(
      '--target <platform>',
      'Choose one target: voiceover, nvda, or virtual. Defaults to VoiceOver on macOS, NVDA on Windows, or virtual elsewhere. Use --allow-virtual to permit simulation.',
   );
}

export function addAllowVirtualOption(command: Command): Command {
   return command.option(
      '--allow-virtual',
      'Allow the virtual (simulated) screen reader when a real target is available.',
   );
}

export function addRecordingOption(command: Command): Command {
   return command.option(
      '--recording <path>',
      'Write one screen recording to the given .mov or .mp4 path when the target supports it.',
   );
}

import type { Command } from 'commander';

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
   return command.option('--session <id>', 'Reuse an existing driver session.');
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
      'Choose one target: voiceover, nvda, or virtual.',
   );
}

export function addRecordingOption(command: Command): Command {
   return command.option(
      '--recording <path>',
      'Write one screen recording to the given .mov or .mp4 path when the target supports it.',
   );
}

export function addStorybookTargetOptions(command: Command): Command {
   return command
      .option(
         '--storybook-url <url>',
         'Resolve a target from a local Storybook base URL.',
      )
      .option('--story-id <storyId>', 'Resolve one Storybook story by id.');
}

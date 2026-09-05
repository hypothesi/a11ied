import { resolve } from 'node:path';

import type { Command } from 'commander';
import { addDriveActionOptions, type DriveActionOptions } from './drive-options.js';

export function registerScreenshotCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('screenshot <path>')
         .description(
            'Save a picture of what the VoiceOver cursor is on to the path. NVDA and the virtual reader have no cursor screenshot and exit 2.',
         ),
   ).action(async (path: string, options: DriveActionOptions) => {
      const [{ executeDriveActionCommand }, { renderDriveReadText }] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);
      await executeDriveActionCommand({
         subcommand: 'screenshot',
         commandLine: `screenshot ${path}`,
         request: {
            action: 'screenshot',
            payload: { path: resolve(process.cwd(), path) },
         },
         options,
         renderText: renderDriveReadText,
      });
   });
}

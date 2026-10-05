import type { Command } from 'commander';
import { nativeInputPolicySchema, type CliMessage } from '#contracts';
import { CliUsageError } from '#core';
import type { CommandExecution } from '../lib/helpers.js';
import {
   addJsonOption,
   addRecordingOption,
   addScreenReaderOption,
   addTimeoutOption,
   addVerboseOption,
} from '../lib/options.js';
import { DRIVE_GROUPS, parseCountOption, parseTimeoutMs } from './drive-options.js';
import { assertHttpUrl } from './drive-session.js';

export interface StartActionOptions {
   json?: boolean;
   verbose?: boolean;
   sr?: string;
   recording?: string;
   idleTimeout?: string;
   nativeInput?: string;
   timeout?: string;
   app?: string;
   browser?: string;
}

function buildReplacedWarning(
   replaced: { sessionId: string; target: string } | undefined,
): CliMessage[] {
   if (!replaced) {
      return [];
   }
   return [
      {
         code: 'session-replaced',
         message: `Stopped the previous ${replaced.target} session (${replaced.sessionId}) before starting this one.`,
      },
   ];
}

function assertOneTarget(url: string | undefined, options: StartActionOptions): void {
   if (url !== undefined && options.app !== undefined) {
      throw new CliUsageError(
         'validation-error',
         'Pass a URL or --app <name>, not both. A session reads one window.',
         { url, app: options.app },
      );
   }
   assertHttpUrl(url);
}

/** Starts the shared session and attaches a virtual document when needed. */
export async function executeStartAction(
   url: string | undefined,
   options: StartActionOptions,
): Promise<CommandExecution> {
   const parsedPolicy = nativeInputPolicySchema.safeParse(
      options.nativeInput ?? 'guarded',
   );
   if (!parsedPolicy.success) {
      throw new CliUsageError(
         'validation-error',
         'Native input must be guarded, require-binding, or development.',
         { field: 'native-input' },
      );
   }
   const nativeInput = parsedPolicy.data;
   const [{ resolvePageTarget, resolveScreenReaderTarget, getCLIDriverMode }, core] =
      await Promise.all([import('../lib/execute.js'), import('#core')]);
   const { target, warnings } = await resolveScreenReaderTarget(options);
   assertOneTarget(url, options);
   const resolved =
      url === undefined ? undefined : await resolvePageTarget({ target: url });
   const resolvedUrl = resolved?.reportTarget.resolvedUrl;
   const app = options.app === undefined ? undefined : { appName: options.app };
   const timeoutMs = parseTimeoutMs(options.timeout);
   const started = await core.startDriverSession({
      target,
      mode: getCLIDriverMode(target),
      recordingPath: options.recording,
      url: resolvedUrl,
      app,
      browser: options.browser,
      nativeInput,
      idleTimeoutMinutes: parseCountOption(options.idleTimeout, 'idle-timeout'),
      timeoutMs,
   });
   return {
      target: resolved?.reportTarget ?? { kind: 'driver-target', value: target },
      result: { session: started.session },
      warnings: [...warnings, ...buildReplacedWarning(started.replacedSession)],
   };
}

export function registerStartCommand(driveCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addTimeoutOption(
            addRecordingOption(
               addScreenReaderOption(
                  driveCommand
                     .command('start [url]')
                     .helpGroup(DRIVE_GROUPS.session)
                     .summary('Start a screen reader session.')
                     .description(
                        'Start the screen reader session, replacing any active one. press, type, and do start one when none is active.',
                     ),
               ),
            )
               .option(
                  '--app <name>',
                  'Read a native app that is already open instead of a page; the session focuses it by name.',
               )
               .option(
                  '--browser <name>',
                  'Open the URL in this browser: chrome, edge, brave, chromium, or any app name such as Safari. Defaults to the system automation browser.',
               )
               .option(
                  '--native-input <policy>',
                  'guarded (default) checks the observed foreground target. require-binding refuses unavailable binding. development bypasses target checks.',
               )
               .option(
                  '--idle-timeout <minutes>',
                  'Stop the session after this many idle minutes; 0 disables. Defaults to 30.',
               ),
         ),
      ),
   ).action(async (url: string | undefined, options: StartActionOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);

      await executeCommand(
         {
            family: 'sr',
            subcommand: 'start',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => executeStartAction(url, options),
         renderers.renderDriveSessionText,
      );
   });
}

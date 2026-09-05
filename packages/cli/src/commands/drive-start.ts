import type { Command } from 'commander';
import type { CliMessage, DriverFocusTarget, Platform } from '#contracts';
import { CliUsageError } from '#core';
import type { CommandExecution } from '../lib/helpers.js';
import {
   addAllowVirtualOption,
   addJsonOption,
   addRecordingOption,
   addScreenReaderOption,
   addTimeoutOption,
   addVerboseOption,
} from '../lib/options.js';
import { parseCountOption, parseTimeoutMs } from './drive-options.js';
import { assertHttpUrl, waitForFocusWithWarning } from './drive-session.js';

export interface StartActionOptions {
   json?: boolean;
   verbose?: boolean;
   sr?: string;
   allowVirtual?: boolean;
   recording?: string;
   idleTimeout?: string;
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

/**
 * Opens what the session will read: the URL in a browser, or nothing for --app, which
 * names a window that is already open. Real targets then wait for it to come to front.
 */
async function openTarget(args: {
   url: string | undefined;
   options: StartActionOptions;
   target: Platform;
   warnings: CliMessage[];
}): Promise<DriverFocusTarget | undefined> {
   const core = await import('#core');
   if (args.target === 'virtual') {
      return args.options.app === undefined ? undefined : { appName: args.options.app };
   }
   if (args.options.app !== undefined) {
      return { appName: args.options.app };
   }
   if (args.url === undefined) {
      return undefined;
   }
   const opened = await core.openUrlInBrowser(args.url, args.options.browser);
   if (opened.focusTarget) {
      await waitForFocusWithWarning(opened.focusTarget, args.warnings);
   }
   return opened.focusTarget;
}

/** Starts the session and opens the page; `sr start` and `sr walk` both run this. */
export async function executeStartAction(
   url: string | undefined,
   options: StartActionOptions,
): Promise<CommandExecution> {
   const [{ resolveOptionalCliTarget, resolveScreenReaderTarget }, core] =
      await Promise.all([import('../lib/execute.js'), import('#core')]);
   const { target, warnings } = await resolveScreenReaderTarget(options);
   assertOneTarget(url, options);
   const resolved = await resolveOptionalCliTarget({ url });
   const app = await openTarget({
      url: resolved?.resolvedUrl,
      options,
      target,
      warnings,
   });
   const started = await core.startDriverSession({
      target,
      mode: core.resolveDriverMode(),
      recordingPath: options.recording,
      url: resolved?.resolvedUrl,
      app,
      idleTimeoutMinutes: parseCountOption(options.idleTimeout, 'idle-timeout'),
      timeoutMs: parseTimeoutMs(options.timeout),
   });
   if (started.session.targetType === 'real' && app) {
      // Starting the reader can take focus; bring the window back and confirm it.
      await core.runDriverSessionAction({ action: 'focus' });
      await waitForFocusWithWarning(app, warnings);
   } else if (resolved) {
      await core.attachDocumentToDriverSession({
         html: resolved.html,
         url: resolved.resolvedUrl,
      });
   }
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
               addAllowVirtualOption(
                  addScreenReaderOption(
                     driveCommand
                        .command('start [url]')
                        .description(
                           'Start the screen reader session, replacing any active one. press, type, and do start one when none is active.',
                        ),
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

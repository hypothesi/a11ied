import type { Command } from 'commander';
import type { CliMessage } from '#contracts';
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
import { assertHttpUrl, delay, REAL_BROWSER_LAUNCH_DELAY_MS } from './drive-session.js';

export interface StartActionOptions {
   json?: boolean;
   verbose?: boolean;
   sr?: string;
   allowVirtual?: boolean;
   recording?: string;
   idleTimeout?: string;
   timeout?: string;
}

const REAL_BROWSER_FOCUS_DELAY_MS = 750;

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

/** Starts the session and opens the page; `sr start` and `sr walk` both run this. */
export async function executeStartAction(
   url: string | undefined,
   options: StartActionOptions,
): Promise<CommandExecution> {
   const [{ resolveOptionalCliTarget, resolveScreenReaderTarget }, core] =
      await Promise.all([import('../lib/execute.js'), import('#core')]);
   const { target, warnings } = await resolveScreenReaderTarget(options);
   assertHttpUrl(url);
   const resolved = await resolveOptionalCliTarget({ url });
   let app = undefined;
   if (resolved && target !== 'virtual') {
      const opened = await core.openUrlInSystemAutomationBrowser(resolved.resolvedUrl);
      app = opened.focusTarget;
      await delay(REAL_BROWSER_LAUNCH_DELAY_MS);
   }
   const started = await core.startDriverSession({
      target,
      mode: core.resolveDriverMode(),
      recordingPath: options.recording,
      url: resolved?.resolvedUrl,
      app,
      idleTimeoutMinutes: parseCountOption(options.idleTimeout, 'idle-timeout'),
      timeoutMs: parseTimeoutMs(options.timeout),
   });
   if (resolved && started.session.targetType === 'real' && app) {
      await delay(REAL_BROWSER_FOCUS_DELAY_MS);
      await core.runDriverSessionAction({ action: 'focus' });
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
            ).option(
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

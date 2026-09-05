import type { Command } from 'commander';
import type { AccessibilityDriverSession, DriverActionResult } from '#contracts';
import { CliUsageError } from '#core';
import type { CommandExecution } from '../lib/helpers.js';
import { addDriveActionOptions, parseTimeoutMs, type DriveActionOptions } from './drive-options.js';

export const REAL_BROWSER_LAUNCH_DELAY_MS = 1000;

export function delay(ms: number): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(() => resolvePromise(), ms);
   });
}

/** Page targets are limited to http(s) URLs until the shared target resolver lands. */
export function assertHttpUrl(url: string | undefined): void {
   if (url !== undefined && !/^https?:\/\//iu.test(url)) {
      throw new CliUsageError(
         'validation-error',
         `Only http(s) URLs are supported as page targets for now; got "${url}".`,
         { field: 'url', value: url },
      );
   }
}

interface StopActionOptions extends DriveActionOptions {
   out?: string;
   format?: string;
}

async function requireActiveSession(): Promise<AccessibilityDriverSession> {
   const [{ createNoSessionError }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('#core'),
   ]);
   const session = await core.getActiveDriverSession();
   if (!session) {
      throw createNoSessionError();
   }
   return session;
}

async function refocusRealTarget(
   session: AccessibilityDriverSession,
   url: string,
   timeoutMs: number | undefined,
): Promise<DriverActionResult> {
   const core = await import('#core');
   const opened = await core.openUrlInSystemAutomationBrowser(url);
   await delay(REAL_BROWSER_LAUNCH_DELAY_MS);
   const recorded = await core.attachDocumentToDriverSession({ html: '', url }, { timeoutMs });
   const app = opened.focusTarget ?? session.app;
   if (!app) {
      return recorded;
   }
   return core.runDriverSessionAction({ action: 'focus', payload: app }, { timeoutMs });
}

async function executeOpenAction(
   url: string,
   options: DriveActionOptions,
): Promise<CommandExecution> {
   const session = await requireActiveSession();
   assertHttpUrl(url);
   const [{ resolveOptionalCliTarget }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('#core'),
   ]);
   const resolved = await resolveOptionalCliTarget({ url });
   if (!resolved) {
      throw new CliUsageError('missing-target', 'Provide a URL to open.');
   }
   const timeoutMs = parseTimeoutMs(options.timeout);
   const result =
      session.target === 'virtual'
         ? await core.attachDocumentToDriverSession(
              { html: resolved.html, url: resolved.resolvedUrl },
              { timeoutMs },
           )
         : await refocusRealTarget(session, resolved.resolvedUrl, timeoutMs);
   return { target: resolved.reportTarget, result };
}

async function writeStopTranscripts(
   result: DriverActionResult,
   options: StopActionOptions,
): Promise<Array<{ path: string; format: string }>> {
   const core = await import('#core');
   const transcript = core.buildDriverTranscript(result.session, result.state.transcript);
   const files = [];
   if (result.session.recording) {
      files.push(
         await core.writeDriverTranscript({
            transcript,
            outPath: core.resolveRecordingTranscriptPath(result.session.recording.path),
         }),
      );
   }
   if (options.out) {
      files.push(
         await core.writeDriverTranscript({
            transcript,
            outPath: options.out,
            format: options.format,
         }),
      );
   }
   return files;
}

async function executeStopAction(options: StopActionOptions): Promise<CommandExecution> {
   const session = await requireActiveSession();
   if (options.out) {
      const core = await import('#core');
      core.resolveTranscriptFormat(options.out, options.format);
   }
   const core = await import('#core');
   const result = await core.stopDriverSession({ timeoutMs: parseTimeoutMs(options.timeout) });
   const transcriptFiles = await writeStopTranscripts(result, options);
   return {
      target: { kind: 'driver-session', value: session.target },
      result: { ...result, transcriptFiles },
   };
}

async function executeStatusAction(options: DriveActionOptions): Promise<CommandExecution> {
   const core = await import('#core');
   const session = await core.getActiveDriverSession();
   if (!session) {
      return { result: { action: 'status', noSession: true } };
   }
   const result = await core.getDriverSessionStatus({
      timeoutMs: parseTimeoutMs(options.timeout),
   });
   return { target: { kind: 'driver-session', value: session.target }, result };
}

export function registerOpenCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('open <url>')
         .description(
            'Navigate the active session to a page. Virtual loads the document; VoiceOver and NVDA open the system browser and refocus it.',
         ),
   ).action(async (url: string, options: DriveActionOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);
      await executeCommand(
         { family: 'sr', subcommand: 'open', wcagVersion: undefined, json: options.json, verbose: options.verbose },
         () => executeOpenAction(url, options),
         renderers.renderDriveReadText,
      );
   });
}

export function registerStopCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('stop')
         .description(
            'Stop the active session. A transcript is written next to any recording; --out writes one as .json or .md.',
         )
         .option('--out <path>', 'Also write the transcript to this path.')
         .option('--format <format>', 'Transcript format, json or md. Defaults to the --out extension.'),
   ).action(async (options: StopActionOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);
      await executeCommand(
         { family: 'sr', subcommand: 'stop', wcagVersion: undefined, json: options.json, verbose: options.verbose },
         () => executeStopAction(options),
         renderers.renderDriveStopText,
      );
   });
}

export function registerStatusCommand(driveCommand: Command): void {
   addDriveActionOptions(
      driveCommand
         .command('status')
         .description('Show the active session: target, URL, uptime, recording, and transcript counts.'),
   ).action(async (options: DriveActionOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/drive.js'),
      ]);
      await executeCommand(
         { family: 'sr', subcommand: 'status', wcagVersion: undefined, json: options.json, verbose: options.verbose },
         () => executeStatusAction(options),
         renderers.renderDriveStatusText,
      );
   });
}

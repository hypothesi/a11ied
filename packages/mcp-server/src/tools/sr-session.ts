import {
   platformSchema,
   type AccessibilityDriverSession,
   type CliMessage,
   type DriverFocusTarget,
} from '@a11ied/contracts';
import {
   attachDocumentToDriverSession,
   getActiveDriverSession,
   getDriverSessionStatus,
   openUrlInBrowser,
   resolveAvailableDefaultTarget,
   runDriverSessionAction,
   startDriverSession,
   stopDriverSession,
   waitForWindowFocus,
   writeDriverTranscript,
   buildDriverTranscript,
   resolveRecordingTranscriptPath,
   resolveTranscriptFormat,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   ensureVirtualTargetAllowed,
   resolveExecutionTarget,
   type ToolResponse,
} from '../lib/shared.js';

const srSessionStartInputSchema = z.object({
   action: z.literal('start'),
   target: platformSchema.optional(),
   allowVirtual: z.boolean().optional(),
   url: z.string().url().optional(),
   app: z.string().min(1).optional(),
   browser: z.string().min(1).optional(),
   recording: z.string().min(1).optional(),
   idleTimeoutMinutes: z.number().int().nonnegative().optional(),
   timeoutMs: z.number().int().positive().optional(),
});
const srSessionOpenInputSchema = z.object({
   action: z.literal('open'),
   url: z.string().url(),
   timeoutMs: z.number().int().positive().optional(),
});
const srSessionStopInputSchema = z.object({
   action: z.literal('stop'),
   out: z.string().min(1).optional(),
   format: z.enum(['json', 'md']).optional(),
   timeoutMs: z.number().int().positive().optional(),
});
const srSessionStatusInputSchema = z.object({
   action: z.literal('status'),
   timeoutMs: z.number().int().positive().optional(),
});

const srSessionInputSchema = z.discriminatedUnion('action', [
   srSessionStartInputSchema,
   srSessionOpenInputSchema,
   srSessionStopInputSchema,
   srSessionStatusInputSchema,
]);
type SrSessionInput = z.infer<typeof srSessionInputSchema>;
type SrSessionResponse = ToolResponse<Record<string, unknown>>;

async function waitForFocus(
   target: DriverFocusTarget,
   warnings: CliMessage[],
): Promise<void> {
   const focus = await waitForWindowFocus(target);
   if (focus.focused) {
      return;
   }
   const front = focus.frontmost?.appName ?? 'an unknown window';
   warnings.push({
      code: 'window-focus-unconfirmed',
      message: `${target.appName ?? target.windowTitle ?? 'The window'} did not come to the front within ${String(focus.waitedMs)} ms; ${front} is in front.`,
   });
}

interface OpenStartTargetArgs {
   input: z.infer<typeof srSessionStartInputSchema>;
   target: string;
   resolvedUrl: string | undefined;
   warnings: CliMessage[];
}

async function openStartTarget(
   args: OpenStartTargetArgs,
): Promise<DriverFocusTarget | undefined> {
   const { input, resolvedUrl, target, warnings } = args;
   if (target === 'virtual') {
      return input.app === undefined ? undefined : { appName: input.app };
   }
   if (input.app !== undefined) {
      return { appName: input.app };
   }
   if (resolvedUrl === undefined) {
      return undefined;
   }
   const opened = await openUrlInBrowser(resolvedUrl, input.browser);
   if (opened.focusTarget) {
      await waitForFocus(opened.focusTarget, warnings);
   }
   return opened.focusTarget;
}

async function handleStart(
   input: z.infer<typeof srSessionStartInputSchema>,
): Promise<SrSessionResponse> {
   const defaultTarget = input.target ? undefined : await resolveAvailableDefaultTarget(),
      target = input.target ?? defaultTarget?.target ?? 'virtual';
   if (input.target) {
      ensureVirtualTargetAllowed(target, input.allowVirtual);
   }
   const resolved = input.url
         ? await resolveExecutionTarget({ url: input.url })
         : undefined,
      warnings: CliMessage[] = [];
   const app = await openStartTarget({
      input,
      target,
      resolvedUrl: resolved?.resolvedUrl,
      warnings,
   });
   const started = await startDriverSession({
      target,
      recordingPath: input.recording,
      url: resolved?.resolvedUrl,
      app,
      idleTimeoutMinutes: input.idleTimeoutMinutes,
      timeoutMs: input.timeoutMs,
   });
   if (started.session.targetType === 'real' && app) {
      await runDriverSessionAction({ action: 'focus' });
      await waitForFocus(app, warnings);
   } else if (resolved) {
      await attachDocumentToDriverSession({
         html: resolved.html,
         url: resolved.resolvedUrl,
      });
   }
   return createToolResponse<Record<string, unknown>>({
      session: started.session,
      warnings,
   });
}

async function requireActiveSession(): Promise<AccessibilityDriverSession> {
   const session = await getActiveDriverSession();
   if (!session) {
      throw new Error(
         'No active screen reader session. Start one with sr_session action "start".',
      );
   }
   return session;
}

async function refocusRealTarget(
   url: string,
   timeoutMs: number | undefined,
   warnings: CliMessage[],
): Promise<Record<string, unknown>> {
   const opened = await openUrlInBrowser(url);
   if (opened.focusTarget) {
      await waitForFocus(opened.focusTarget, warnings);
   }
   const recorded = await attachDocumentToDriverSession({ html: '', url }, { timeoutMs });
   if (!opened.focusTarget) {
      return recorded;
   }
   return runDriverSessionAction(
      { action: 'focus', payload: opened.focusTarget },
      { timeoutMs },
   );
}

async function handleOpen(
   input: z.infer<typeof srSessionOpenInputSchema>,
): Promise<SrSessionResponse> {
   const resolved = await resolveExecutionTarget({ url: input.url }),
      session = await requireActiveSession(),
      warnings: CliMessage[] = [];
   const result =
      session.target === 'virtual'
         ? await attachDocumentToDriverSession(
              { html: resolved.html, url: resolved.resolvedUrl },
              { timeoutMs: input.timeoutMs },
           )
         : await refocusRealTarget(resolved.resolvedUrl, input.timeoutMs, warnings);
   return createToolResponse<Record<string, unknown>>({ ...result, warnings });
}

async function writeStopTranscript(
   result: Awaited<ReturnType<typeof stopDriverSession>>,
   input: z.infer<typeof srSessionStopInputSchema>,
): Promise<Array<{ path: string; format: string }>> {
   const files: Array<{ path: string; format: string }> = [],
      transcript = buildDriverTranscript(result.session, result.state.transcript);
   if (result.session.recording) {
      files.push(
         await writeDriverTranscript({
            transcript,
            outPath: resolveRecordingTranscriptPath(result.session.recording.path),
         }),
      );
   }
   if (input.out) {
      files.push(
         await writeDriverTranscript({
            transcript,
            outPath: input.out,
            format: input.format,
         }),
      );
   }
   return files;
}

async function handleStop(
   input: z.infer<typeof srSessionStopInputSchema>,
): Promise<SrSessionResponse> {
   await requireActiveSession();
   if (input.out) {
      resolveTranscriptFormat(input.out, input.format);
   }
   const result = await stopDriverSession({ timeoutMs: input.timeoutMs }),
      transcriptFiles = await writeStopTranscript(result, input);
   return createToolResponse<Record<string, unknown>>({ ...result, transcriptFiles });
}

async function handleStatus(
   input: z.infer<typeof srSessionStatusInputSchema>,
): Promise<SrSessionResponse> {
   const session = await getActiveDriverSession();
   if (!session) {
      return createToolResponse<Record<string, unknown>>({ noSession: true });
   }
   return createToolResponse<Record<string, unknown>>(
      await getDriverSessionStatus({ timeoutMs: input.timeoutMs }),
   );
}

async function dispatchSrSession(input: SrSessionInput): Promise<SrSessionResponse> {
   if (input.action === 'start') {
      return handleStart(input);
   }
   if (input.action === 'open') {
      return handleOpen(input);
   }
   if (input.action === 'stop') {
      return handleStop(input);
   }
   return handleStatus(input);
}

const SR_SESSION_DESCRIPTION =
   'Manage the one active sr session, matching a1 sr start/open/stop/status. ' +
   'No action takes a session id: one session is active at a time. ' +
   'action "start": start a session, stopping any session already active. target is voiceover, nvda, or virtual. ' +
   'Omit it to use the platform default (VoiceOver on macOS, NVDA on Windows), falling back to virtual. ' +
   'Set allowVirtual=true to explicitly request the virtual (simulated) target when a real one is available. ' +
   'url opens a page. Real targets open it in a system browser and refocus it. Virtual loads the HTML directly. ' +
   'app names a native app that is already open to read instead of a page. ' +
   'action "open": navigate the active session to url. ' +
   'action "stop": stop the session. out writes its transcript to a .json or .md path. ' +
   'action "status": read session metadata, or { noSession: true } when none is active. ' +
   'The session carries a targetType field, "real" or "simulated".';

export function registerSrSessionTool(server: McpServer): void {
   server.registerTool(
      'sr_session',
      {
         title: 'Screen reader session',
         description: SR_SESSION_DESCRIPTION,
         inputSchema: srSessionInputSchema,
         annotations: activeAnnotations,
      },
      dispatchSrSession,
   );
}

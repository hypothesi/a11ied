import {
   platformSchema,
   nativeInputPolicySchema,
   type AccessibilityDriverSession,
   type CliMessage,
} from '@a11ied/contracts';
import {
   attachDocumentToDriverSession,
   getActiveDriverSession,
   getDriverSessionStatus,
   CliUsageError,
   resolveAvailableDefaultTarget,
   startDriverSession,
   stopDriverSession,
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
   resolvePageTarget,
   describePageReportTarget,
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
   nativeInput: nativeInputPolicySchema.optional(),
   timeoutMs: z.number().int().positive().optional(),
});
const srSessionOpenInputSchema = z.object({
   action: z.literal('open'),
   url: z.string().url(),
   timeoutMs: z.number().int().positive().optional(),
});
const srSessionStopInputSchema = z.object({
   action: z.literal('stop'),
   sessionId: z.string().min(1).optional(),
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

async function handleStart(
   input: z.infer<typeof srSessionStartInputSchema>,
): Promise<SrSessionResponse> {
   if (input.url !== undefined && input.app !== undefined) {
      throw new CliUsageError(
         'validation-error',
         'Pass a URL or an app, not both. A session reads one window.',
      );
   }
   const defaultTarget = input.target ? undefined : await resolveAvailableDefaultTarget(),
      target = input.target ?? defaultTarget?.target ?? 'virtual';
   if (input.target) {
      ensureVirtualTargetAllowed(target, input.allowVirtual);
   }
   const resolved = input.url
         ? await resolvePageTarget({ target: input.url }, 'sr_session')
         : undefined,
      warnings: CliMessage[] = [];
   const app = input.app === undefined ? undefined : { appName: input.app };
   const started = await startDriverSession({
      target,
      recordingPath: input.recording,
      url:
         resolved === undefined
            ? undefined
            : describePageReportTarget(resolved).resolvedUrl,
      app,
      browser: input.browser,
      nativeInput: input.nativeInput,
      idleTimeoutMinutes: input.idleTimeoutMinutes,
      timeoutMs: input.timeoutMs,
   });
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

async function handleOpen(
   input: z.infer<typeof srSessionOpenInputSchema>,
): Promise<SrSessionResponse> {
   const resolved = await resolvePageTarget({ target: input.url }, 'sr_session'),
      session = await requireActiveSession(),
      warnings: CliMessage[] = [];
   const result = await attachDocumentToDriverSession(
      {
         html: session.engine === 'jsdom' ? await resolved.readHtml() : '',
         url: describePageReportTarget(resolved).resolvedUrl,
      },
      { timeoutMs: input.timeoutMs },
   );
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
   if (input.sessionId === undefined) {
      await requireActiveSession();
   }
   if (input.out) {
      resolveTranscriptFormat(input.out, input.format);
   }
   const result = await stopDriverSession({
         timeoutMs: input.timeoutMs,
         sessionId: input.sessionId,
      }),
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
   'One session is active at a time. stop accepts sessionId to retry a recovery owner. ' +
   'action "start": start a session, stopping any session already active. target is voiceover, nvda, or virtual. ' +
   'Omit it to use the platform default (VoiceOver on macOS, NVDA on Windows), falling back to virtual. ' +
   'Set allowVirtual=true to explicitly request the virtual (simulated) target when a real one is available. ' +
   'url opens a page. Real targets open it in a system browser and refocus it. Virtual loads the HTML directly. ' +
   'app names a native app that is already open to read instead of a page. ' +
   'nativeInput defaults to guarded: check observed foreground targets and inspect state after each action. ' +
   'require-binding refuses input without authoritative native binding; development bypasses target checks. ' +
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

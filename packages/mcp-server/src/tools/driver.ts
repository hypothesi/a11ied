import {
   accessibilityDriverSessionSchema,
   driverActionRequestSchema,
   driverActionResultSchema,
   driverFocusTargetFieldsSchema,
   driverFocusTargetRefinement,
   platformSchema,
   type DriverActionRequest,
   type Platform,
} from '@a11ied/contracts';
import {
   attachDocumentToDriverSession,
   getDriverSessionStatus,
   resolveAvailableDefaultTarget,
   resolveTargetType,
   runDriverSessionAction,
   startDriverSession,
   stopDriverSession,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   activeAnnotations,
   createToolResponse,
   ensureVirtualTargetAllowed,
   resolveExecutionTarget,
   targetInputSchema,
   type ToolResponse,
   type TargetInput,
} from '../lib/shared.js';

/* ------------------------------------------------------------------ */
/*  Driver session — unified start / status / stop                    */
/* ------------------------------------------------------------------ */

const driverSessionInputSchema = z.object({
   action: z.enum(['start', 'status', 'stop']),
   target: platformSchema.optional(),
   allowVirtual: z.boolean().optional(),
   url: z.string().url().optional(),
   /** Accepted and ignored: one session is active at a time. */
   sessionId: z.string().min(1).optional(),
});

/* ------------------------------------------------------------------ */
/*  Driver action — per-action dispatch against the active session     */
/* ------------------------------------------------------------------ */

const portableActionSchema = z.object({
   action: z.enum([
      'next',
      'previous',
      'interact',
      'stop-interacting',
      'activate',
      'top',
      'bottom',
      'escape',
      'read',
      'transcript',
   ]),
   sessionId: z.string().min(1).optional(),
});

const driverActionInputSchema = z.discriminatedUnion('action', [
   portableActionSchema,
   z.object({
      action: z.literal('press'),
      /** One chord per entry; they are pressed in order. */
      keys: z.array(z.string().min(1)).min(1),
      sessionId: z.string().min(1).optional(),
   }),
   z.object({
      action: z.literal('type'),
      text: z.string(),
      sessionId: z.string().min(1).optional(),
   }),
   z.object({
      action: z.literal('checkpoint'),
      label: z.string().min(1),
      sessionId: z.string().min(1).optional(),
   }),
   z.object({
      action: z.literal('perform'),
      command: z.string().min(1),
      commandSet: z.string().optional(),
      sessionId: z.string().min(1).optional(),
   }),
   driverFocusTargetFieldsSchema
      .extend({
         action: z.literal('focus'),
         sessionId: z.string().min(1).optional(),
      })
      .superRefine(driverFocusTargetRefinement),
]);

type DriverActionInput = z.infer<typeof driverActionInputSchema>;
type DriverSessionInput = z.infer<typeof driverSessionInputSchema>;
type DriverSessionToolResponse = ToolResponse<Record<string, unknown>>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function attachResolvedDocument(
   input: TargetInput,
   target: Platform,
): Promise<void> {
   // Real screen readers use the host environment browser; the agent must
   // Navigate to the page. Document attachment only applies to the virtual target.
   if (resolveTargetType(target) === 'real' || input.url === undefined) {
      return;
   }

   const resolved = await resolveExecutionTarget(targetInputSchema.parse(input));
   await attachDocumentToDriverSession({
      html: resolved.html,
      url: resolved.resolvedUrl,
   });
}

async function handleDriverSessionStart(
   input: DriverSessionInput,
): Promise<DriverSessionToolResponse> {
   const defaultTarget = input.target ? undefined : await resolveAvailableDefaultTarget();
   const resolvedTarget = input.target ?? defaultTarget?.target ?? 'virtual';
   if (input.target) {
      ensureVirtualTargetAllowed(resolvedTarget, input.allowVirtual);
   }
   const started = await startDriverSession({ target: resolvedTarget, url: input.url });
   await attachResolvedDocument({ url: input.url }, resolvedTarget);
   return createToolResponse<Record<string, unknown>>(
      accessibilityDriverSessionSchema.parse(started.session),
   );
}

async function handleDriverSessionStatus(): Promise<DriverSessionToolResponse> {
   return createToolResponse<Record<string, unknown>>(
      driverActionResultSchema.parse(await getDriverSessionStatus()),
   );
}

async function handleDriverSessionStop(): Promise<DriverSessionToolResponse> {
   return createToolResponse<Record<string, unknown>>(
      driverActionResultSchema.parse(await stopDriverSession()),
   );
}

const driverSessionHandlers: Record<
   DriverSessionInput['action'],
   (input: DriverSessionInput) => Promise<DriverSessionToolResponse>
> = {
   start: handleDriverSessionStart,
   status: handleDriverSessionStatus,
   stop: handleDriverSessionStop,
};

/** Maps the tool's flat input onto the typed action request the runtime takes. */
function toActionRequest(input: DriverActionInput): DriverActionRequest {
   if (input.action === 'press') {
      return { action: 'press', payload: { keys: input.keys } };
   }
   if (input.action === 'type') {
      return { action: 'type', payload: { text: input.text } };
   }
   if (input.action === 'checkpoint') {
      return { action: 'checkpoint', payload: { label: input.label } };
   }
   if (input.action === 'perform') {
      const payload = input.commandSet
         ? { command: input.command, commandSet: input.commandSet }
         : { command: input.command };
      return { action: 'perform', payload };
   }
   if (input.action === 'focus') {
      const { action: _action, sessionId: _sessionId, ...focusTarget } = input;
      return { action: 'focus', payload: focusTarget };
   }
   return driverActionRequestSchema.parse({ action: input.action });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                      */
/* ------------------------------------------------------------------ */

export function registerDriverTools(server: McpServer): void {
   server.registerTool(
      'driver_session',
      {
         title: 'Driver session',
         description:
            'Manage the one active accessibility-driver session. ' +
            'action "start": start a session, stopping any session already running. ' +
            'action "status": read the session metadata and current reader state. ' +
            'action "stop": tear the session down. ' +
            'One session is active at a time, so no action takes a session id. ' +
            'On macOS the default target is VoiceOver (real); on Windows it is NVDA (real). ' +
            'If neither is available, the target falls back to "virtual" (SIMULATION). ' +
            'Only request the virtual target when you explicitly want simulation; set allowVirtual=true to proceed. ' +
            'The response includes a targetType field ("real" or "simulated"). ' +
            'For real screen readers: open a browser and navigate to the page BEFORE starting. ' +
            'For virtual: pass url and a11ied injects HTML automatically.',
         inputSchema: driverSessionInputSchema,
         annotations: activeAnnotations,
      },
      async (input) => driverSessionHandlers[input.action](input),
   );

   server.registerTool(
      'driver_action',
      {
         title: 'Driver action',
         description:
            'Run one action against the active accessibility-driver session. ' +
            'Start a session with driver_session first; no session id is needed. ' +
            'For real screen reader sessions (VoiceOver/NVDA), actions drive the actual assistive technology and return real speech output. ' +
            'For virtual sessions, actions are simulated in memory. ' +
            'Check the session targetType to know which mode is active. ' +
            'The portable verbs work on every target: "next", "previous", "interact", ' +
            '"stop-interacting", "activate", "top", "bottom", and "escape". ' +
            'Use "press" with keys (one chord per entry, pressed in order), "type" with text, ' +
            '"checkpoint" with a label, and "read" or "transcript" to read state back. ' +
            'Use action "focus" with appName, bundleId, processName, pid, or windowTitle to bring a window to the front. ' +
            'Use action "perform" with a command name (and optional commandSet) to run a named screen-reader command. ' +
            'VoiceOver rotor and structural navigation commands: ' +
            '"find next heading" | "find previous heading" | ' +
            '"find next landmark" | "find previous landmark" | ' +
            '"find next field" (form controls) | "find next button" | "find next link" | ' +
            '"rotor" (open rotor) | "rotate left" | "rotate right" | ' +
            '"next rotor item" | "previous rotor item". ' +
            'For VoiceOver sessions the response state includes axFocusedElement with the ' +
            'AX role, subrole, title, description, value, and enabled state of the system-focused element. ' +
            'The response state also carries the timestamped transcript of everything spoken so far.',
         inputSchema: driverActionInputSchema,
         outputSchema: driverActionResultSchema,
         annotations: activeAnnotations,
      },
      async (input) =>
         createToolResponse(
            driverActionResultSchema.parse(
               await runDriverSessionAction(
                  toActionRequest(driverActionInputSchema.parse(input)),
               ),
            ),
         ),
   );
}

import {
   driverActionResultSchema,
   type AccessibilityDriverSession,
   type DriverActionResult,
   type DriverCheckpoint,
   type Platform,
} from '@a11ied/contracts';
import type { createDriverAdapter } from '@a11ied/guidepup';

import { startSessionRecording, type ActiveSessionRecording } from './recording.js';
import { buildEphemeralSession } from './session-utils.js';

// Fallow-ignore-next-line unused-type
export interface EphemeralActionOptions {
   target: Platform;
   action: DriverActionResult['action'];
   payload: Record<string, unknown> | undefined;
   cwd: string;
   recordingPath?: string;
}

interface EphemeralResultOptions {
   adapter: ReturnType<typeof createDriverAdapter>;
   checkpoints: DriverCheckpoint[];
   target: Platform;
   action: DriverActionResult['action'];
   payload: Record<string, unknown> | undefined;
   cwd: string;
   recording: ActiveSessionRecording | undefined;
}

function createEphemeralSessionRecord(args: {
   target: Platform;
   cwd: string;
   logCursor: number;
   recording?: AccessibilityDriverSession['recording'];
}): AccessibilityDriverSession {
   if (args.recording) {
      return buildEphemeralSession({
         target: args.target,
         cwd: args.cwd,
         logCursor: args.logCursor,
         recording: args.recording,
      });
   }
   return buildEphemeralSession({
      target: args.target,
      cwd: args.cwd,
      logCursor: args.logCursor,
   });
}

export function createEphemeralRecording(
   options: EphemeralActionOptions,
): ActiveSessionRecording | undefined {
   if (options.recordingPath) {
      return startSessionRecording(options.target, options.recordingPath, options.cwd);
   }
   return undefined;
}

export async function buildEphemeralResult(
   options: EphemeralResultOptions,
): Promise<DriverActionResult> {
   let state = await options.adapter.readState(options.checkpoints);
   if (options.action === 'clear-logs') {
      state = await options.adapter.clearLogs(options.checkpoints);
   }
   let completedRecording = undefined;
   if (options.recording) {
      completedRecording = await options.recording.stop();
   }
   return driverActionResultSchema.parse({
      session: createEphemeralSessionRecord({
         target: options.target,
         cwd: options.cwd,
         logCursor: state.logCursor,
         recording: completedRecording,
      }),
      action: options.action,
      state,
      details: options.payload,
   });
}

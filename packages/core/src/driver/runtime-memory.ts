import {
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
   type Platform,
} from '@a11ied/contracts';
import type { createDriverAdapter } from '@a11ied/guidepup';

import { startSessionRecording, type ActiveSessionRecording } from './recording.js';

export interface InMemorySessionStartOptions {
   target: Platform;
   sessionId: string;
   metadataFile: string;
   recordingPath?: string;
   cwd?: string;
}

export function createInMemoryRecording(
   options: InMemorySessionStartOptions,
   cwd: string,
): ActiveSessionRecording | undefined {
   if (options.recordingPath) {
      return startSessionRecording(options.target, options.recordingPath, cwd);
   }
   return undefined;
}

export function createInMemorySessionRecord(args: {
   options: InMemorySessionStartOptions;
   adapter: ReturnType<typeof createDriverAdapter>;
   logCursor: number;
   recording: ActiveSessionRecording | undefined;
}): AccessibilityDriverSession {
   let targetType: AccessibilityDriverSession['targetType'] = 'real';
   if (args.options.target === 'virtual') {
      targetType = 'simulated';
   }
   return accessibilityDriverSessionSchema.parse({
      sessionId: args.options.sessionId,
      target: args.options.target,
      targetType,
      startedAt: new Date().toISOString(),
      capabilities: args.adapter.capabilities,
      logCursor: args.logCursor,
      brokerPid: process.pid,
      socketPath: `in-memory://${args.options.sessionId}`,
      metadataFile: args.options.metadataFile,
      recording: args.recording?.metadata,
   });
}

import type {
   AccessibilityDriverSession,
   DriverActionName,
   DriverActionResult,
   DriverCheckpoint,
   SessionRecording,
} from '@a11ied/contracts';
import type { DriverAdapter } from '@a11ied/guidepup';

import type { TranscriptRecorder } from './transcript.js';

/** One newline-delimited JSON request to the broker. */
export interface BrokerRequest {
   command: 'ping' | 'status' | 'stop' | 'action' | 'attach-document';
   action?: DriverActionName | undefined;
   payload?: Record<string, unknown> | undefined;
   /** Bounds the screen reader command; the client allows the reply a little longer. */
   timeoutMs?: number | undefined;
}

export interface BrokerResponse {
   ok: boolean;
   result?: DriverActionResult;
   error?: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
      /** Carried across the socket so the client rebuilds the same error class. */
      exitCode?: number;
   };
}

export interface BrokerHandlerContext {
   adapter: DriverAdapter;
   session: AccessibilityDriverSession;
   checkpoints: DriverCheckpoint[];
   transcript: TranscriptRecorder;
   writeMetadata: (session: AccessibilityDriverSession) => Promise<void>;
   finishRecording?: () => Promise<SessionRecording | undefined>;
}

export interface HandleResult {
   response: BrokerResponse;
   shouldStop: boolean;
}

export interface ActionExecutionResult {
   details?: Record<string, unknown>;
}

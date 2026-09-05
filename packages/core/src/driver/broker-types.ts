import type {
   AccessibilityDriverSession,
   DriverActionName,
   DriverActionResult,
   DriverCheckpoint,
   SessionRecording,
} from '@a11ied/contracts';
import type { DriverAdapter } from '@a11ied/guidepup/browser';

import type { TranscriptRecorder } from './transcript-recorder.js';

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

/**
 * What running one action needs: the adapter, the checkpoints, the transcript, and the
 * app a bare focus action returns to. The broker adds the session record and persistence;
 * the test runners build this much and nothing more.
 */
export interface ActionContext {
   adapter: DriverAdapter;
   session: Pick<AccessibilityDriverSession, 'app'>;
   checkpoints: DriverCheckpoint[];
   transcript: TranscriptRecorder;
}

export interface BrokerHandlerContext extends ActionContext {
   session: AccessibilityDriverSession;
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

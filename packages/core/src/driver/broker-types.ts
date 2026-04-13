import type {
   AccessibilityDriverSession,
   DriverActionResult,
   DriverCheckpoint,
   SessionRecording,
} from '@a11ied/contracts';
import type { createDriverAdapter } from '@a11ied/guidepup';

export interface BrokerRequest {
   command: 'ping' | 'status' | 'stop' | 'action' | 'attach-document';
   action?: DriverActionResult['action'];
   payload?: Record<string, unknown>;
}

export interface BrokerResponse {
   ok: boolean;
   result?: DriverActionResult;
   error?: {
      code: string;
      message: string;
   };
}

export interface ActionContext {
   adapter: ReturnType<typeof createDriverAdapter>;
   checkpoints: DriverCheckpoint[];
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
   handled: boolean;
   details?: Record<string, unknown>;
}

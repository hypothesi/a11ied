import type { AccessibilityDriverSession } from '@a11ied/contracts';

import { connectToBroker, resolveBrokerSocketTimeoutMs } from './broker-client.js';
import type { BrokerRequest, BrokerResponse } from './broker-types.js';
import { requestInProcess } from './runtime-internal.js';
import { normalizeBrokerTransportError } from './runtime-support.js';
import { isInMemorySession, removeSessionArtifacts } from './session-utils.js';

/**
 * Sends one request to wherever the session lives: the in-process map when it was started
 * with mode `in-process`, otherwise the broker socket.
 */
export async function sendSessionRequest(
   session: AccessibilityDriverSession,
   request: BrokerRequest,
): Promise<BrokerResponse> {
   if (isInMemorySession(session)) {
      return requestInProcess(session.sessionId, request);
   }
   try {
      return await connectToBroker(
         session.socketPath,
         request,
         resolveBrokerSocketTimeoutMs(request, session.target),
      );
   } catch (error) {
      if (request.command === 'stop') {
         // The broker is gone; drop the stale files so the next start is clean.
         await removeSessionArtifacts(session);
      }
      throw normalizeBrokerTransportError({ error, action: request.action });
   }
}

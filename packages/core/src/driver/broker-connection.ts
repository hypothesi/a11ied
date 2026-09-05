import net from 'node:net';

import type { AccessibilityDriverSession } from '@a11ied/contracts';

import { resolveBrokerSocketTimeoutMs } from './broker-client.js';
import type { BrokerRequest, BrokerResponse } from './broker-types.js';
import { requestInProcess } from './runtime-internal.js';
import { normalizeBrokerTransportError } from './runtime-support.js';
import { isInMemorySession } from './session-utils.js';

/** One open line to the session's broker: many requests, one socket, replies in order. */
export interface BrokerConnection {
   send(request: BrokerRequest): Promise<BrokerResponse>;
   close(): void;
}

interface PendingReply {
   resolve: (response: BrokerResponse) => void;
   reject: (error: Error) => void;
   timer: NodeJS.Timeout;
}

function isBrokerResponse(value: unknown): value is BrokerResponse {
   return typeof value === 'object' && value !== null && 'ok' in value;
}

function parseLine(line: string): BrokerResponse {
   const parsed: unknown = JSON.parse(line);
   if (!isBrokerResponse(parsed)) {
      throw new Error('Broker replied with something other than a response object.');
   }
   return parsed;
}

/**
 * Opens one socket to the broker and keeps it for every request. The broker answers a
 * connection's requests in the order they arrived, so replies pair with requests by
 * position.
 */
function openSocketConnection(session: AccessibilityDriverSession): BrokerConnection {
   const pending: PendingReply[] = [];
   const socket = net.createConnection(session.socketPath);
   let buffered = '';
   const failAll = (error: Error): void => {
      for (const reply of pending.splice(0)) {
         clearTimeout(reply.timer);
         reply.reject(error);
      }
   };
   socket.on('data', (chunk: Buffer | string) => {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines.filter((candidate) => candidate.trim())) {
         const reply = pending.shift();
         if (!reply) {
            continue;
         }
         clearTimeout(reply.timer);
         try {
            reply.resolve(parseLine(line));
         } catch (error) {
            reply.reject(error instanceof Error ? error : new Error(String(error)));
         }
      }
   });
   socket.on('error', (error) => failAll(error));
   socket.on('close', () => failAll(new Error('Broker closed the connection.')));
   return {
      send: (request) =>
         new Promise<BrokerResponse>((resolvePromise, rejectPromise) => {
            const timer = setTimeout(
               () => {
                  const position = pending.findIndex((reply) => reply.timer === timer);
                  if (position !== -1) {
                     pending.splice(position, 1);
                  }
                  rejectPromise(new Error('Broker connection timed out.'));
               },
               resolveBrokerSocketTimeoutMs(request, session.target),
            );
            pending.push({ resolve: resolvePromise, reject: rejectPromise, timer });
            socket.write(`${JSON.stringify(request)}\n`);
         }).catch((error: unknown) => {
            throw normalizeBrokerTransportError({ error, action: request.action });
         }),
      close: () => {
         socket.end();
         socket.destroy();
      },
   };
}

/**
 * Opens a connection to wherever the session lives: the in-process map for a session
 * started with mode `in-process`, otherwise one socket to the broker.
 */
function closeInProcess(): void {
   // An in-process session has no socket to close.
}

export function openBrokerConnection(
   session: AccessibilityDriverSession,
): BrokerConnection {
   if (isInMemorySession(session)) {
      return {
         send: (request) => requestInProcess(session.sessionId, request),
         close: closeInProcess,
      };
   }
   return openSocketConnection(session);
}

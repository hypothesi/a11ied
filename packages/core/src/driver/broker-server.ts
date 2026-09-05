import net from 'node:net';

import { handleBrokerRequest } from './broker-handlers.js';
import type {
   BrokerHandlerContext,
   BrokerRequest,
   BrokerResponse,
   HandleResult,
} from './broker-types.js';

function formatErrorMessage(error: unknown): string {
   if (error instanceof Error) {
      return error.message;
   }
   return String(error);
}

function isBrokerRequest(value: unknown): value is BrokerRequest {
   return typeof value === 'object' && value !== null && 'command' in value;
}

function parseRequestLine(line: string): BrokerRequest {
   const parsed: unknown = JSON.parse(line);
   if (!isBrokerRequest(parsed)) {
      throw new Error('Broker requests must be JSON objects with a "command" field.');
   }
   return parsed;
}

function writeResponse(connection: net.Socket, response: BrokerResponse): void {
   connection.write(`${JSON.stringify(response)}\n`);
}

interface ServerArgs {
   context: BrokerHandlerContext;
   onStop: () => void;
   onActivity: () => void;
}

async function processLine(
   args: ServerArgs,
   connection: net.Socket,
   line: string,
): Promise<void> {
   args.onActivity();
   const result = await handleBrokerRequest(args.context, parseRequestLine(line)).catch(
      (error: unknown): HandleResult => ({
         response: {
            ok: false,
            error: { code: 'broker-error', message: formatErrorMessage(error) },
         },
         shouldStop: false,
      }),
   );
   writeResponse(connection, result.response);
   if (result.shouldStop) {
      connection.end();
      args.onStop();
   }
}

/**
 * Frames requests as newline-delimited JSON: one request per line, several lines per
 * chunk allowed, and a line split across chunks is buffered until its newline arrives.
 */
function attachConnection(args: ServerArgs, connection: net.Socket): void {
   let buffered = '';
   let queue: Promise<void> = Promise.resolve();
   connection.on('data', (chunk: Buffer | string) => {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
         if (line.trim()) {
            queue = queue.then(() => processLine(args, connection, line));
         }
      }
   });
   connection.on('error', () => {
      // The client went away; nothing to answer.
   });
}

export function createBrokerServer(args: ServerArgs): net.Server {
   return net.createServer((connection) => {
      attachConnection(args, connection);
   });
}

/** Stops the session once no request has arrived for `idleTimeoutMs`; 0 disables it. */
export function createIdleTimer(
   idleTimeoutMs: number,
   onIdle: () => void,
): { touch: () => void; clear: () => void } {
   let timer: NodeJS.Timeout | undefined = undefined;
   const clear = (): void => {
      if (timer) {
         clearTimeout(timer);
         timer = undefined;
      }
   };
   const touch = (): void => {
      clear();
      if (idleTimeoutMs > 0) {
         timer = setTimeout(onIdle, idleTimeoutMs);
      }
   };
   touch();
   return { touch, clear };
}

export function shutdownServer(server: net.Server, stop: () => Promise<void>): void {
   server.close(() => {
      stop()
         .then(() => {
            process.exitCode = 0;
         })
         .catch(() => {
            process.exitCode = 1;
         });
   });
}

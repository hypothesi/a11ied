import net from 'node:net';

import { handleBrokerRequest } from './broker-handlers.js';
import type {
   BrokerHandlerContext,
   BrokerRequest,
   BrokerResponse,
   HandleResult,
} from './broker-types.js';

const CONNECTION_CLOSE_TIMEOUT_MS = 1000;
const serverConnections = new WeakMap<net.Server, Set<net.Socket>>();

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
   if (!connection.destroyed && !connection.writableEnded) {
      connection.write(`${JSON.stringify(response)}\n`);
   }
}

interface ServerArgs {
   context: BrokerHandlerContext | (() => BrokerHandlerContext | undefined);
   onStop: () => void;
   onActivity: () => void;
}

async function processLine(
   args: ServerArgs,
   connection: net.Socket,
   line: string,
): Promise<void> {
   args.onActivity();
   const context = typeof args.context === 'function' ? args.context() : args.context;
   if (!context) {
      writeResponse(connection, {
         ok: false,
         error: {
            code: 'session-starting',
            message: 'The broker is preparing its session. Retry shortly.',
         },
      });
      return;
   }
   const result = await handleBrokerRequest(context, parseRequestLine(line)).catch(
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
   const connections = new Set<net.Socket>();
   const server = net.createServer((connection) => {
      connections.add(connection);
      connection.once('close', () => connections.delete(connection));
      attachConnection(args, connection);
   });
   serverConnections.set(server, connections);
   return server;
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

/** Keep the retry endpoint until cleanup succeeds, then close idle connections. */
export async function shutdownServer(
   server: net.Server,
   stop: () => Promise<void>,
): Promise<void> {
   await stop();
   server.close();
   for (const connection of serverConnections.get(server) ?? []) {
      connection.destroySoon();
      const timer = setTimeout(() => connection.destroy(), CONNECTION_CLOSE_TIMEOUT_MS);
      timer.unref();
      connection.once('close', () => clearTimeout(timer));
   }
}

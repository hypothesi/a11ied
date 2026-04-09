import net from 'node:net';

import {
   handleBrokerRequest,
   type BrokerHandlerContext,
   type BrokerRequest,
   type BrokerResponse,
} from './broker-handlers.js';

function formatErrorMessage(error: unknown): string {
   if (error instanceof Error) {
      return error.message;
   }
   return String(error);
}

interface ProcessRequestArgs {
   connection: net.Socket;
   rawData: Buffer[];
   context: BrokerHandlerContext;
   onStop: () => void;
}

async function processRequest(args: ProcessRequestArgs): Promise<void> {
   const raw = Buffer.concat(args.rawData).toString('utf8').trim();
   const request = JSON.parse(raw) as BrokerRequest;
   const result = await handleBrokerRequest(args.context, request);
   args.connection.end(JSON.stringify(result.response));
   if (result.shouldStop) {
      args.onStop();
   }
}

function toBuffer(chunk: Buffer | string): Buffer {
   if (Buffer.isBuffer(chunk)) {
      return chunk;
   }
   return Buffer.from(chunk);
}

interface ConnectionDataArgs {
   connection: net.Socket;
   chunks: Buffer[];
   context: BrokerHandlerContext;
   onStop: () => void;
}

function handleConnectionData(args: ConnectionDataArgs, chunk: Buffer | string): void {
   const buffer = toBuffer(chunk);
   args.chunks.push(buffer);
   if (!buffer.includes('\n')) {
      return;
   }
   processRequest({
      connection: args.connection,
      rawData: args.chunks,
      context: args.context,
      onStop: args.onStop,
   }).catch((error: unknown) => {
      const response: BrokerResponse = {
         ok: false,
         error: {
            code: 'broker-error',
            message: formatErrorMessage(error),
         },
      };
      args.connection.end(JSON.stringify(response));
   });
}

export function createBrokerServer(args: {
   context: BrokerHandlerContext;
   onStop: () => void;
}): net.Server {
   return net.createServer((connection) => {
      const dataArgs: ConnectionDataArgs = {
         connection,
         chunks: [],
         context: args.context,
         onStop: args.onStop,
      };
      connection.on('data', (chunk) => {
         handleConnectionData(dataArgs, chunk);
      });
   });
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

export function setupSignalHandlers(server: net.Server, stop: () => Promise<void>): void {
   process.on('SIGINT', () => {
      shutdownServer(server, stop);
   });
   process.on('SIGTERM', () => {
      shutdownServer(server, stop);
   });
}

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import net from 'node:net';

import {
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
   type DriverCheckpoint,
   type Platform,
} from '@a11lied/contracts';
import { createDriverAdapter } from '@a11lied/guidepup';

import {
   handleBrokerRequest,
   type BrokerHandlerContext,
   type BrokerRequest,
   type BrokerResponse,
} from './driver-broker-handlers.js';

const JSON_INDENT = 2;
const FIRST_USER_ARG = 2;

interface BrokerArgs {
   sessionId: string;
   target: Platform;
   metadataFile: string;
   socketPath: string;
}

interface BrokerState {
   stopped: boolean;
}

function collectArgValues(argv: string[]): Map<string, string> {
   const values = new Map<string, string>();
   for (let index = 0; index < argv.length; index += 1) {
      const part = argv[index];
      if (part?.startsWith('--')) {
         const value = argv[index + 1];
         if (value) {
            values.set(part, value);
         }
      }
   }
   return values;
}

function parseArgs(argv: string[]): BrokerArgs {
   const values = collectArgValues(argv);
   const sessionId = values.get('--session-id');
   const target = values.get('--target');
   const metadataFile = values.get('--metadata-file');
   const socketPath = values.get('--socket-path');

   if (!sessionId || !target || !metadataFile || !socketPath) {
      throw new Error(
         'driver broker requires --session-id, --target, --metadata-file, and --socket-path',
      );
   }

   if (target !== 'virtual' && target !== 'voiceover' && target !== 'nvda') {
      throw new Error(`Unsupported target "${target}".`);
   }

   return { sessionId, target, metadataFile, socketPath };
}

async function writeSessionMetadata(session: AccessibilityDriverSession): Promise<void> {
   await mkdir(dirname(session.metadataFile), { recursive: true });
   const json = JSON.stringify(session, undefined, JSON_INDENT);
   await writeFile(session.metadataFile, `${json}\n`, 'utf8');
}

async function ensureSocketPath(socketPath: string): Promise<void> {
   if (process.platform !== 'win32') {
      await mkdir(dirname(socketPath), { recursive: true });
      await rm(socketPath, { force: true });
   }
}

interface StopBrokerOptions {
   adapter: ReturnType<typeof createDriverAdapter>;
   args: BrokerArgs;
   state: BrokerState;
}

async function stopBroker(options: StopBrokerOptions): Promise<void> {
   if (options.state.stopped) {
      return;
   }
   options.state.stopped = true;
   await options.adapter.stop().catch(() => {
      // No-op
   });
   await rm(options.args.metadataFile, { force: true });
   if (process.platform !== 'win32') {
      await rm(options.args.socketPath, { force: true });
   }
}

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

interface BrokerServerOptions {
   context: BrokerHandlerContext;
   onStop: () => void;
}

function createBrokerServer(options: BrokerServerOptions): net.Server {
   return net.createServer((connection) => {
      const chunks: Buffer[] = [];
      const dataArgs: ConnectionDataArgs = {
         connection,
         chunks,
         context: options.context,
         onStop: options.onStop,
      };
      connection.on('data', (chunk) => {
         handleConnectionData(dataArgs, chunk);
      });
   });
}

function shutdownServer(server: net.Server, stopOptions: StopBrokerOptions): void {
   server.close(() => {
      stopBroker(stopOptions)
         .then(() => {
            process.exitCode = 0;
         })
         .catch(() => {
            process.exitCode = 1;
         });
   });
}

function setupSignalHandlers(server: net.Server, stopOptions: StopBrokerOptions): void {
   process.on('SIGINT', () => {
      shutdownServer(server, stopOptions);
   });
   process.on('SIGTERM', () => {
      shutdownServer(server, stopOptions);
   });
}

interface InitializedBroker {
   args: BrokerArgs;
   adapter: ReturnType<typeof createDriverAdapter>;
   session: AccessibilityDriverSession;
   checkpoints: DriverCheckpoint[];
}

async function createBrokerSession(
   adapter: ReturnType<typeof createDriverAdapter>,
   args: BrokerArgs,
   checkpoints: DriverCheckpoint[],
): Promise<InitializedBroker> {
   const initialState = await adapter.readState(checkpoints);
   const session = accessibilityDriverSessionSchema.parse({
      sessionId: args.sessionId,
      target: args.target,
      startedAt: new Date().toISOString(),
      capabilities: adapter.capabilities,
      logCursor: initialState.logCursor,
      brokerPid: process.pid,
      socketPath: args.socketPath,
      metadataFile: args.metadataFile,
   });
   await writeSessionMetadata(session);
   return { args, adapter, session, checkpoints };
}

async function initializeBroker(): Promise<InitializedBroker> {
   const args = parseArgs(process.argv.slice(FIRST_USER_ARG));
   const adapter = createDriverAdapter(args.target);
   const readiness = await adapter.checkReadiness();
   if (readiness.status !== 'ready') {
      throw new Error(readiness.summary);
   }
   const checkpoints: DriverCheckpoint[] = [];
   await adapter.start();
   return await createBrokerSession(adapter, args, checkpoints);
}

async function main(): Promise<void> {
   const broker = await initializeBroker();
   await ensureSocketPath(broker.args.socketPath);
   const brokerState: BrokerState = { stopped: false };
   const stopOptions: StopBrokerOptions = {
      adapter: broker.adapter,
      args: broker.args,
      state: brokerState,
   };
   const context: BrokerHandlerContext = {
      adapter: broker.adapter,
      session: broker.session,
      checkpoints: broker.checkpoints,
      writeMetadata: writeSessionMetadata,
   };
   const server = createBrokerServer({
      context,
      onStop: () => {
         shutdownServer(server, stopOptions);
      },
   });
   server.listen(broker.args.socketPath);
   setupSignalHandlers(server, stopOptions);
}

try {
   await main();
} catch (error: unknown) {
   process.stderr.write(`${String(error)}\n`);
   process.exitCode = 1;
}

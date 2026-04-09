import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
   type DriverCheckpoint,
   type Platform,
   type SessionRecording,
} from '@a11ied/contracts';
import { createDriverAdapter } from '@a11ied/guidepup';

import type { BrokerHandlerContext } from './broker-handlers.js';
import {
   createBrokerServer,
   setupSignalHandlers,
   shutdownServer,
} from './broker-server.js';
import { startSessionRecording, type ActiveSessionRecording } from './recording.js';
import { writeSessionMetadata } from './session-utils.js';

const FIRST_USER_ARG = 2;

interface BrokerArgs {
   sessionId: string;
   target: Platform;
   metadataFile: string;
   socketPath: string;
   recordingPath?: string;
}

interface BrokerState {
   stopped: boolean;
   recording: ActiveSessionRecording | undefined;
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

function requireArg(values: Map<string, string>, flag: string): string {
   const value = values.get(flag);
   if (value) {
      return value;
   }

   throw new Error(
      'driver broker requires --session-id, --target, --metadata-file, and --socket-path',
   );
}

function parseBrokerTarget(target: string): Platform {
   if (target === 'virtual' || target === 'voiceover' || target === 'nvda') {
      return target;
   }

   throw new Error(`Unsupported target "${target}".`);
}

function parseArgs(argv: string[]): BrokerArgs {
   const values = collectArgValues(argv);
   const sessionId = requireArg(values, '--session-id');
   const target = parseBrokerTarget(requireArg(values, '--target'));
   const metadataFile = requireArg(values, '--metadata-file');
   const socketPath = requireArg(values, '--socket-path');
   const recordingPath = values.get('--recording-path');

   const args = {
      sessionId,
      target,
      metadataFile,
      socketPath,
   };
   if (recordingPath) {
      return { ...args, recordingPath };
   }
   return args;
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
   if (options.state.recording) {
      await options.state.recording.stop().catch(() => {
         // No-op
      });
      options.state.recording = undefined;
   }
   await options.adapter.stop().catch(() => {
      // No-op
   });
   await rm(options.args.metadataFile, { force: true });
   if (process.platform !== 'win32') {
      await rm(options.args.socketPath, { force: true });
   }
}

interface InitializedBroker {
   args: BrokerArgs;
   adapter: ReturnType<typeof createDriverAdapter>;
   session: AccessibilityDriverSession;
   checkpoints: DriverCheckpoint[];
   recording: ActiveSessionRecording | undefined;
}

async function createBrokerSession(args: {
   adapter: ReturnType<typeof createDriverAdapter>;
   brokerArgs: BrokerArgs;
   checkpoints: DriverCheckpoint[];
   recording: ActiveSessionRecording | undefined;
}): Promise<InitializedBroker> {
   const initialState = await args.adapter.readState(args.checkpoints);
   const session = accessibilityDriverSessionSchema.parse({
      sessionId: args.brokerArgs.sessionId,
      target: args.brokerArgs.target,
      startedAt: new Date().toISOString(),
      capabilities: args.adapter.capabilities,
      logCursor: initialState.logCursor,
      brokerPid: process.pid,
      socketPath: args.brokerArgs.socketPath,
      metadataFile: args.brokerArgs.metadataFile,
      recording: args.recording?.metadata,
   });
   await writeSessionMetadata(session);
   return {
      args: args.brokerArgs,
      adapter: args.adapter,
      session,
      checkpoints: args.checkpoints,
      recording: args.recording,
   };
}

function createBrokerRecording(args: BrokerArgs): ActiveSessionRecording | undefined {
   if (args.recordingPath) {
      return startSessionRecording(args.target, args.recordingPath);
   }

   return undefined;
}

async function initializeBroker(): Promise<InitializedBroker> {
   const args = parseArgs(process.argv.slice(FIRST_USER_ARG));
   const adapter = createDriverAdapter(args.target);
   const readiness = await adapter.checkReadiness();
   if (readiness.status !== 'ready') {
      throw new Error(readiness.summary);
   }
   const checkpoints: DriverCheckpoint[] = [];
   const recording = createBrokerRecording(args);
   await adapter.start();
   return createBrokerSession({
      adapter,
      brokerArgs: args,
      checkpoints,
      recording,
   });
}

async function main(): Promise<void> {
   const broker = await initializeBroker();
   await ensureSocketPath(broker.args.socketPath);
   const brokerState: BrokerState = { stopped: false, recording: broker.recording };
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
      async finishRecording(): Promise<SessionRecording | undefined> {
         if (!brokerState.recording) {
            return broker.session.recording;
         }
         const completedRecording = await brokerState.recording.stop();
         brokerState.recording = undefined;
         broker.session = accessibilityDriverSessionSchema.parse({
            ...broker.session,
            recording: completedRecording,
         });
         await writeSessionMetadata(broker.session);
         return completedRecording;
      },
   };
   const server = createBrokerServer({
      context,
      onStop: () => {
         shutdownServer(server, () => stopBroker(stopOptions));
      },
   });
   server.listen(broker.args.socketPath);
   setupSignalHandlers(server, () => stopBroker(stopOptions));
}

// oxlint-disable-next-line unicorn/prefer-top-level-await
main().catch((error: unknown) => {
   process.stderr.write(`${String(error)}\n`);
   process.exitCode = 1;
});

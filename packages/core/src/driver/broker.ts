import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
   driverFocusTargetFieldsSchema,
   platformSchema,
   virtualEngineSchema,
   type AccessibilityDriverSession,
   type Platform,
   type SessionRecording,
   type VirtualEngine,
} from '@a11ied/contracts';
import { createDriverAdapter, ignoreError, type DriverAdapter } from '@a11ied/guidepup';

import { createBrokerServer, createIdleTimer, shutdownServer } from './broker-server.js';
import { startSessionRecording, type ActiveSessionRecording } from './recording.js';
import { createDriverSessionContext } from './session-context.js';
import { removeSessionArtifactsSync, writeSessionMetadata } from './session-utils.js';

const FIRST_USER_ARG = 2;
const MS_PER_MINUTE = 60_000;

interface BrokerArgs {
   sessionId: string;
   target: Platform;
   metadataFile: string;
   socketPath: string;
   idleTimeoutMs: number;
   recordingPath?: string;
   url?: string;
   app?: AccessibilityDriverSession['app'];
   engine?: VirtualEngine;
}

interface BrokerState {
   stopped: boolean;
   stopping: boolean;
   recording: ActiveSessionRecording | undefined;
}

function collectArgValues(argv: string[]): Map<string, string> {
   const values = new Map<string, string>();
   for (const [index, part] of argv.entries()) {
      const value = argv[index + 1];
      if (part.startsWith('--') && value !== undefined) {
         values.set(part, value);
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
      'driver broker requires --session-id, --target, --metadata-file, --socket-path, and --idle-timeout-ms',
   );
}

function parseApp(raw: string | undefined): AccessibilityDriverSession['app'] {
   if (!raw) {
      return undefined;
   }
   return driverFocusTargetFieldsSchema.parse(JSON.parse(raw));
}

function parseArgs(argv: string[]): BrokerArgs {
   const values = collectArgValues(argv);
   const args: BrokerArgs = {
      sessionId: requireArg(values, '--session-id'),
      target: platformSchema.parse(requireArg(values, '--target')),
      metadataFile: requireArg(values, '--metadata-file'),
      socketPath: requireArg(values, '--socket-path'),
      idleTimeoutMs: Number(requireArg(values, '--idle-timeout-ms')),
   };
   const recordingPath = values.get('--recording-path'),
      url = values.get('--url');
   if (recordingPath) {
      args.recordingPath = recordingPath;
   }
   if (url) {
      args.url = url;
   }
   const app = parseApp(values.get('--app'));
   if (app) {
      args.app = app;
   }
   const engine = values.get('--engine');
   if (engine) {
      args.engine = virtualEngineSchema.parse(engine);
   }
   return args;
}

async function ensureSocketPath(socketPath: string): Promise<void> {
   if (process.platform !== 'win32') {
      await mkdir(dirname(socketPath), { recursive: true });
      await rm(socketPath, { force: true });
   }
}

async function assertTargetReady(target: Platform): Promise<void> {
   const readiness = await createDriverAdapter(target).checkReadiness();
   if (readiness.status !== 'ready') {
      throw new Error(readiness.summary);
   }
}

function createBrokerRecording(args: BrokerArgs): ActiveSessionRecording | undefined {
   if (args.recordingPath) {
      return startSessionRecording(args.target, args.recordingPath);
   }
   return undefined;
}

interface StopBrokerOptions {
   adapter: DriverAdapter;
   args: BrokerArgs;
   state: BrokerState;
}

async function stopBroker(options: StopBrokerOptions): Promise<void> {
   if (options.state.stopped) {
      return;
   }
   options.state.stopped = true;
   if (options.state.recording) {
      await options.state.recording.stop().catch(ignoreError);
      options.state.recording = undefined;
   }
   await options.adapter.stop().catch(ignoreError);
   removeSessionArtifactsSync(options.args);
}

/**
 * Every way the broker can die removes the session file and socket: a stop request, the
 * idle timeout, SIGINT, SIGTERM, SIGHUP, an uncaught exception, an unhandled rejection,
 * and finally the exit event as a synchronous last resort.
 */
function installProcessHandlers(args: {
   stop: () => void;
   stopOptions: StopBrokerOptions;
}): void {
   for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      process.on(signal, args.stop);
   }
   process.on('uncaughtException', (error) => {
      process.stderr.write(`${String(error)}\n`);
      args.stop();
   });
   process.on('unhandledRejection', (reason) => {
      process.stderr.write(`${String(reason)}\n`);
      args.stop();
   });
   process.on('exit', () => {
      if (!args.stopOptions.state.stopped) {
         removeSessionArtifactsSync(args.stopOptions.args);
      }
   });
}

async function main(): Promise<void> {
   const args = parseArgs(process.argv.slice(FIRST_USER_ARG));
   await assertTargetReady(args.target);
   const state: BrokerState = {
      stopped: false,
      stopping: false,
      recording: createBrokerRecording(args),
   };
   const { adapter, context } = await createDriverSessionContext({
      ...args,
      recording: state.recording,
      persist: true,
      idleTimeoutMinutes: args.idleTimeoutMs / MS_PER_MINUTE,
   });
   context.finishRecording = async (): Promise<SessionRecording | undefined> => {
      const completed = await state.recording?.stop();
      state.recording = undefined;
      return completed ?? context.session.recording;
   };
   await ensureSocketPath(args.socketPath);
   const stopOptions: StopBrokerOptions = { adapter, args, state };
   const controller = { stop: (): void => undefined };
   const idleTimer = createIdleTimer(args.idleTimeoutMs, () => controller.stop());
   const server = createBrokerServer({
      context,
      onStop: () => controller.stop(),
      onActivity: idleTimer.touch,
   });
   controller.stop = (): void => {
      if (!state.stopping) {
         state.stopping = true;
         idleTimer.clear();
         shutdownServer(server, () => stopBroker(stopOptions));
      }
   };
   installProcessHandlers({ stop: controller.stop, stopOptions });
   server.listen(args.socketPath, () => {
      writeSessionMetadata(context.session).catch(controller.stop);
   });
}

// oxlint-disable-next-line unicorn/prefer-top-level-await
main().catch((error: unknown) => {
   process.stderr.write(`${String(error)}\n`);
   process.exitCode = 1;
});

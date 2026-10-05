import { once } from 'node:events';
import type net from 'node:net';
import { CliEnvironmentError } from '../errors/cli-errors.js';
import { recordBrokerStartupError } from './broker-startup.js';
import { listFailureDetails } from './broker-errors.js';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
   driverFocusTargetFieldsSchema,
   platformSchema,
   virtualEngineSchema,
   nativeInputPolicySchema,
   type AccessibilityDriverSession,
   type Platform,
   type VirtualEngine,
} from '@a11ied/contracts';
import { createDriverAdapter, ignoreError, isVoiceOverRunning } from '@a11ied/guidepup';

import { createBrokerServer, createIdleTimer, shutdownServer } from './broker-server.js';
import type { BrokerHandlerContext } from './broker-types.js';
import { closeContext } from './context-queue.js';
import { createDriverSessionContext, stopSessionResources } from './session-context.js';
import { removeSessionArtifacts, removeSessionArtifactsSync } from './session-utils.js';

const FIRST_USER_ARG = 2,
   MS_PER_MINUTE = 60_000,
   VOICE_OVER_POLL_INTERVAL_MS = 1000;

interface BrokerArgs {
   sessionId: string;
   target: Platform;
   metadataFile: string;
   socketPath: string;
   idleTimeoutMs: number;
   recordingPath?: string;
   url?: string;
   app?: AccessibilityDriverSession['app'];
   browser?: string | undefined;
   nativeInput?: AccessibilityDriverSession['nativeInput'];
   engine?: VirtualEngine;
}

interface BrokerState {
   stopped: boolean;
   stopping: boolean;
   context?: BrokerHandlerContext | undefined;
   startup?: Promise<BrokerHandlerContext | undefined> | undefined;
   monitorTimer?: NodeJS.Timeout | undefined;
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
      browser: values.get('--browser'),
      nativeInput: nativeInputPolicySchema.parse(
         values.get('--native-input') ?? 'guarded',
      ),
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

interface StopBrokerOptions {
   context: BrokerHandlerContext;
   args: BrokerArgs;
   state: BrokerState;
}

async function stopBroker(options: StopBrokerOptions): Promise<void> {
   const finalize = async (): Promise<void> => {
      options.context.resourcesStopped = true;
      await removeSessionArtifacts(options.context.session);
      options.state.stopped = true;
   };
   await closeContext(options.context, async () => {
      if (options.context.resourcesStopped) {
         await finalize();
         return;
      }
      await stopSessionResources(
         options.context.adapter,
         options.context.finishRecording,
         finalize,
      );
   }).catch((error: unknown) => {
      if (!options.state.stopped) {
         throw error;
      }
      process.stderr.write(`${String(error)}\n`);
   });
}

/**
 * Every way the broker can die removes the session file and socket: a stop request, the
 * idle timeout, SIGINT, SIGTERM, SIGHUP, an uncaught exception, an unhandled rejection,
 * and finally the exit event as a synchronous last resort.
 */
function installProcessHandlers(args: {
   stop: () => void;
   args: BrokerArgs;
   state: BrokerState;
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
      if (!args.state.stopped && args.state.context) {
         removeSessionArtifactsSync(args.state.context.session);
      }
   });
}

function createVoiceOverMonitor(
   context: BrokerHandlerContext,
   onStop: () => void,
): NodeJS.Timeout | undefined {
   if (context.session.target !== 'voiceover') {
      return undefined;
   }
   const timer = setInterval(async () => {
      if (context.stopping) {
         return;
      }
      const running = await isVoiceOverRunning().catch(() => false);
      if (!running) {
         onStop();
      }
   }, VOICE_OVER_POLL_INTERVAL_MS);
   timer.unref();
   return timer;
}

async function initializeBrokerContext(
   args: BrokerArgs,
   state: BrokerState,
): Promise<BrokerHandlerContext | undefined> {
   await assertTargetReady(args.target);
   if (state.stopping) {
      return undefined;
   }
   const { context } = await createDriverSessionContext({
      ...args,
      persist: true,
      idleTimeoutMinutes: args.idleTimeoutMs / MS_PER_MINUTE,
   });
   try {
      await context.writeMetadata(context.session);
   } catch (error) {
      try {
         await stopBroker({ context, args, state });
      } catch (cleanupError) {
         const failures = new AggregateError(
            [context.startupError, error, cleanupError].filter(
               (failure) => failure !== undefined,
            ),
            'Recovery publication failed.',
         );
         context.startupError = new CliEnvironmentError(
            'session-metadata-cleanup-failed',
            `Recovery metadata and cleanup failed. Retry "a1 sr stop --session-id ${args.sessionId}".`,
            { sessionId: args.sessionId, failures: listFailureDetails(failures) },
         );
         context.startupError.cause = failures;
         return context;
      }
      throw error;
   }
   return context;
}

function createBrokerEndpoint(
   args: BrokerArgs,
   state: BrokerState,
): { server: net.Server; stop: () => void } {
   const controller = { stop: (): void => undefined },
      idleTimer = createIdleTimer(args.idleTimeoutMs, () => controller.stop());
   const server = createBrokerServer({
      context: () => state.context,
      onStop: () => controller.stop(),
      onActivity: idleTimer.touch,
   });
   controller.stop = (): void => {
      if (state.stopping) {
         return;
      }
      state.stopping = true;
      if (state.monitorTimer) {
         clearInterval(state.monitorTimer);
         state.monitorTimer = undefined;
      }
      idleTimer.clear();
      shutdownServer(server, async () => {
         const context = state.context ?? (await state.startup?.catch(ignoreError));
         if (context) {
            await stopBroker({ context, args, state });
         } else {
            state.stopped = true;
         }
      }).catch((error: unknown) => {
         state.stopping = false;
         process.stderr.write(`${String(error)}\n`);
      });
   };
   installProcessHandlers({ stop: controller.stop, args, state });
   return { server, stop: controller.stop };
}

async function main(): Promise<void> {
   const args = parseArgs(process.argv.slice(FIRST_USER_ARG)),
      state: BrokerState = { stopped: false, stopping: false };
   // Bind a retry endpoint before any native resource can be acquired.
   let endpoint: ReturnType<typeof createBrokerEndpoint> | undefined = undefined;
   try {
      await ensureSocketPath(args.socketPath);
      endpoint = createBrokerEndpoint(args, state);
      endpoint.server.listen(args.socketPath);
      await once(endpoint.server, 'listening');
      state.startup = initializeBrokerContext(args, state);
      state.context = await state.startup;
      if (state.context && !state.context.stopping && !state.stopping) {
         state.monitorTimer = createVoiceOverMonitor(state.context, endpoint.stop);
      }
   } catch (error) {
      process.stderr.write(`${String(error)}\n`);
      process.exitCode = 1;
      await recordBrokerStartupError(args.sessionId, error).catch(ignoreError);
      endpoint?.stop();
   }
}

// oxlint-disable-next-line unicorn/prefer-top-level-await
main().catch((error: unknown) => {
   process.stderr.write(`${String(error)}\n`);
   process.exitCode = 1;
});

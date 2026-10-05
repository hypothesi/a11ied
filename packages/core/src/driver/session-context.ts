import {
   accessibilityDriverSessionSchema,
   type AccessibilityDriverSession,
   type Platform,
   type SessionRecording,
   type VirtualEngine,
   type NativeInputPolicy,
} from '@a11ied/contracts';
import {
   createDriverAdapter,
   waitForWindowFocus,
   type DriverAdapter,
} from '@a11ied/guidepup';

import type { BrokerHandlerContext } from './broker-types.js';
import type { Page } from 'playwright';
import {
   isRecordingArtifactFailure,
   startSessionRecording,
   type ActiveSessionRecording,
} from './recording.js';
import { openUrlInBrowser } from './browser-launch.js';
import { CliEnvironmentError } from '../errors/cli-errors.js';
import { writeRecoveryMetadata } from './session-utils.js';
import { listFailureDetails } from './broker-errors.js';
import { TranscriptRecorder } from './transcript-recorder.js';
import { createVirtualHost } from './virtual-host-choice.js';
import { resolveDocumentTarget } from '../targets/runtime.js';
import { withCurrentBrowserPage } from '../browser/current-page.js';

export interface SessionContextOptions {
   target: Platform;
   sessionId: string;
   metadataFile: string;
   socketPath: string;
   recording?: ActiveSessionRecording | undefined;
   recordingPath?: string | undefined;
   browser?: string | undefined;
   nativeInput?: NativeInputPolicy | undefined;
   /** When false the session is never written to disk (ephemeral runs). */
   persist: boolean;
   url?: string | undefined;
   app?: AccessibilityDriverSession['app'] | undefined;
   idleTimeoutMinutes?: number | undefined;
   /** Where a virtual session runs; picked from the URL and the host when absent. */
   engine?: VirtualEngine | undefined;
   /** Library-only virtual reader binding to a page owned by the caller. */
   page?: Page | undefined;
}

/** The adapter for the target, and for virtual the engine its document ended up in. */
async function createSessionAdapter(
   options: SessionContextOptions,
): Promise<{ adapter: DriverAdapter; engine: VirtualEngine | undefined }> {
   if (options.target !== 'virtual') {
      return {
         adapter: createDriverAdapter(options.target, {
            nativeInput: options.nativeInput,
         }),
         engine: undefined,
      };
   }
   const virtualHost = await createVirtualHost({
      engine: options.engine,
      url: options.url,
      page: options.page,
   });
   return {
      adapter: createDriverAdapter('virtual', { virtualHost }),
      engine: virtualHost.engine,
   };
}

async function initializeVirtualDocument(
   options: SessionContextOptions,
   adapter: DriverAdapter,
   engine: VirtualEngine | undefined,
): Promise<void> {
   if (options.target !== 'virtual' || options.url === undefined) {
      return;
   }
   const resolved = await resolveDocumentTarget({ url: options.url });
   const html = engine === 'jsdom' ? await resolved.readHtml() : '';
   await adapter.attachDocument({ html, url: options.url });
}

function buildSessionRecord(
   options: SessionContextOptions,
   adapter: DriverAdapter,
   state: { logCursor: number; engine: VirtualEngine | undefined },
): AccessibilityDriverSession {
   return accessibilityDriverSessionSchema.parse({
      sessionId: options.sessionId,
      target: options.target,
      targetType: options.target === 'virtual' ? 'simulated' : 'real',
      startedAt: new Date().toISOString(),
      capabilities: adapter.capabilities,
      logCursor: state.logCursor,
      brokerPid: process.pid,
      socketPath: options.socketPath,
      metadataFile: options.metadataFile,
      recording: options.recording?.metadata,
      url: options.url,
      app: options.app,
      browser:
         options.browser ??
         (options.url === undefined ? undefined : options.app?.appName),
      nativeInput:
         options.target === 'virtual' ? undefined : (options.nativeInput ?? 'guarded'),
      idleTimeoutMinutes: options.idleTimeoutMinutes,
      engine: state.engine,
   });
}

async function noopWriteMetadata(): Promise<void> {
   // Ephemeral sessions never touch the state directory.
}

/** Focus a real target only after its adapter has acquired desktop ownership. */
export async function initializeSessionTarget(
   options: Pick<SessionContextOptions, 'target' | 'url' | 'app' | 'browser'>,
   adapter: DriverAdapter,
): Promise<AccessibilityDriverSession['app']> {
   if (options.target === 'virtual') {
      return options.app;
   }
   const url = options.url;
   const opened =
      url === undefined
         ? undefined
         : await adapter.runOwned(async () => openUrlInBrowser(url, options.browser));
   const app = opened?.focusTarget ?? options.app;
   if (!app) {
      if (options.url !== undefined) {
         throw new CliEnvironmentError(
            'browser-focus-unconfirmed',
            'The opened browser could not be identified.',
         );
      }
      return undefined;
   }
   const result = await adapter.focus(app);
   const focus = await waitForWindowFocus(app);
   if (result.status !== 'focused' || !focus.focused) {
      throw new CliEnvironmentError(
         'browser-focus-unconfirmed',
         'The session target did not come to the front. Reader startup was cancelled.',
         { target: app, frontmost: focus.frontmost },
      );
   }
   return app;
}

/** Keep desktop ownership until recorder shutdown is confirmed. */
export async function stopSessionResources(
   adapter: DriverAdapter | undefined,
   finishRecording: (() => Promise<unknown>) | undefined,
   afterStop?: () => Promise<void>,
): Promise<void> {
   const failures: unknown[] = [];
   try {
      await finishRecording?.();
   } catch (error) {
      if (!isRecordingArtifactFailure(error)) {
         throw error;
      }
      failures.push(error);
   }
   try {
      await adapter?.stop();
      await afterStop?.();
   } catch (error) {
      failures.push(error);
   }
   if (failures.length === 1) {
      throw failures[0];
   }
   if (failures.length > 0) {
      throw new AggregateError(
         failures,
         'Session cleanup could not complete. Retry stopping the session.',
      );
   }
}

async function finishContextRecording(
   context: BrokerHandlerContext,
   recording: { current: ActiveSessionRecording | undefined },
): Promise<SessionRecording | undefined> {
   const active = recording.current;
   if (!active) {
      return context.session.recording;
   }
   try {
      const completed = await active.stop();
      context.session.recording = completed;
      recording.current = undefined;
      return completed;
   } catch (error) {
      if (isRecordingArtifactFailure(error)) {
         context.session.recording = active.metadata;
         recording.current = undefined;
      }
      throw error;
   }
}

function createHandlerContext(
   options: SessionContextOptions,
   adapter: DriverAdapter,
   state: {
      engine: VirtualEngine | undefined;
      recording: { current: ActiveSessionRecording | undefined };
   },
): BrokerHandlerContext {
   const context: BrokerHandlerContext = {
      adapter,
      session: buildSessionRecord(options, adapter, {
         logCursor: 0,
         engine: state.engine,
      }),
      checkpoints: [],
      transcript: new TranscriptRecorder(),
      writeMetadata: options.persist ? writeRecoveryMetadata : noopWriteMetadata,
      async finishRecording(): Promise<SessionRecording | undefined> {
         return finishContextRecording(context, state.recording);
      },
   };
   return context;
}

async function initializeSessionResources(
   options: SessionContextOptions,
   context: BrokerHandlerContext,
   recording: { current: ActiveSessionRecording | undefined },
): Promise<void> {
   const adapter = context.adapter;
   await adapter.start();
   await initializeVirtualDocument(options, adapter, context.session.engine);
   context.session.app = await initializeSessionTarget(options, adapter);
   if (options.url !== undefined) {
      context.session.browser ??= context.session.app?.appName;
   }
   const recordingPath = options.recordingPath;
   if (!recording.current && recordingPath) {
      recording.current = await adapter.runOwned(async () =>
         startSessionRecording(options.target, recordingPath),
      );
      context.session.recording = recording.current.metadata;
   }
   const initialState = await adapter.readState(context.checkpoints);
   context.transcript.capture(initialState);
   context.session.logCursor = initialState.logCursor;
}

async function initializeDriverContext(
   options: SessionContextOptions,
   context: BrokerHandlerContext,
   recording: { current: ActiveSessionRecording | undefined },
): Promise<void> {
   if (options.page) {
      return withCurrentBrowserPage({
         load: { kind: 'goto', url: options.url ?? options.page.url() },
         page: options.page,
         callback: async () => initializeSessionResources(options, context, recording),
      });
   }
   return initializeSessionResources(options, context, recording);
}

/**
 * Retain a stopping context when startup cannot confirm cleanup. Callers publish its
 * existing stop/ping transport and report startupError instead of accepting input.
 */
export async function createDriverSessionContext(
   options: SessionContextOptions,
): Promise<{ adapter: DriverAdapter; context: BrokerHandlerContext }> {
   const { adapter, engine } = await createSessionAdapter(options),
      recording = { current: options.recording };
   const context = createHandlerContext(options, adapter, { engine, recording });
   try {
      await initializeDriverContext(options, context, recording);
      return { adapter, context };
   } catch (error) {
      context.stopping = true;
      try {
         await stopSessionResources(adapter, context.finishRecording, async () => {
            context.resourcesStopped = true;
         });
      } catch (cleanupError) {
         const failures = new AggregateError(
            [error, cleanupError],
            'Startup and cleanup failed.',
         );
         if (context.resourcesStopped) {
            throw failures;
         }
         context.startupError = new CliEnvironmentError(
            'session-startup-cleanup-failed',
            `Startup failed and cleanup is unconfirmed. Retry "a1 sr stop --session-id ${options.sessionId}".`,
            { sessionId: options.sessionId, failures: listFailureDetails(failures) },
         );
         context.startupError.cause = failures;
         return { adapter, context };
      }
      throw error;
   }
}

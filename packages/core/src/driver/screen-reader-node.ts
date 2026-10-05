import type {
   DriverMode,
   Platform,
   VirtualEngine,
   NativeInputPolicy,
} from '@a11ied/contracts';
import { defaultVirtualDocument, ignoreError } from '@a11ied/guidepup';
import type { Page } from 'playwright';

import { CliUsageError } from '../errors/cli-errors.js';
import { resolveDocumentTarget } from '../targets/runtime.js';
import type { CommandQueueOptions } from './command-queue.js';
import { queueScreenReader, type QueuedScreenReader } from './queued-screen-reader.js';
import { validateRecordingRequest } from './recording.js';
import {
   attachDocumentToDriverSession,
   getActiveDriverSession,
   getDriverSessionStatus,
   runDriverSessionAction,
   startDriverSession,
   stopDriverSession,
} from './runtime.js';
import { assertTargetReady } from './runtime-support.js';
import { ScreenReader } from './screen-reader.js';
import { createContextTransport } from './screen-reader-context.js';
import type {
   ScreenReaderDocument,
   ScreenReaderSession,
   ScreenReaderTransport,
} from './screen-reader-transport.js';
import {
   createDriverSessionContext,
   initializeSessionTarget,
   stopSessionResources,
} from './session-context.js';
import { createSessionId } from './session-utils.js';
import { isPageUrl } from './virtual-playwright-host.js';
import {
   finalizeInProcessRecovery,
   retainInProcessRecovery,
} from './runtime-internal.js';
import type { BrokerHandlerContext } from './broker-types.js';

async function stopLibraryContext(context: BrokerHandlerContext): Promise<void> {
   if (context.resourcesStopped) {
      await finalizeInProcessRecovery(context);
      return;
   }
   try {
      await stopSessionResources(context.adapter, context.finishRecording, async () => {
         context.resourcesStopped = true;
         await finalizeInProcessRecovery(context);
      });
   } catch (error) {
      if (!context.resourcesStopped) {
         return retainInProcessRecovery(context, error);
      }
      throw error;
   }
}

export interface ScreenReaderOptions {
   /** Which reader: `virtual` (default), `voiceover`, or `nvda`. */
   sr?: Platform | undefined;
   /** The page to open. VoiceOver and NVDA open it in the system browser and focus it. */
   url?: string | undefined;
   /** Selects the browser used by real-reader sessions. */
   browser?: string | undefined;
   /** Development permits unverified desktop input; default requires native binding. */
   nativeInput?: NativeInputPolicy | undefined;
   /** Inline markup for the virtual reader, rendered by jsdom. Not with `url`. */
   html?: string | undefined;
   /**
    * Healthy `in-process` sessions (default) do not persist state. Failed cleanup
    * publishes recovery metadata; retry `stop()` or `stopDriverSession({sessionId})` in
    * this process. `broker` starts the detached process `a1 sr` shares, so `a1 sr
    * transcript` in another terminal reads the same session.
    */
   mode?: DriverMode | undefined;
   /** Forces the virtual engine. `StartDriverSessionOptions.engine` describes the default. */
   engine?: VirtualEngine | undefined;
   /** Inspect this page with the in-process virtual reader without reloading it. */
   page?: Page | undefined;
   /** Records the screen, on VoiceOver and NVDA, to this .mov or .mp4 path. */
   recordingPath?: string | undefined;
   /** Bounds every screen reader command unless a call passes its own. */
   timeoutMs?: number | undefined;
   /**
    * Broker mode only: the broker stops after this many idle minutes, and 0 disables
    * that.
    */
   idleTimeoutMinutes?: number | undefined;
}

/**
 * What the adapter attaches. The browser engine navigates to the URL itself, and a real
 * reader only records it. The jsdom engine needs the HTML, so the URL is fetched here.
 */
function createDocumentLoader(
   session: ScreenReaderSession,
): (document: ScreenReaderDocument) => Promise<{ html: string; url: string }> {
   return async (document) => {
      if (document.html !== undefined) {
         if (session.sr !== 'virtual') {
            throw new CliUsageError(
               'validation-error',
               'Inline HTML requires the virtual reader. Pass a URL to a real reader.',
            );
         }
         return { html: document.html, url: document.url ?? defaultVirtualDocument.url };
      }
      if (document.url === undefined) {
         throw new CliUsageError('missing-target', 'Pass a URL or inline HTML to open.');
      }
      const fetchNeeded = session.sr === 'virtual' && session.engine === 'jsdom';
      if (!fetchNeeded) {
         return { html: '', url: document.url };
      }
      const resolved = await resolveDocumentTarget({ url: document.url });
      return { html: await resolved.readHtml(), url: resolved.target.value };
   };
}

async function createInProcessTransport(
   options: ScreenReaderOptions,
   sr: Platform,
): Promise<ScreenReaderTransport> {
   await assertTargetReady(sr);
   if (options.recordingPath) {
      validateRecordingRequest(sr, options.recordingPath);
   }
   const sessionId = `test_${createSessionId()}`;
   const { adapter, context } = await createDriverSessionContext({
      target: sr,
      sessionId,
      metadataFile: `in-memory://${sessionId}`,
      socketPath: `in-memory://${sessionId}`,
      recordingPath: options.recordingPath,
      browser: options.browser,
      nativeInput: options.nativeInput,
      persist: false,
      url: options.url ?? options.page?.url(),
      engine: options.engine,
      page: options.page,
   });
   if (context.startupError) {
      return retainInProcessRecovery(context, context.startupError);
   }
   const session: ScreenReaderSession = {
      sr,
      mode: 'in-process',
      engine: context.session.engine,
      nativeInput: context.session.nativeInput,
      url: context.session.url,
   };
   const load = createDocumentLoader(session);
   return createContextTransport({
      context,
      session,
      timeoutMs: options.timeoutMs,
      async load(document): Promise<{ html: string; url: string }> {
         const loaded = await load(document);
         if (sr !== 'virtual') {
            context.session.app = await initializeSessionTarget(
               {
                  target: sr,
                  url: loaded.url,
                  app: context.session.app,
                  browser: context.session.browser,
               },
               adapter,
            );
            context.session.browser ??= context.session.app?.appName;
         }
         context.session.url = loaded.url;
         return loaded;
      },
      async stop(): Promise<void> {
         await stopLibraryContext(context);
      },
   });
}

async function createBrokerTransport(
   options: ScreenReaderOptions,
   sr: Platform,
): Promise<ScreenReaderTransport> {
   const started = await startDriverSession({
      target: sr,
      mode: 'broker',
      url: options.url,
      browser: options.browser,
      nativeInput: options.nativeInput,
      engine: options.engine,
      recordingPath: options.recordingPath,
      idleTimeoutMinutes: options.idleTimeoutMinutes,
   });
   const { sessionId } = started.session,
      session: ScreenReaderSession = {
         sr,
         mode: 'broker',
         engine: started.session.engine,
         nativeInput: started.session.nativeInput,
         url: started.session.url,
      };
   const load = createDocumentLoader(session),
      timeout = { timeoutMs: options.timeoutMs, expectedSessionId: sessionId };
   return {
      session,
      run: (request, runOptions) =>
         runDriverSessionAction(request, {
            timeoutMs: runOptions?.timeoutMs ?? options.timeoutMs,
            expectedSessionId: sessionId,
         }),
      async open(document) {
         const loaded = await load(document);
         const step = await attachDocumentToDriverSession(loaded, timeout);
         session.url = loaded.url;
         return step;
      },
      status: () => getDriverSessionStatus(timeout),
      async stop(): Promise<void> {
         const active = await getActiveDriverSession();
         if (active?.sessionId === sessionId) {
            await stopDriverSession(timeout);
         }
      },
   };
}

function assertOneDocument(options: ScreenReaderOptions): void {
   if (
      options.page &&
      ((options.sr !== undefined && options.sr !== 'virtual') ||
         options.mode === 'broker' ||
         options.engine === 'jsdom' ||
         options.html !== undefined)
   ) {
      throw new CliUsageError(
         'browser-reader-binding-conflict',
         'An existing page requires an in-process virtual browser reader without inline HTML.',
      );
   }
   if (
      options.html !== undefined &&
      options.sr !== undefined &&
      options.sr !== 'virtual'
   ) {
      throw new CliUsageError(
         'validation-error',
         'Inline HTML requires the virtual reader. Pass a URL to a real reader.',
      );
   }
   if (options.url !== undefined && options.html !== undefined) {
      throw new CliUsageError(
         'validation-error',
         'Pass url or html, not both. A session opens one document at a time.',
         { url: options.url },
      );
   }
   if (options.url !== undefined && !isPageUrl(options.url)) {
      throw new CliUsageError(
         'validation-error',
         `The URL must start with http, https, or file. Got "${options.url}".`,
         { field: 'url', value: options.url },
      );
   }
}

/**
 * Starts a screen reader for a test and opens the page when one is given. Dispose it with
 * `await using`, or call `stop` in an `afterEach`.
 *
 * @example
 *    await using sr = await screenReader({ url: 'http://localhost:3000/checkout' });
 *    await sr.goTo({ role: 'button', name: 'Pay' });
 *    await sr.expectSpoken('Pay, button');
 */
export async function screenReader(
   options: ScreenReaderOptions = {},
): Promise<ScreenReader> {
   assertOneDocument(options);
   const mode = options.mode ?? 'in-process',
      sr = options.sr ?? 'virtual';
   const transport =
      mode === 'broker'
         ? await createBrokerTransport(options, sr)
         : await createInProcessTransport(options, sr);
   const reader = new ScreenReader(transport);
   try {
      if (sr === 'virtual' && options.html !== undefined) {
         await reader.open({ url: options.url, html: options.html });
      }
   } catch (error) {
      await reader.stop().catch(ignoreError);
      throw error;
   }
   return reader;
}

/**
 * Starts a screen reader and wraps it in a command queue, so a test calls its methods
 * without `await` and awaits only a call whose value it needs. `await using` runs every
 * queued command and then stops the reader.
 *
 * @example
 *    await using sr = await queuedScreenReader({
 *       url: 'http://localhost:3000/checkout',
 *    });
 *    sr.goTo({ role: 'button', name: 'Pay' });
 *    sr.expectSpoken('button, Pay');
 */
export async function queuedScreenReader(
   options: ScreenReaderOptions = {},
   queue: CommandQueueOptions = {},
): Promise<QueuedScreenReader> {
   return queueScreenReader(await screenReader(options), queue);
}

import type {
   DriverFocusTarget,
   DriverMode,
   Platform,
   VirtualEngine,
} from '@a11ied/contracts';
import {
   defaultVirtualDocument,
   ignoreError,
   waitForWindowFocus,
} from '@a11ied/guidepup';

import { CliUsageError } from '../errors/cli-errors.js';
import { resolveDocumentTarget } from '../targets/runtime.js';
import { openUrlInBrowser } from './browser-launch.js';
import { runContextAction } from './context-action.js';
import { startSessionRecording, validateRecordingRequest } from './recording.js';
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
import { createDriverSessionContext } from './session-context.js';
import { createSessionId } from './session-utils.js';
import { isPageUrl } from './virtual-playwright-host.js';

export interface ScreenReaderOptions {
   /** Which reader: `virtual` (default), `voiceover`, or `nvda`. */
   sr?: Platform | undefined;
   /** The page to open. VoiceOver and NVDA open it in the system browser and focus it. */
   url?: string | undefined;
   /** Inline markup for the virtual reader, rendered by jsdom. Not with `url`. */
   html?: string | undefined;
   /**
    * `in-process` (default) runs the reader inside the test process and never touches the
    * per-user state directory. `broker` starts the detached process `a1 sr` shares, so
    * `a1 sr transcript` in another terminal reads the same session.
    */
   mode?: DriverMode | undefined;
   /** Forces the virtual engine. `StartDriverSessionOptions.engine` describes the default. */
   engine?: VirtualEngine | undefined;
   /** Records the screen, on VoiceOver and NVDA, to this .mov or .mp4 path. */
   recordingPath?: string | undefined;
   /** Bounds every screen reader command unless a call passes its own. */
   timeoutMs?: number | undefined;
   /** Broker mode only: the broker stops after this many idle minutes, and 0 disables that. */
   idleTimeoutMinutes?: number | undefined;
}

function isRealTarget(sr: Platform): boolean {
   return sr === 'voiceover' || sr === 'nvda';
}

/** Real readers read the screen, so the page is opened in the system browser first. */
async function openRealTargetPage(
   sr: Platform,
   url: string | undefined,
): Promise<DriverFocusTarget | undefined> {
   if (!isRealTarget(sr) || url === undefined) {
      return undefined;
   }
   const opened = await openUrlInBrowser(url);
   if (opened.focusTarget) {
      await waitForWindowFocus(opened.focusTarget);
   }
   return opened.focusTarget;
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
      return { html: resolved.html, url: resolved.resolvedUrl };
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
   const app = await openRealTargetPage(sr, options.url),
      sessionId = `test_${createSessionId()}`;
   const recording = options.recordingPath
      ? startSessionRecording(sr, options.recordingPath)
      : undefined;
   const { adapter, context } = await createDriverSessionContext({
      target: sr,
      sessionId,
      metadataFile: `in-memory://${sessionId}`,
      socketPath: `in-memory://${sessionId}`,
      recording,
      persist: false,
      url: options.url,
      app,
      engine: options.engine,
   });
   if (app) {
      await runContextAction(context, { action: 'focus' });
   }
   const session: ScreenReaderSession = {
      sr,
      mode: 'in-process',
      engine: context.session.engine,
   };
   return createContextTransport({
      context,
      session,
      timeoutMs: options.timeoutMs,
      load: createDocumentLoader(session),
      async stop(): Promise<void> {
         await context.finishRecording?.().catch(ignoreError);
         await adapter.stop();
      },
   });
}

async function createBrokerTransport(
   options: ScreenReaderOptions,
   sr: Platform,
): Promise<ScreenReaderTransport> {
   const app = await openRealTargetPage(sr, options.url);
   const started = await startDriverSession({
      target: sr,
      mode: 'broker',
      url: options.url,
      app,
      engine: options.engine,
      recordingPath: options.recordingPath,
      idleTimeoutMinutes: options.idleTimeoutMinutes,
   });
   const { sessionId } = started.session,
      session: ScreenReaderSession = {
         sr,
         mode: 'broker',
         engine: started.session.engine,
      };
   const load = createDocumentLoader(session),
      timeout = { timeoutMs: options.timeoutMs };
   if (app) {
      await runDriverSessionAction({ action: 'focus' }, timeout);
   }
   return {
      session,
      run: (request, runOptions) =>
         runDriverSessionAction(request, {
            timeoutMs: runOptions?.timeoutMs ?? options.timeoutMs,
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
      if (options.url !== undefined || options.html !== undefined) {
         await reader.open({ url: options.url, html: options.html });
      }
   } catch (error) {
      await reader.stop().catch(ignoreError);
      throw error;
   }
   return reader;
}

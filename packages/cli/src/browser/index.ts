/// <reference lib="dom" />
import {
   createVirtualAdapter,
   createVirtualRuntime,
   type VirtualHost,
} from '@a11ied/guidepup/browser';
import { virtual } from '@guidepup/virtual-screen-reader';
import { test as base } from 'vitest';

import type { ActionContext } from '../../../core/src/driver/broker-types.js';
import {
   queueScreenReader,
   type QueuedScreenReader,
} from '../../../core/src/driver/queued-screen-reader.js';
import { ScreenReader } from '../../../core/src/driver/screen-reader.js';
import { createContextTransport } from '../../../core/src/driver/screen-reader-context.js';
import { ScreenReaderAssertionError } from '../../../core/src/driver/screen-reader-errors.js';
import { TranscriptRecorder } from '../../../core/src/driver/transcript-recorder.js';
import { CliUsageError } from '../../../core/src/errors/cli-errors.js';
import '../vitest/extend.js';
import { createScreenReaderFixture } from '../vitest/fixture.js';

export { queueScreenReader, ScreenReader, ScreenReaderAssertionError };
import type {
   CommandQueueOptions,
   Queued,
} from '../../../core/src/driver/command-queue.js';
export type { CommandQueueOptions, Queued };
export type { QueuedScreenReader };
export {
   isScreenReader,
   screenReaderMatchers,
   type ItemReceived,
   type MatcherOutcome,
   type SpokenReceived,
} from '../vitest/matchers.js';
export type {
   LoopOptions,
   NavigateOptions,
   WaitOptions,
} from '../../../core/src/driver/screen-reader.js';
export type {
   ScreenReaderSession,
   ScreenReaderStep,
} from '../../../core/src/driver/screen-reader-transport.js';
export type {
   SpokenMatch,
   SpokenOptions,
} from '../../../core/src/driver/spoken-matchers.js';

export interface BrowserScreenReaderOptions {
   /** The node the reader is bounded to; the document body by default. */
   container?: Node | undefined;
}

function createOpenError(): CliUsageError {
   return new CliUsageError(
      'unsupported-in-browser',
      'open() is not available in the browser runner: mount the component, then call screenReader().',
   );
}

function createPageHost(options: BrowserScreenReaderOptions): VirtualHost {
   const { container } = options;
   const runtime = createVirtualRuntime({
      getVirtual: async () => virtual,
      getWindow: () => globalThis,
      getContainer: container === undefined ? undefined : (): Node => container,
   });
   return {
      ...runtime,
      engine: 'browser',
      attachDocument: async () => {
         throw createOpenError();
      },
      dispose: runtime.stop,
   };
}

/**
 * Starts the virtual screen reader against the page this test runs in, with no broker and
 * no second page load. Mount the component first; the reader reads the document body, or
 * `container` when given.
 *
 * @example
 *    await using sr = await screenReader({ container: screen.container });
 *    await sr.next('button');
 *    await expect(sr).toBeOn({ role: 'button', name: 'Pay' });
 */
export async function screenReader(
   options: BrowserScreenReaderOptions = {},
): Promise<ScreenReader> {
   const host = createPageHost(options),
      transcript = new TranscriptRecorder();
   const adapter = createVirtualAdapter(host),
      checkpoints: ActionContext['checkpoints'] = [];
   await host.start();
   transcript.capture(await adapter.readState(checkpoints));
   const context: ActionContext = { adapter, session: {}, checkpoints, transcript };
   const transport = createContextTransport({
      context,
      session: {
         sr: 'virtual',
         mode: 'in-process',
         engine: 'browser',
         url: location.href,
      },
      load: async () => {
         throw createOpenError();
      },
      stop: () => host.dispose(),
   });
   return new ScreenReader(transport);
}

/**
 * Starts the virtual screen reader on the page and wraps it in a command queue, so the
 * test calls its methods without `await`. `await using` runs every queued command and
 * then stops the reader.
 */
export async function queuedScreenReader(
   options: BrowserScreenReaderOptions = {},
   queue: CommandQueueOptions = {},
): Promise<QueuedScreenReader> {
   return queueScreenReader(await screenReader(options), queue);
}

/** The fixtures `test` provides: a reader over the document body. */
export interface BrowserScreenReaderFixtures {
   /** A queued reader over the page. Call its methods without `await`. */
   sr: QueuedScreenReader;
   /** Override with `test.extend({ srOptions: { container } })` to bound the reader. */
   srOptions: BrowserScreenReaderOptions;
}

/**
 * Vitest's `test` with an `sr` fixture for browser mode: the virtual reader is started on
 * the page before each test and stopped after it. Its methods queue, so the test needs no
 * `await` unless it reads a value.
 */
export const test = base.extend<BrowserScreenReaderFixtures>({
   srOptions: {},
   sr: createScreenReaderFixture(screenReader),
});

export { test as it };

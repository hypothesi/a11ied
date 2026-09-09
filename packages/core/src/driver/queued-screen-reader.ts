import { CommandQueue, type CommandQueueOptions, type Queued } from './command-queue.js';
import type { ScreenReader } from './screen-reader.js';
import type { ScreenReaderSession } from './screen-reader-transport.js';

type AsyncMethodName = {
   [Key in keyof ScreenReader]: ScreenReader[Key] extends (
      ...args: never[]
   ) => Promise<unknown>
      ? Key
      : never;
}[keyof ScreenReader];

/** Every async `ScreenReader` method, returning a `Queued` instead of a `Promise`. */
type QueuedMethods = {
   [
      Key in Exclude<AsyncMethodName, 'stop' | typeof Symbol.asyncDispose>
   ]: ScreenReader[Key] extends (...args: infer Args) => Promise<infer Result>
      ? (...args: Args) => Queued<Result>
      : never;
};

/**
 * A `ScreenReader` whose methods queue instead of running at once. Call them without
 * `await`, and await only a call whose value the test needs. That await runs every
 * command queued before it, then that one.
 */
export interface QueuedScreenReader extends QueuedMethods, AsyncDisposable {
   /** Which reader this is, where it runs, and the page it last opened. */
   readonly session: ScreenReaderSession;
   /** The reader under the queue, for a call that must run at once. */
   readonly reader: ScreenReader;
   /**
    * Waits for every queued command. Rejects with the first failure nobody awaited,
    * unless the queue's `track` option already received it.
    */
   drain(): Promise<void>;
   /** Drains, stops the reader even when the drain failed, then rethrows that failure. */
   stop(): Promise<void>;
}

type QueuedCall<Args extends unknown[], Result> = (...args: Args) => Queued<Result>;

function createQueuedCall<Args extends unknown[], Result>(
   commands: CommandQueue,
   call: (...args: Args) => Promise<Result>,
): QueuedCall<Args, Result> {
   const queued = (...args: Args): Queued<Result> => {
      const callSite = new Error('call site');
      // V8 only. Elsewhere the wrapper frame stays in the stack, which is acceptable.
      if (typeof Error.captureStackTrace === 'function') {
         Error.captureStackTrace(callSite, queued);
      }
      return commands.enqueue(() => call(...args), callSite);
   };
   return queued;
}

/*
 * Every async method is listed by hand, because a `Proxy` cannot be typed as
 * `QueuedScreenReader` without a cast. `QueuedMethods` is derived from `ScreenReader`, so a
 * method added there fails to compile here until it gets a line.
 */
function queuedMethods(reader: ScreenReader, commands: CommandQueue): QueuedMethods {
   const wrap = <Args extends unknown[], Result>(
      call: (...args: Args) => Promise<Result>,
   ): QueuedCall<Args, Result> => createQueuedCall(commands, call);
   return {
      next: wrap(reader.next.bind(reader)),
      previous: wrap(reader.previous.bind(reader)),
      press: wrap(reader.press.bind(reader)),
      type: wrap(reader.type.bind(reader)),
      interact: wrap(reader.interact.bind(reader)),
      stopInteracting: wrap(reader.stopInteracting.bind(reader)),
      activate: wrap(reader.activate.bind(reader)),
      top: wrap(reader.top.bind(reader)),
      bottom: wrap(reader.bottom.bind(reader)),
      escape: wrap(reader.escape.bind(reader)),
      perform: wrap(reader.perform.bind(reader)),
      read: wrap(reader.read.bind(reader)),
      state: wrap(reader.state.bind(reader)),
      title: wrap(reader.title.bind(reader)),
      find: wrap(reader.find.bind(reader)),
      goTo: wrap(reader.goTo.bind(reader)),
      elements: wrap(reader.elements.bind(reader)),
      readAll: wrap(reader.readAll.bind(reader)),
      walk: wrap(reader.walk.bind(reader)),
      wait: wrap(reader.wait.bind(reader)),
      checkpoint: wrap(reader.checkpoint.bind(reader)),
      transcript: wrap(reader.transcript.bind(reader)),
      open: wrap(reader.open.bind(reader)),
      table: wrap(reader.table.bind(reader)),
      screenshot: wrap(reader.screenshot.bind(reader)),
      focus: wrap(reader.focus.bind(reader)),
      expectSpoken: wrap(reader.expectSpoken.bind(reader)),
      expectOn: wrap(reader.expectOn.bind(reader)),
      expectSpokenInOrder: wrap(reader.expectSpokenInOrder.bind(reader)),
   };
}

/**
 * Wraps a started reader in a command queue. `queue.track` receives one settled promise
 * per command, and `queue.signal` skips every command not yet started once it aborts.
 *
 * @example
 *    await using sr = queueScreenReader(await screenReader({ html }));
 *    sr.next('button');
 *    sr.expectOn({ role: 'button', name: 'Pay' });
 */
export function queueScreenReader(
   reader: ScreenReader,
   queue: CommandQueueOptions = {},
): QueuedScreenReader {
   const commands = new CommandQueue(queue);
   const stop = async (): Promise<void> => {
      try {
         await commands.drain();
      } finally {
         await reader.stop();
      }
   };
   return {
      ...queuedMethods(reader, commands),
      get session(): ScreenReaderSession {
         return reader.session;
      },
      reader,
      drain: (): Promise<void> => commands.drain(),
      stop,
      [Symbol.asyncDispose]: stop,
   };
}

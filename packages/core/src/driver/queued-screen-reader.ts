import type { WantedItem } from './broker-loops.js';
import { CommandQueue, type CommandQueueOptions, type Queued } from './command-queue.js';
import type { ScreenReader } from './screen-reader.js';
import type { ScreenReaderSession } from './screen-reader-transport.js';
import type { RetryOptions, SpokenMatch, SpokenOptions } from './spoken-matchers.js';

type AsyncMethodName = {
   [Key in keyof ScreenReader]: ScreenReader[Key] extends (
      ...args: never[]
   ) => Promise<unknown>
      ? Key
      : never;
}[keyof ScreenReader];

/** Every async `ScreenReader` method, returning a chain instead of a `Promise`. */
type QueuedMethods = {
   [
      Key in Exclude<AsyncMethodName, 'stop' | typeof Symbol.asyncDispose>
   ]: ScreenReader[Key] extends (...args: infer Args) => Promise<infer Result>
      ? (...args: Args) => QueuedChain<Result>
      : never;
};

/**
 * The checks a chain makes after a command. Each queues like a command, so a test writes
 * `sr.press('Enter').expect.spoken('expanded')` with no `await`. They check what the
 * reader's `expectSpoken`, `expectSpokenInOrder`, and `expectCursorOn` methods check, and
 * wait the same way.
 */
export interface QueuedExpectations {
   spoken(match: SpokenMatch, options?: SpokenOptions): QueuedAssertion;
   spokenInOrder(
      matches: readonly SpokenMatch[],
      options?: Pick<SpokenOptions, 'since' | 'timeoutMs'>,
   ): QueuedAssertion;
   cursorOn(wanted: WantedItem, options?: RetryOptions): QueuedAssertion;
}

/**
 * Every reader method for the next command, and `expect` for a check. This is what the
 * reader and every chain have in common, so a helper that starts a chain takes it.
 */
export interface QueuedCommands extends QueuedMethods {
   /** A check, queued after the commands before it. */
   readonly expect: QueuedExpectations;
}

/**
 * What a queued command returns: a thenable for its value, and every command and check
 * for the next step. Awaiting it runs every command queued before it, then that one.
 */
export interface QueuedChain<Value> extends QueuedCommands, PromiseLike<Value> {}

/** What a queued check returns: a chain, plus `and` for another check. */
export interface QueuedAssertion extends QueuedChain<void> {
   readonly and: QueuedExpectations;
}

/**
 * A `ScreenReader` whose methods queue instead of running at once. Call them without
 * `await`, and await only a call whose value the test needs. That await runs every
 * command queued before it. Each call returns a chain, so commands and checks may follow
 * one another with dots or stand as separate statements.
 */
export interface QueuedScreenReader extends QueuedCommands, AsyncDisposable {
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

type ToChain = <Value>(queued: Queued<Value>) => QueuedChain<Value>;
type QueuedCall<Args extends unknown[], Result> = (...args: Args) => QueuedChain<Result>;

function createQueuedCall<Args extends unknown[], Result>(
   commands: CommandQueue,
   call: (...args: Args) => Promise<Result>,
   toChain: ToChain,
): QueuedCall<Args, Result> {
   const queued = (...args: Args): QueuedChain<Result> => {
      const callSite = new Error('call site');
      // V8 only. Elsewhere the wrapper frame stays in the stack, which is acceptable.
      if (typeof Error.captureStackTrace === 'function') {
         Error.captureStackTrace(callSite, queued);
      }
      return toChain(commands.enqueue(() => call(...args), callSite));
   };
   return queued;
}

/*
 * Every async method is listed by hand, because a `Proxy` cannot be typed as
 * `QueuedScreenReader` without a cast. `QueuedMethods` is derived from `ScreenReader`, so a
 * method added there fails to compile here until it gets a line.
 */
function queuedMethods(
   reader: ScreenReader,
   commands: CommandQueue,
   toChain: ToChain,
): QueuedMethods {
   const wrap = <Args extends unknown[], Result>(
      call: (...args: Args) => Promise<Result>,
   ): QueuedCall<Args, Result> => createQueuedCall(commands, call, toChain);
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
      expectCursorOn: wrap(reader.expectCursorOn.bind(reader)),
      expectSpokenInOrder: wrap(reader.expectSpokenInOrder.bind(reader)),
   };
}

/**
 * Builds chains. A chain carries every method and every check, and each of those returns
 * a chain, so the three are created together and look each other up at call time.
 */
class ChainFactory {
   readonly methods: QueuedMethods;
   readonly expectations: QueuedExpectations;

   constructor(reader: ScreenReader, commands: CommandQueue) {
      this.methods = queuedMethods(reader, commands, (queued) => this.toChain(queued));
      this.expectations = {
         spoken: (match, options): QueuedAssertion =>
            this.withAnd(this.methods.expectSpoken(match, options)),
         spokenInOrder: (matches, options): QueuedAssertion =>
            this.withAnd(this.methods.expectSpokenInOrder(matches, options)),
         cursorOn: (wanted, options): QueuedAssertion =>
            this.withAnd(this.methods.expectCursorOn(wanted, options)),
      };
   }

   toChain<Value>(queued: Queued<Value>): QueuedChain<Value> {
      return {
         ...this.methods,
         // oxlint-disable-next-line unicorn/no-thenable -- awaiting a chain yields the command's value
         then: queued.then.bind(queued),
         expect: this.expectations,
      };
   }

   private withAnd(chain: QueuedChain<void>): QueuedAssertion {
      return { ...chain, and: this.expectations };
   }
}

/**
 * Wraps a started reader in a command queue. `queue.track` receives one settled promise
 * per command, and `queue.signal` skips every command not yet started once it aborts.
 *
 * @example
 *    await using sr = queueScreenReader(await screenReader({ html }));
 *    sr.next('button').expect.cursorOn({ role: 'button', name: 'Pay' });
 */
export function queueScreenReader(
   reader: ScreenReader,
   queue: CommandQueueOptions = {},
): QueuedScreenReader {
   const commands = new CommandQueue(queue);
   const chains = new ChainFactory(reader, commands);
   const stop = async (): Promise<void> => {
      try {
         await commands.drain();
      } finally {
         await reader.stop();
      }
   };
   return {
      ...chains.methods,
      get session(): ScreenReaderSession {
         return reader.session;
      },
      reader,
      expect: chains.expectations,
      drain: (): Promise<void> => commands.drain(),
      stop,
      [Symbol.asyncDispose]: stop,
   };
}

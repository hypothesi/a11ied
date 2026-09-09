/** A queued command. Awaiting it runs every command queued before it, then this one. */
export type Queued<Value> = PromiseLike<Value>;

export interface CommandQueueOptions {
   /**
    * Receives one promise per command. It resolves when the command passes or when its
    * failure went to an await, and rejects only when the failure went to no await. A
    * rejection handler is already attached, so it never raises an unhandled rejection.
    */
   track?: ((settled: Promise<void>) => void) | undefined;
   /** Once it aborts, every command not yet started rejects with `signal.reason`. */
   signal?: AbortSignal | undefined;
}

interface Command<Value> {
   readonly run: () => Promise<Value>;
   readonly callSite: Error;
   /** Whether test code called `then` on the command before it settled. */
   observed: boolean;
   /** Whether this command's own failure is the one that stopped the queue. */
   ownsFailure: boolean;
}

function noop(): void {
   // Attached to internal promises so a rejection never goes unhandled.
}

/**
 * Rewrites `stack` so it starts at the test line that queued the command, and keeps the
 * original stack on `cause`. Vitest builds its code frame from the first frame of
 * `stack`.
 */
function attachCallSite(error: unknown, callSite: Error): unknown {
   if (!(error instanceof Error)) {
      return error;
   }
   const frames = (callSite.stack ?? '').split('\n').slice(1).join('\n');
   if (error.cause === undefined) {
      error.cause = error.stack;
   }
   error.stack = `${error.name}: ${error.message}\n${frames}`;
   return error;
}

/**
 * Runs commands one at a time, in the order they were queued. Awaiting a command runs
 * every command queued before it. A failure that no await observed stops the queue: every
 * later command rejects with the same error, and `drain` rejects with it unless `track`
 * already received it.
 */
export class CommandQueue {
   private readonly options: CommandQueueOptions;
   private tail: Promise<void> = Promise.resolve();
   private failure: { error: unknown } | undefined;

   constructor(options: CommandQueueOptions = {}) {
      this.options = options;
   }

   /** Appends `run` and returns a thenable for its value. `callSite` supplies the stack. */
   enqueue<Value>(run: () => Promise<Value>, callSite: Error): Queued<Value> {
      const command: Command<Value> = {
         run,
         callSite,
         observed: false,
         ownsFailure: false,
      };
      const result = this.tail.then(() => this.execute(command));
      this.tail = result.then(noop, noop);
      this.report(result, command);
      return {
         // The thenable is the design. Awaiting it runs the queue up to this command.
         // Unawaited calls still run. `then` records which of the two happened.
         // oxlint-disable-next-line unicorn/no-thenable
         then: (onFulfilled, onRejected) => {
            command.observed = true;
            return result.then(onFulfilled, onRejected);
         },
      };
   }

   /**
    * Waits for every queued command. Rejects with the first failure nobody awaited,
    * unless `track` already received it.
    */
   async drain(): Promise<void> {
      await this.tail;
      if (this.failure !== undefined && this.options.track === undefined) {
         throw this.failure.error;
      }
   }

   private async execute<Value>(command: Command<Value>): Promise<Value> {
      if (this.failure !== undefined) {
         throw this.failure.error;
      }
      this.options.signal?.throwIfAborted();
      try {
         return await command.run();
      } catch (error) {
         throw this.fail(attachCallSite(error, command.callSite), command);
      }
   }

   private fail(error: unknown, command: Command<unknown>): unknown {
      if (!command.observed && this.failure === undefined) {
         this.failure = { error };
         command.ownsFailure = true;
      }
      return error;
   }

   private report(result: Promise<unknown>, command: Command<unknown>): void {
      const settled = result.then(noop, (error: unknown) => {
         if (command.ownsFailure) {
            throw error;
         }
      });
      settled.catch(noop);
      this.options.track?.(settled);
   }
}

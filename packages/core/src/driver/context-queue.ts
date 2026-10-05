import { CliEnvironmentError } from '../errors/cli-errors.js';
import type { ActionContext } from './broker-types.js';
import { CommandQueue } from './command-queue.js';

const contextQueues = new WeakMap<ActionContext, CommandQueue>();
const contextShutdowns = new WeakMap<ActionContext, Promise<void>>();
const contextStops = new WeakMap<ActionContext, AbortController>();

/** Preserve the original failure when cleanup also fails. */
export async function cleanupAfterError(
   cleanup: () => Promise<unknown>,
   error: unknown,
): Promise<never> {
   const [result] = await Promise.allSettled([Promise.resolve().then(cleanup)]);
   if (result?.status === 'rejected') {
      throw new AggregateError(
         [error, result.reason],
         'The operation failed and cleanup could not complete.',
         { cause: error },
      );
   }
   throw error;
}

function createStoppingError(): CliEnvironmentError {
   return new CliEnvironmentError(
      'session-stopping',
      'The driver session is stopping. Start a new session.',
   );
}

/** Cancel timers as soon as teardown is requested, without occupying the input queue. */
export function getContextStopSignal(context: ActionContext): AbortSignal {
   let controller = contextStops.get(context);
   if (!controller) {
      controller = new AbortController();
      contextStops.set(context, controller);
   }
   if (context.stopping && !controller.signal.aborted) {
      controller.abort(createStoppingError());
   }
   return controller.signal;
}

async function enqueueContextCommand<TResult>(
   context: ActionContext,
   run: () => Promise<TResult>,
): Promise<TResult> {
   let queue = contextQueues.get(context);
   if (!queue) {
      queue = new CommandQueue();
      contextQueues.set(context, queue);
   }
   return await queue.enqueue(run, new Error('The driver request was queued here.'));
}

/** Serialize clients and reject work that reaches a stopping session. */
export async function withContextCommand<TResult>(
   context: ActionContext,
   run: () => Promise<TResult>,
   allowStopping = false,
): Promise<TResult> {
   return enqueueContextCommand(context, async () => {
      if (context.stopping && !allowStopping) {
         throw createStoppingError();
      }
      return run();
   });
}

/** Block new input immediately and finish teardown after any running request. */
export function closeContext(
   context: ActionContext,
   stop: () => Promise<void> = () => context.adapter.stop(),
): Promise<void> {
   context.stopping = true;
   getContextStopSignal(context);
   const pending = contextShutdowns.get(context);
   if (pending) {
      return pending;
   }
   const shutdown = enqueueContextCommand(context, stop).catch((error: unknown) => {
      contextShutdowns.delete(context);
      throw error;
   });
   contextShutdowns.set(context, shutdown);
   return shutdown;
}

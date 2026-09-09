import { describe, expect, it } from 'vitest';

import { CommandQueue, type CommandQueueOptions } from './command-queue.js';

const EXIT_CODE = 4;

class DetailedError extends Error {
   readonly exitCode = EXIT_CODE;

   constructor(message: string) {
      super(message);
      this.name = 'DetailedError';
   }
}

function callSite(): Error {
   return new Error('call site');
}

function tick(): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 0);
   });
}

async function failureOf(queued: PromiseLike<unknown>): Promise<unknown> {
   try {
      await queued;
      return undefined;
   } catch (error) {
      return error;
   }
}

function failing(message: string): () => Promise<never> {
   return async () => {
      await tick();
      throw new Error(message);
   };
}

function recording(order: string[], label: string): () => Promise<void> {
   return async () => {
      await tick();
      order.push(label);
   };
}

function ignore(): void {
   // A `track` function that keeps nothing.
}

function collecting(settled: Promise<void>[]): CommandQueueOptions {
   return {
      track: (promise): void => {
         settled.push(promise);
      },
   };
}

describe('CommandQueue order', () => {
   it('runs commands one at a time in the order they were queued', async () => {
      const order: string[] = [],
         queue = new CommandQueue();

      queue.enqueue(recording(order, 'first'), callSite());
      queue.enqueue(recording(order, 'second'), callSite());
      await queue.drain();

      expect(order).toEqual(['first', 'second']);
   });

   it('runs everything queued before an awaited command and yields its value', async () => {
      const order: string[] = [],
         queue = new CommandQueue();

      queue.enqueue(recording(order, 'first'), callSite());
      const value = await queue.enqueue(async () => {
         order.push('second');
         return 'value';
      }, callSite());

      expect(value).toBe('value');
      expect(order).toEqual(['first', 'second']);
   });
});

describe('CommandQueue failures', () => {
   it('delivers an awaited failure to that await and continues with the next command', async () => {
      const order: string[] = [],
         queue = new CommandQueue();

      await expect(queue.enqueue(failing('boom'), callSite())).rejects.toThrow('boom');
      queue.enqueue(recording(order, 'after'), callSite());
      await queue.drain();

      expect(order).toEqual(['after']);
   });

   it('skips every later command after a failure nobody awaited and rejects drain', async () => {
      const order: string[] = [],
         queue = new CommandQueue();

      queue.enqueue(failing('boom'), callSite());
      const later = queue.enqueue(recording(order, 'later'), callSite());

      await expect(queue.drain()).rejects.toThrow('boom');
      await expect(failureOf(later)).resolves.toMatchObject({ message: 'boom' });
      expect(order).toEqual([]);
   });
});

describe('CommandQueue errors', () => {
   it('keeps the error object and its fields and starts the stack at the call site', async () => {
      const queue = new CommandQueue(),
         site = callSite();
      site.stack = 'Error: call site\n    at combobox.test.ts:12:7';

      const failure = await failureOf(
         queue.enqueue(async () => {
            throw new DetailedError('not announced');
         }, site),
      );

      expect(failure).toBeInstanceOf(DetailedError);
      if (!(failure instanceof DetailedError)) {
         return;
      }
      expect(failure.exitCode).toBe(EXIT_CODE);
      expect(failure.stack).toBe(
         'DetailedError: not announced\n    at combobox.test.ts:12:7',
      );
      expect(failure.cause).toMatch(/not announced\n {4}at /u);
   });

   it('raises no unhandled rejection, with or without track', async () => {
      const seen: unknown[] = [];
      const listener = (reason: unknown): void => {
         seen.push(reason);
      };
      process.on('unhandledRejection', listener);
      try {
         const tracked = new CommandQueue({ track: ignore }),
            untracked = new CommandQueue();
         tracked.enqueue(failing('tracked'), callSite());
         tracked.enqueue(recording([], 'skipped'), callSite());
         untracked.enqueue(failing('untracked'), callSite());
         await tracked.drain();
         await expect(untracked.drain()).rejects.toThrow('untracked');
         await tick();
         await tick();
      } finally {
         process.off('unhandledRejection', listener);
      }

      expect(seen).toEqual([]);
   });
});

describe('CommandQueue with track', () => {
   it('hands track one promise per command that resolves on success and on an awaited failure', async () => {
      const settled: Promise<void>[] = [];
      const queue = new CommandQueue(collecting(settled));

      queue.enqueue(recording([], 'ok'), callSite());
      await expect(queue.enqueue(failing('boom'), callSite())).rejects.toThrow('boom');

      expect(settled).toEqual([expect.any(Promise), expect.any(Promise)]);
      await expect(Promise.all(settled)).resolves.toEqual([undefined, undefined]);
   });

   it('hands track a promise that rejects on a failure nobody awaited, and drain resolves', async () => {
      const settled: Promise<void>[] = [];
      const queue = new CommandQueue(collecting(settled));

      queue.enqueue(failing('boom'), callSite());
      queue.enqueue(recording([], 'skipped'), callSite());
      await queue.drain();

      expect(settled).toEqual([expect.any(Promise), expect.any(Promise)]);
      await expect(settled[0]).rejects.toThrow('boom');
      await expect(settled[1]).resolves.toBeUndefined();
   });
});

describe('CommandQueue with signal', () => {
   it('skips every command not yet started once the signal aborts', async () => {
      const controller = new AbortController(),
         order: string[] = [],
         queue = new CommandQueue({ signal: controller.signal });

      queue.enqueue(async () => {
         await tick();
         controller.abort(new Error('timed out'));
         order.push('running');
      }, callSite());
      const pending = queue.enqueue(recording(order, 'pending'), callSite());

      await expect(failureOf(pending)).resolves.toMatchObject({ message: 'timed out' });
      await queue.drain();
      expect(order).toEqual(['running']);
   });
});

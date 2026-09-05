/**
 * Runs one async step per item, in order, waiting for each before the next. Screen reader
 * commands are stateful, so they can never be run concurrently.
 */
export async function runInOrder<TItem>(
   items: readonly TItem[],
   run: (item: TItem, index: number) => Promise<void>,
   index = 0,
): Promise<void> {
   const item = items[index];
   if (index >= items.length || item === undefined) {
      return;
   }
   await run(item, index);
   return runInOrder(items, run, index + 1);
}

/**
 * Repeats one async step until it reports it is done or the cap is reached. Returns true
 * when the step finished on its own.
 */
export async function repeatUntil(
   isDone: () => Promise<boolean>,
   step: () => Promise<void>,
   cap: number,
): Promise<boolean> {
   if (await isDone()) {
      return true;
   }
   if (cap <= 0) {
      return false;
   }
   await step();
   return repeatUntil(isDone, step, cap - 1);
}

/** Resolves after the given delay. */
export function delay(ms: number): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

/** Swallows one rejection; used where a teardown failure must not mask the real error. */
export function ignoreError(): undefined {
   return undefined;
}

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_PACE_MS = 0;

interface WorkerInput<TItem, TResult> {
   items: readonly TItem[];
   results: TResult[];
   worker: (item: TItem) => Promise<TResult>;
   cursor: { next: number };
   paceMs: number;
}

function sleep(delayMs: number): Promise<void> {
   return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
   });
}

/**
 * Claims the next queued item and processes it, then claims the next one after that.
 * Recursing (rather than looping) keeps each lane's `await` out of a loop body, which
 * both reads clearly as "take one, then the next" and satisfies the no-await-in-loop lint
 * rule without collecting promises we would just await in order anyway.
 */
async function runLane<TItem, TResult>(
   input: WorkerInput<TItem, TResult>,
): Promise<void> {
   const index = input.cursor.next;
   if (index >= input.items.length) {
      return;
   }
   input.cursor.next = index + 1;

   const item = input.items[index] as TItem;
   input.results[index] = await input.worker(item);
   if (input.paceMs > 0) {
      await sleep(input.paceMs);
   }
   await runLane(input);
}

/**
 * Runs `worker` over `items` with at most `concurrency` requests in flight at once, so a
 * bulk fetch of many small documents does not hammer the upstream host. `paceMs`, when
 * given, spaces each lane's requests that far apart even when every one succeeds, for a
 * host that rate-limits on request volume rather than only on concurrency. Results come
 * back in the same order as `items`.
 */
export async function mapWithConcurrency<TItem, TResult>(
   items: readonly TItem[],
   worker: (item: TItem) => Promise<TResult>,
   options?: { concurrency?: number; paceMs?: number },
): Promise<TResult[]> {
   const results: TResult[] = Array.from({ length: items.length });
   const cursor = { next: 0 };
   const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
   const paceMs = options?.paceMs ?? DEFAULT_PACE_MS;
   const laneCount = Math.min(concurrency, items.length);

   await Promise.all(
      Array.from({ length: laneCount }, () =>
         runLane({ items, results, worker, cursor, paceMs }),
      ),
   );

   return results;
}

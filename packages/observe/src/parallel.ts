/**
 * Maps over `items` with bounded concurrency while preserving the exact input order of
 * the returned array.
 *
 * - At most `concurrency` workers run at once; fewer run when the input is shorter.
 * - Results are written to `results[index]`, so the returned array always reflects the
 *   original input order regardless of which worker finishes first.
 *
 * Throws a `RangeError` if `concurrency` is not a positive integer.
 */
export async function mapWithConcurrency<TInput, TResult>(
   items: readonly TInput[],
   concurrency: number,
   worker: (item: TInput, index: number) => Promise<TResult>,
): Promise<TResult[]> {
   if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError('concurrency must be a positive integer');
   }

   const results = Array.from<TResult>({ length: items.length });
   let nextIndex = 0;
   const workerCount = Math.min(concurrency, items.length);

   async function run(): Promise<void> {
      while (true) {
         const index = nextIndex;
         nextIndex += 1;

         const item = items[index];
         if (index >= items.length || item === undefined) {
            return;
         }

         // oxlint-disable-next-line no-await-in-loop -- bounded workers must await each pulled target in sequence
         results[index] = await worker(item, index);
      }
   }

   const workers: Promise<void>[] = [];
   for (let slot = 0; slot < workerCount; slot += 1) {
      workers.push(run());
   }
   await Promise.all(workers);

   return results;
}

import type { ObservationBundle, StateSetupAction } from '@a11ied/contracts';

/**
 * Maximum number of targets observed in parallel by default (`P1-13`). Overridden via the
 * `concurrency` option or the `--concurrency` CLI flag.
 */
export const DEFAULT_OBSERVATION_CONCURRENCY = 4;

/** Input target to observe in parallel: one (URL, state setup) pair per entry. */
export interface ObserveTargetInput {
   targetUrl: string;
   stateId?: string;
   setup?: readonly StateSetupAction[];
}

/** Options for {@link observeTargetsInParallel}. */
export interface ParallelObserveOptions<
   TInput = ObserveTargetInput,
   TResult = ObservationBundle,
> {
   concurrency?: number;
   observeTarget: (target: TInput, index: number) => Promise<TResult>;
}

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

/**
 * Observe every target in `targets` in bounded parallel batches, preserving input order
 * in the returned array. Defaults `concurrency` to
 * {@link DEFAULT_OBSERVATION_CONCURRENCY}.
 */
export async function observeTargetsInParallel<
   TInput = ObserveTargetInput,
   TResult = ObservationBundle,
>(
   targets: readonly TInput[],
   options: ParallelObserveOptions<TInput, TResult>,
): Promise<TResult[]> {
   return mapWithConcurrency(
      targets,
      options.concurrency ?? DEFAULT_OBSERVATION_CONCURRENCY,
      options.observeTarget,
   );
}

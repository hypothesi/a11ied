/** Resolves after `ms` milliseconds. */
export function delay(ms: number): Promise<void> {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

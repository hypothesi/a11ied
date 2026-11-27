let lastElementNumber = 0;

/**
 * Astro has no `useId`, so components that render more than once per page share this
 * counter.
 */
export function createElementID(prefix: string): string {
   lastElementNumber += 1;

   return `${prefix}-${String(lastElementNumber)}`;
}

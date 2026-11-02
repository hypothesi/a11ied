import type { Platform } from '@a11ied/contracts';

/** Actions that step up to `payload.max` times, so their time budget scales with it. */
export const LOOP_ACTIONS: ReadonlySet<string> = new Set([
   'elements',
   'read-all',
   'goto',
]);

const REAL_TARGET_LOOP_STEP_MS = 1500;
const VIRTUAL_LOOP_STEP_MS = 50;

/**
 * How long a bounded loop may run before it returns what it has. The client waits this
 * long plus its base timeout, so the broker answers before the client gives up on it.
 */
export function resolveLoopBudgetMs(target: Platform, max: number): number {
   const isReal = target === 'voiceover' || target === 'nvda';
   return max * (isReal ? REAL_TARGET_LOOP_STEP_MS : VIRTUAL_LOOP_STEP_MS);
}

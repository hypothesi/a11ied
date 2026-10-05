import { ERR_VOICE_OVER_NOT_RUNNING } from '@guidepup/guidepup/lib/macOS/errors.js';
import { ERR_NVDA_NOT_RUNNING } from '@guidepup/guidepup/lib/windows/errors.js';
import {
   nativeInputPolicySchema,
   type NativeInputPolicy,
   type DriverFocusTarget,
} from '@a11ied/contracts';

import { acquireDesktopLease, type DesktopLease } from './desktop-lease.js';
import { DriverCommandError } from './driver-command-error.js';
import type { ScreenReaderLike } from './readiness.js';
import { isRealReaderStopped } from './reader-status.js';
import type { RealTarget } from './real-steps.js';
import { ignoreError, runInOrder } from './sequential.js';
import { observeNativeInputTarget } from './native-input-target.js';
import { waitForWindowFocus } from './window-focus.js';

const INPUT_METHODS = new Set([
   'next',
   'previous',
   'nextHeading',
   'previousHeading',
   'nextLink',
   'previousLink',
   'nextLandmark',
   'previousLandmark',
   'press',
   'type',
   'perform',
   'act',
   'interact',
   'stopInteracting',
   'takeCursorScreenshot',
]);

interface ReaderLifecycle {
   target: RealTarget;
   nativeInput: NativeInputPolicy;
   lease: DesktopLease | undefined;
   tail: Promise<void>;
   closing: boolean;
   stopped: boolean;
   shutdown: Promise<void> | undefined;
   starting: Promise<unknown> | undefined;
   focusTarget?: DriverFocusTarget | undefined;
}
const lifecycles = new WeakMap<ScreenReaderLike, ReaderLifecycle>();

async function assertInputOwnership(state: ReaderLifecycle): Promise<void> {
   if (state.closing || !state.lease) {
      throw new DriverCommandError(
         'reader-session-inactive',
         'This real-reader session is inactive or stopping. Start a new session before sending input.',
         {},
      );
   }
   await state.starting;
   if (state.closing) {
      throw new DriverCommandError(
         'reader-session-inactive',
         'The real-reader session is stopping. Input was refused.',
         {},
      );
   }
   await state.lease.assertOwned();
}

function enqueueInput<TResult>(
   state: ReaderLifecycle,
   run: () => Promise<TResult>,
): Promise<TResult> {
   const pending = state.tail.then(async () => {
      await assertInputOwnership(state);
      return run();
   });
   state.tail = pending.then(ignoreError, ignoreError);
   return pending;
}

async function stopNativeReader(
   target: RealTarget,
   run: () => Promise<unknown>,
): Promise<void> {
   try {
      await run();
   } catch (error) {
      const message =
         target === 'voiceover' ? ERR_VOICE_OVER_NOT_RUNNING : ERR_NVDA_NOT_RUNNING;
      if (!(error instanceof Error && error.message === message)) {
         throw error;
      }
   }
   if (!(await isRealReaderStopped(target))) {
      throw new DriverCommandError(
         'reader-stop-unconfirmed',
         'The reader process has not been confirmed stopped. Input remains blocked; retry stopping the session.',
         {},
      );
   }
}

async function finishReader(
   state: ReaderLifecycle,
   run: () => Promise<unknown>,
): Promise<void> {
   await state.starting?.catch(ignoreError);
   await state.tail;
   const lease = state.lease;
   if (!lease) {
      return;
   }
   await lease.assertOwned();
   if (!state.stopped) {
      await stopNativeReader(state.target, run);
      state.stopped = true;
   }
   await lease.release();
   state.lease = undefined;
}

function stopReader(state: ReaderLifecycle, run: () => Promise<unknown>): Promise<void> {
   state.closing = true;
   state.shutdown ??= finishReader(state, run).catch((error: unknown) => {
      state.shutdown = undefined;
      throw error;
   });
   return state.shutdown;
}

async function beginReader(
   state: ReaderLifecycle,
   run: () => Promise<unknown>,
): Promise<unknown> {
   state.lease = await acquireDesktopLease();
   if (state.closing) {
      throw new DriverCommandError(
         'reader-start-cancelled',
         'Reader startup was cancelled by a stop request.',
         {},
      );
   }
   state.stopped = false;
   const result = await run();
   state.focusTarget = undefined;
   if (state.nativeInput === 'guarded') {
      state.focusTarget = await observeNativeInputTarget().catch(ignoreError);
   }
   return result;
}

async function startReader(
   state: ReaderLifecycle,
   reader: ScreenReaderLike,
   run: () => Promise<unknown>,
): Promise<unknown> {
   if (state.lease || state.starting) {
      throw new DriverCommandError(
         'reader-already-started',
         'Stop this real-reader session before starting it again.',
         {},
      );
   }
   state.closing = false;
   state.stopped = true;
   state.shutdown = undefined;
   state.starting = beginReader(state, run);
   return state.starting
      .catch(async (error: unknown) => {
         await stopReader(state, () => reader.stop()).catch(ignoreError);
         throw error;
      })
      .finally(() => {
         state.starting = undefined;
      });
}

function getNativeOptions(options: unknown): { retries: number } {
   return typeof options === 'object' && options !== null
      ? { ...options, retries: 1 }
      : { retries: 1 };
}

async function assertNativeInputTarget(state: ReaderLifecycle): Promise<void> {
   if (!state.focusTarget) {
      await observeNativeInputTarget();
      throw new DriverCommandError(
         'native-target-unavailable',
         'No intended target was observed. Focus the intended target before sending input.',
         {},
      );
   }
   await observeNativeInputTarget(state.focusTarget);
}

async function runGuardedInput(
   state: ReaderLifecycle,
   input: {
      method: string;
      args: unknown[];
      run: (input: unknown[]) => Promise<unknown>;
   },
): Promise<unknown> {
   const { method, args, run } = input;
   if (method !== 'type' || typeof args[0] !== 'string') {
      await assertNativeInputTarget(state);
      const optionIndex = method === 'press' || method === 'perform' ? 1 : 0;
      const nativeOptions = getNativeOptions(args[optionIndex]);
      return run([...args.slice(0, optionIndex), nativeOptions]);
   }
   const characters = [...args[0]],
      nativeOptions = getNativeOptions(args[1]);
   let charactersCompleted = 0;
   try {
      await runInOrder(characters, async (character) => {
         await assertInputOwnership(state);
         await assertNativeInputTarget(state);
         await run([
            character,
            {
               ...nativeOptions,
               capture: charactersCompleted === characters.length - 1 ? 'initial' : false,
            },
         ]);
         charactersCompleted += 1;
      });
   } catch (error) {
      if (error instanceof DriverCommandError) {
         throw new DriverCommandError(error.code, error.message, {
            ...error.details,
            charactersCompleted,
         });
      }
      throw new DriverCommandError(
         'native-delivery-uncertain',
         'Native typing failed. Some input may have arrived; inspect the control before continuing.',
         {
            charactersCompleted,
            reason: error instanceof Error ? error.message : String(error),
         },
      );
   }
}

/** Enforce ownership for every upstream input, including commands inside navigation loops. */
export function createLeasedReader(
   reader: ScreenReaderLike,
   readerTarget: RealTarget,
   nativeInput: NativeInputPolicy = 'guarded',
): ScreenReaderLike {
   const state: ReaderLifecycle = {
      target: readerTarget,
      nativeInput: nativeInputPolicySchema.parse(nativeInput),
      lease: undefined,
      tail: Promise.resolve(),
      closing: true,
      stopped: true,
      shutdown: undefined,
      starting: undefined,
   };
   const leased = new Proxy(reader, {
      get(target, key): unknown {
         const value: unknown = Reflect.get(target, key);
         if (typeof value !== 'function') {
            return value;
         }
         const run = async (args: unknown[]): Promise<unknown> =>
            Reflect.apply(value, target, args);
         if (key === 'start') {
            return (...args: unknown[]) => startReader(state, reader, () => run(args));
         }
         if (key === 'stop') {
            return (...args: unknown[]) => stopReader(state, () => run(args));
         }
         if (typeof key === 'string' && INPUT_METHODS.has(key)) {
            return (...args: unknown[]) =>
               enqueueInput(state, async () => {
                  if (
                     key !== 'takeCursorScreenshot' &&
                     state.nativeInput === 'require-binding'
                  ) {
                     throw new DriverCommandError(
                        'native-target-binding-unavailable',
                        `${state.target} cannot verify native document and reader-cursor binding. No input was sent.`,
                        {
                           target: state.target,
                           method: key,
                           nativeInput: state.nativeInput,
                        },
                     );
                  }
                  if (key !== 'takeCursorScreenshot' && state.nativeInput === 'guarded') {
                     return runGuardedInput(state, { method: key, args, run });
                  }
                  return run(args);
               });
         }
         return value.bind(target);
      },
   });
   lifecycles.set(leased, state);
   return leased;
}

/** An explicit successful focus operation establishes the next intended target. */
export async function setReaderFocusTarget(
   reader: ScreenReaderLike,
   target: DriverFocusTarget,
): Promise<void> {
   const state = lifecycles.get(reader);
   if (state?.nativeInput === 'guarded') {
      await waitForWindowFocus(target);
      state.focusTarget = await observeNativeInputTarget(target);
   }
}

/** Serialize OS focus actions with reader input and teardown under the same lease. */
export async function withReaderOwnership<TResult>(
   reader: ScreenReaderLike,
   run: () => Promise<TResult>,
): Promise<TResult> {
   const state = lifecycles.get(reader);
   if (!state) {
      throw new DriverCommandError(
         'reader-session-inactive',
         'No desktop ownership lease is attached to this reader.',
         {},
      );
   }
   return enqueueInput(state, run);
}

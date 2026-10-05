import { nvda, voiceOver } from './upstream.js';
import type {
   DriverCheckpoint,
   DriverCurrentItem,
   DriverFocusResult,
   DriverFocusTarget,
   DriverNavigateRequest,
   DriverPerformPayload,
   DriverReadiness,
   DriverStateSnapshot,
   DriverTableMove,
   Platform,
   PortableDriverVerb,
   NativeInputPolicy,
} from '@a11ied/contracts';

import { DriverCommandError } from './driver-command-error.js';
import { readNativeState } from './native-observations.js';
import { parseNvdaItem, parseVoiceOverItem } from './current-item.js';
import { focusMacTarget, focusWindowsTarget } from './focus.js';
import {
   createLeasedReader,
   setReaderFocusTarget,
   withReaderOwnership,
} from './leased-reader.js';
import {
   checkDetectedReadiness,
   createReadinessError,
   createUnsupportedReadiness,
   getExpectedPlatform,
   type ScreenReaderLike,
} from './readiness.js';
import {
   getDriverCapabilities,
   type DriverActionOptions,
   type DriverAdapter,
} from './adapter-shared.js';
import {
   parseDriverCommandSet,
   resolveDriverCommand,
   serializeResolvedDriverCommand,
   type DriverCommandSet,
} from './command-registry.js';
import { getPortableCommand } from './portable-commands.js';
import {
   buildCommandOptions,
   pressRealKeys,
   REAL_TARGET_INPUT_TIMEOUT_MS,
   runNvdaStep,
   runRealNavigation,
   runVoiceOverStep,
   type RealStepContext,
   type RealTarget,
} from './real-steps.js';
import { findRealText, moveInRealTable, readRealTitle } from './real-structure.js';
import { captureVoiceOverCursorScreenshot } from './screenshot.js';
import { ignoreError } from './sequential.js';
import { waitForSpeechStabilization } from './speech.js';
import {
   createVirtualAdapter,
   type VirtualCommandResolution,
} from './virtual-adapter.js';
import { createJsdomVirtualHost } from './virtual-dom.js';
import type { VirtualHost } from './virtual-host.js';

class RealScreenReaderAdapter implements DriverAdapter {
   readonly capabilities: DriverAdapter['capabilities'];
   readonly target: RealTarget;
   private readonly reader: ScreenReaderLike;

   constructor(
      target: RealTarget,
      reader: ScreenReaderLike,
      nativeInput: NativeInputPolicy,
   ) {
      this.target = target;
      this.capabilities = getDriverCapabilities(target, true, nativeInput);
      this.reader = createLeasedReader(reader, target, nativeInput);
   }

   private stepContext(options?: DriverActionOptions): RealStepContext {
      return { reader: this.reader, target: this.target, options };
   }

   async checkReadiness(): Promise<DriverReadiness> {
      const expectedPlatform = getExpectedPlatform(this.target);
      if (process.platform !== expectedPlatform) {
         return createUnsupportedReadiness(this.target, expectedPlatform);
      }

      try {
         return await checkDetectedReadiness(this.target, this.reader);
      } catch (error) {
         return createReadinessError(this.target, error);
      }
   }

   async start(): Promise<void> {
      await this.reader.start({ timeout: REAL_TARGET_INPUT_TIMEOUT_MS });
   }

   async stop(): Promise<void> {
      await this.reader.stop({ timeout: REAL_TARGET_INPUT_TIMEOUT_MS });
   }

   async runOwned<TResult>(run: () => Promise<TResult>): Promise<TResult> {
      return withReaderOwnership(this.reader, run);
   }

   async attachDocument(): Promise<void> {
      // Real screen readers read the live host window; the caller opens the page itself,
      // So the adapter only confirms its reader is still there.
      await this.reader.lastSpokenPhrase();
   }

   async focus(target: DriverFocusTarget): Promise<DriverFocusResult> {
      return withReaderOwnership(this.reader, async () => {
         const result =
            this.target === 'voiceover'
               ? await focusMacTarget(target)
               : await focusWindowsTarget(target);
         if (result.status === 'focused') {
            await setReaderFocusTarget(this.reader, target);
         }
         return result;
      });
   }

   async performPortable(
      verb: PortableDriverVerb,
      options?: DriverActionOptions,
   ): Promise<void> {
      const entry = getPortableCommand(verb);
      if (this.target === 'voiceover') {
         await runVoiceOverStep(this.stepContext(options), entry.voiceover);
         return;
      }
      await runNvdaStep(this.stepContext(options), entry.nvda);
   }

   async navigate(
      request: DriverNavigateRequest,
      options?: DriverActionOptions,
   ): Promise<{ moved?: boolean }> {
      await runRealNavigation(this.stepContext(options), request);
      return {};
   }

   async readCurrentItem(): Promise<{ item: DriverCurrentItem }> {
      const [phrase, itemText] = await Promise.all([
         this.reader.lastSpokenPhrase(),
         this.reader.itemText(),
      ]);
      const item =
         this.target === 'voiceover'
            ? parseVoiceOverItem(phrase, itemText)
            : parseNvdaItem(phrase, itemText);
      return { item };
   }

   async readTitle(
      options?: DriverActionOptions,
   ): Promise<{ title: string; source: string }> {
      return readRealTitle(this.stepContext(options));
   }

   async findText(
      text: string,
      options?: DriverActionOptions,
   ): Promise<{ found: boolean }> {
      return findRealText(this.stepContext(options), text);
   }

   async moveInTable(
      move: DriverTableMove,
      options?: DriverActionOptions,
   ): Promise<{ moved?: boolean; header?: string }> {
      return moveInRealTable(this.stepContext(options), move);
   }

   async captureCursorScreenshot(
      path: string,
      options?: DriverActionOptions,
   ): Promise<{ path: string; source: string }> {
      return captureVoiceOverCursorScreenshot(this.stepContext(options), path);
   }

   async press(keys: readonly string[], options?: DriverActionOptions): Promise<void> {
      await pressRealKeys(this.stepContext(options), keys);
   }

   async type(text: string, options?: DriverActionOptions): Promise<void> {
      await this.reader.type(
         text,
         buildCommandOptions(REAL_TARGET_INPUT_TIMEOUT_MS, options),
      );
   }

   async performCommand(
      command: DriverPerformPayload,
      options?: DriverActionOptions,
   ): Promise<ReturnType<typeof serializeResolvedDriverCommand>> {
      let commandSet: DriverCommandSet = 'auto';
      if (command.commandSet) {
         commandSet = parseDriverCommandSet(command.commandSet);
      }
      const resolved = resolveDriverCommand({
         target: this.target,
         command: command.command,
         commandSet,
      });
      if (resolved.portableNavigation) {
         await this.navigate(resolved.portableNavigation, options);
         return serializeResolvedDriverCommand(resolved);
      }
      if (resolved.portableAction) {
         await this.performPortable(resolved.portableAction, options);
         return serializeResolvedDriverCommand(resolved);
      }
      await this.reader.perform(
         resolved.command,
         buildCommandOptions(REAL_TARGET_INPUT_TIMEOUT_MS, options),
      );
      return serializeResolvedDriverCommand(resolved);
   }

   async readState(checkpoints: DriverCheckpoint[]): Promise<DriverStateSnapshot> {
      return readNativeState(this.reader, this.target, checkpoints);
   }

   async waitForSpeechStabilization(): Promise<void> {
      await waitForSpeechStabilization(this.reader);
   }
}

/** Resolves `sr do <name>` for the virtual target through the shared command registry. */
function resolveVirtualCommand(command: DriverPerformPayload): VirtualCommandResolution {
   let commandSet: DriverCommandSet = 'auto';
   if (command.commandSet) {
      commandSet = parseDriverCommandSet(command.commandSet);
   }
   const resolved = resolveDriverCommand({
      target: 'virtual',
      command: command.command,
      commandSet,
   });
   const resolution: VirtualCommandResolution = {
      command: serializeResolvedDriverCommand(resolved),
   };
   if (resolved.portableNavigation) {
      resolution.navigation = resolved.portableNavigation;
   }
   if (resolved.portableAction) {
      resolution.verb = resolved.portableAction;
   }
   return resolution;
}

export interface CreateDriverAdapterOptions {
   /** Where a virtual session runs; defaults to a jsdom document in this process. */
   virtualHost?: VirtualHost | undefined;
   /** Development permits unverified desktop input and cannot prove an audit result. */
   nativeInput?: NativeInputPolicy | undefined;
}

function serializeRealActions(adapter: RealScreenReaderAdapter): DriverAdapter {
   let closing = true,
      generation = 0,
      shutdown: Promise<unknown> | undefined = undefined,
      tail = Promise.resolve();
   return new Proxy(adapter, {
      get(instance, key): unknown {
         const value: unknown = Reflect.get(instance, key);
         if (typeof value !== 'function') {
            return value;
         }
         if (key === 'start') {
            return async (...args: unknown[]): Promise<unknown> => {
               const submitted = generation;
               await shutdown;
               if (submitted !== generation) {
                  throw new DriverCommandError(
                     'reader-start-cancelled',
                     'Reader startup was cancelled by a stop request.',
                     {},
                  );
               }
               closing = false;
               return Reflect.apply(value, instance, args);
            };
         }
         if (key === 'stop') {
            return (...args: unknown[]): Promise<unknown> => {
               closing = true;
               generation += 1;
               const stopped: Promise<unknown> = Reflect.apply(value, instance, args);
               shutdown = Promise.all([tail, stopped]);
               return shutdown;
            };
         }
         if (key === 'checkReadiness') {
            return value.bind(instance);
         }
         return (...args: unknown[]): Promise<unknown> => {
            const inactive = closing,
               pending = tail.then(() => {
                  if (inactive || closing) {
                     throw new DriverCommandError(
                        'reader-session-inactive',
                        'This real-reader session is inactive or stopping.',
                        {},
                     );
                  }
                  return Reflect.apply(value, instance, args);
               });
            tail = pending.then(ignoreError, ignoreError);
            return pending;
         };
      },
   });
}

/** Creates the adapter for one supported driver target. */
export function createDriverAdapter(
   target: Platform,
   options: CreateDriverAdapterOptions = {},
): DriverAdapter {
   if (target === 'virtual') {
      return createVirtualAdapter(options.virtualHost ?? createJsdomVirtualHost(), {
         resolveCommand: resolveVirtualCommand,
      });
   }
   if (target === 'voiceover') {
      return serializeRealActions(
         new RealScreenReaderAdapter(
            'voiceover',
            voiceOver,
            options.nativeInput ?? 'guarded',
         ),
      );
   }
   return serializeRealActions(
      new RealScreenReaderAdapter('nvda', nvda, options.nativeInput ?? 'guarded'),
   );
}

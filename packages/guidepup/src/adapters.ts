import { nvda, voiceOver } from '@guidepup/guidepup';
import {
   driverStateSnapshotSchema,
   type DriverCheckpoint,
   type DriverFocusResult,
   type DriverFocusTarget,
   type DriverPerformPayload,
   type DriverReadiness,
   type DriverStateSnapshot,
   type Platform,
   type PortableDriverVerb,
} from '@a11ied/contracts';

import { queryFocusedAxProperties } from './ax-properties-mac.js';
import { focusMacTarget, focusWindowsTarget } from './focus.js';
import {
   checkDetectedReadiness,
   createReadinessError,
   createUnsupportedReadiness,
   getExpectedPlatform,
   type ScreenReaderLike,
} from './readiness.js';
import {
   buildStateSnapshot,
   driverCapabilities,
   type DriverActionOptions,
   type DriverAdapter,
} from './adapter-shared.js';
import { normalizeDriverKeys } from './key-aliases.js';
import {
   parseDriverCommandSet,
   resolveDriverCommand,
   serializeResolvedDriverCommand,
   type DriverCommandSet,
} from './command-registry.js';
import {
   getNvdaKeyCodeCommand,
   getPortableCommand,
   getVoiceOverKeyCodeCommand,
   type NvdaPortableStep,
   type PortableReaderMethod,
   type VoiceOverPortableStep,
} from './portable-commands.js';
import { ignoreError, runInOrder } from './sequential.js';
import { waitForSpeechStabilization } from './speech.js';
import { createVirtualAdapter } from './virtual-adapter.js';

const REAL_TARGET_NAV_TIMEOUT_MS = 10_000;
const REAL_TARGET_INPUT_TIMEOUT_MS = 15_000;
const REAL_TARGET_RETRIES = 2;

type RealTarget = Extract<Platform, 'voiceover' | 'nvda'>;

function buildCommandOptions(
   defaultTimeoutMs: number,
   options?: DriverActionOptions,
): { timeout: number; retries: number } {
   return {
      timeout: options?.timeoutMs ?? defaultTimeoutMs,
      retries: REAL_TARGET_RETRIES,
   };
}

class RealScreenReaderAdapter implements DriverAdapter {
   readonly capabilities = driverCapabilities;
   readonly target: RealTarget;
   private readonly reader: ScreenReaderLike;

   constructor(target: RealTarget, reader: ScreenReaderLike) {
      this.target = target;
      this.reader = reader;
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

   async attachDocument(): Promise<void> {
      // Real screen readers read the live host window; the caller opens the page itself,
      // So the adapter only confirms its reader is still there.
      await this.reader.lastSpokenPhrase().catch(ignoreError);
   }

   async focus(target: DriverFocusTarget): Promise<DriverFocusResult> {
      if (this.target === 'voiceover') {
         return focusMacTarget(target);
      }
      return focusWindowsTarget(target);
   }

   async performPortable(
      verb: PortableDriverVerb,
      options?: DriverActionOptions,
   ): Promise<void> {
      const entry = getPortableCommand(verb);
      if (this.target === 'voiceover') {
         await this.runVoiceOverStep(entry.voiceover, options);
         return;
      }
      await this.runNvdaStep(entry.nvda, options);
   }

   private async runVoiceOverStep(
      step: VoiceOverPortableStep,
      options?: DriverActionOptions,
   ): Promise<void> {
      if (step.kind === 'keycode') {
         await this.reader.perform(
            getVoiceOverKeyCodeCommand(step),
            buildCommandOptions(REAL_TARGET_INPUT_TIMEOUT_MS, options),
         );
         return;
      }
      await this.runSharedStep(step, options);
   }

   private async runNvdaStep(
      step: NvdaPortableStep,
      options?: DriverActionOptions,
   ): Promise<void> {
      if (step.kind === 'keycode') {
         await this.reader.perform(
            getNvdaKeyCodeCommand(step),
            buildCommandOptions(REAL_TARGET_INPUT_TIMEOUT_MS, options),
         );
         return;
      }
      await this.runSharedStep(step, options);
   }

   private async runSharedStep(
      step:
         | { kind: 'method'; method: PortableReaderMethod }
         | { kind: 'press'; keys: string },
      options?: DriverActionOptions,
   ): Promise<void> {
      if (step.kind === 'press') {
         await this.press([step.keys], options);
         return;
      }
      const navOptions = buildCommandOptions(REAL_TARGET_NAV_TIMEOUT_MS, options);
      const methods: Record<PortableReaderMethod, () => Promise<void>> = {
         next: () => this.reader.next(navOptions),
         previous: () => this.reader.previous(navOptions),
         interact: () => this.reader.interact(navOptions),
         stopInteracting: () => this.reader.stopInteracting(navOptions),
         act: () => this.reader.act(navOptions),
      };
      await methods[step.method]();
   }

   async press(keys: readonly string[], options?: DriverActionOptions): Promise<void> {
      const inputOptions = buildCommandOptions(REAL_TARGET_INPUT_TIMEOUT_MS, options);
      await runInOrder(keys, (chord) =>
         this.reader.press(normalizeDriverKeys(chord, this.target), inputOptions),
      );
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
      if (this.target === 'voiceover') {
         const [snapshot, axFocusedElement] = await Promise.all([
            buildStateSnapshot(this.reader, checkpoints),
            queryFocusedAxProperties().catch(() => undefined as undefined),
         ]);
         return driverStateSnapshotSchema.parse({ ...snapshot, axFocusedElement });
      }
      return buildStateSnapshot(this.reader, checkpoints);
   }

   async waitForSpeechStabilization(): Promise<void> {
      await waitForSpeechStabilization(this.reader);
   }
}

/** Creates the adapter for one supported driver target. */
export function createDriverAdapter(target: Platform): DriverAdapter {
   if (target === 'virtual') {
      return createVirtualAdapter();
   }
   if (target === 'voiceover') {
      return new RealScreenReaderAdapter('voiceover', voiceOver);
   }
   return new RealScreenReaderAdapter('nvda', nvda);
}

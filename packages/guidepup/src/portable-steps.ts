import type {
   NVDAKeyCodeCommands,
   VoiceOverCommanderCommands,
   voiceOverKeyCodeCommands,
} from '@guidepup/guidepup';
import type { Virtual } from '@guidepup/virtual-screen-reader';

/** Guidepup screen reader methods a portable verb can map onto directly. */
export type PortableReaderMethod =
   | 'next'
   | 'previous'
   | 'interact'
   | 'stopInteracting'
   | 'act';

/** Guidepup structural jumps that VoiceOver and NVDA both implement as methods. */
export type ReaderNavigationMethod =
   | 'nextHeading'
   | 'previousHeading'
   | 'nextLink'
   | 'previousLink'
   | 'nextLandmark'
   | 'previousLandmark';

/** The names under `virtual.commands`, such as `moveToNextHeadingLevel2`. */
export type VirtualCommandName = keyof Virtual['commands'];

export interface MethodStep {
   kind: 'method';
   method: PortableReaderMethod | ReaderNavigationMethod;
}

export interface PressStep {
   kind: 'press';
   keys: string;
}

export interface VoiceOverKeyCodeStep {
   kind: 'keycode';
   command: keyof typeof voiceOverKeyCodeCommands;
}

export interface VoiceOverCommanderStep {
   kind: 'commander';
   command: VoiceOverCommanderCommands;
}

export interface NvdaKeyCodeStep {
   kind: 'keycode';
   command: keyof typeof NVDAKeyCodeCommands;
}

/** Repeats `step` until the phrase contains `phraseIncludes` or the reader stops moving. */
export interface RepeatUntilPhraseStep<TStep> {
   kind: 'repeat-until';
   step: TStep;
   phraseIncludes: string;
}

export interface VirtualWalkStep {
   kind: 'walk';
   edge: 'top' | 'bottom';
}

export interface VirtualCommandStep {
   kind: 'command';
   command: VirtualCommandName;
}

/** Moves item by item until the phrase starts with one of `roles`, in `direction`. */
export interface VirtualRoleWalkStep {
   kind: 'role-walk';
   direction: 'next' | 'previous';
   roles: readonly string[];
}

export type VoiceOverPortableStep =
   | MethodStep
   | PressStep
   | VoiceOverKeyCodeStep
   | VoiceOverCommanderStep;
export type NvdaPortableStep = MethodStep | PressStep | NvdaKeyCodeStep;
export type VirtualPortableStep =
   | MethodStep
   | PressStep
   | VirtualWalkStep
   | VirtualCommandStep
   | VirtualRoleWalkStep;

export function methodStep(method: MethodStep['method']): MethodStep {
   return { kind: 'method', method };
}

export function pressStep(keys: string): PressStep {
   return { kind: 'press', keys };
}

export function voiceOverKeyCodeStep(
   command: VoiceOverKeyCodeStep['command'],
): VoiceOverKeyCodeStep {
   return { kind: 'keycode', command };
}

export function voiceOverCommanderStep(
   command: VoiceOverCommanderCommands,
): VoiceOverCommanderStep {
   return { kind: 'commander', command };
}

export function nvdaKeyCodeStep(command: NvdaKeyCodeStep['command']): NvdaKeyCodeStep {
   return { kind: 'keycode', command };
}

export function virtualCommandStep(command: VirtualCommandName): VirtualCommandStep {
   return { kind: 'command', command };
}

export function virtualRoleWalkStep(
   direction: VirtualRoleWalkStep['direction'],
   roles: readonly string[],
): VirtualRoleWalkStep {
   return { kind: 'role-walk', direction, roles };
}

import type { PortableDriverVerb } from '@a11ied/contracts';
import { NVDAKeyCodeCommands, voiceOverKeyCodeCommands } from '@guidepup/guidepup';

/** Guidepup screen reader methods a portable verb can map onto directly. */
export type PortableReaderMethod =
   | 'next'
   | 'previous'
   | 'interact'
   | 'stopInteracting'
   | 'act';

interface MethodStep {
   kind: 'method';
   method: PortableReaderMethod;
}

interface PressStep {
   kind: 'press';
   keys: string;
}

interface VoiceOverKeyCodeStep {
   kind: 'keycode';
   command: keyof typeof voiceOverKeyCodeCommands;
}

interface NvdaKeyCodeStep {
   kind: 'keycode';
   command: keyof typeof NVDAKeyCodeCommands;
}

interface VirtualWalkStep {
   kind: 'walk';
   edge: 'top' | 'bottom';
}

export type VoiceOverPortableStep = MethodStep | PressStep | VoiceOverKeyCodeStep;
export type NvdaPortableStep = MethodStep | PressStep | NvdaKeyCodeStep;
export type VirtualPortableStep = MethodStep | PressStep | VirtualWalkStep;

export interface PortableCommandEntry {
   verb: PortableDriverVerb;
   description: string;
   voiceover: VoiceOverPortableStep;
   nvda: NvdaPortableStep;
   virtual: VirtualPortableStep;
}

function methodStep(method: PortableReaderMethod): MethodStep {
   return { kind: 'method', method };
}

function pressStep(keys: string): PressStep {
   return { kind: 'press', keys };
}

/**
 * The one table every portable verb routes through. `sr next`, `sr do next`, and the MCP
 * `next` action all resolve here, so each target behaves the same way for a given verb.
 */
export const portableCommandTable: readonly PortableCommandEntry[] = [
   {
      verb: 'next',
      description: 'Move to the next item.',
      voiceover: methodStep('next'),
      nvda: methodStep('next'),
      virtual: methodStep('next'),
   },
   {
      verb: 'previous',
      description: 'Move to the previous item.',
      voiceover: methodStep('previous'),
      nvda: methodStep('previous'),
      virtual: methodStep('previous'),
   },
   {
      verb: 'interact',
      description: 'Enter interaction mode for the current group or control.',
      voiceover: methodStep('interact'),
      nvda: methodStep('interact'),
      virtual: methodStep('interact'),
   },
   {
      verb: 'stop-interacting',
      description: 'Leave interaction mode.',
      voiceover: methodStep('stopInteracting'),
      nvda: methodStep('stopInteracting'),
      virtual: methodStep('stopInteracting'),
   },
   {
      verb: 'activate',
      description: 'Activate the current item.',
      voiceover: methodStep('act'),
      nvda: methodStep('act'),
      virtual: methodStep('act'),
   },
   {
      verb: 'top',
      description: 'Move to the top of the current area or document.',
      voiceover: { kind: 'keycode', command: 'moveToAreaTop' },
      nvda: pressStep('Control+Home'),
      virtual: { kind: 'walk', edge: 'top' },
   },
   {
      verb: 'bottom',
      description: 'Move to the bottom of the current area or document.',
      voiceover: { kind: 'keycode', command: 'moveToAreaBottom' },
      nvda: pressStep('Control+End'),
      virtual: { kind: 'walk', edge: 'bottom' },
   },
   {
      verb: 'escape',
      description: 'Press Escape to dismiss a menu, dialog, or interaction.',
      voiceover: pressStep('Escape'),
      nvda: pressStep('Escape'),
      virtual: pressStep('Escape'),
   },
];

/** Looks up the portable table row for one verb. */
export function getPortableCommand(verb: PortableDriverVerb): PortableCommandEntry {
   const entry = portableCommandTable.find((candidate) => candidate.verb === verb);
   if (!entry) {
      throw new Error(`Portable verb "${verb}" is missing from the portable table.`);
   }
   return entry;
}

/** Resolves a VoiceOver key-code step to the Guidepup command object it names. */
export function getVoiceOverKeyCodeCommand(
   step: VoiceOverKeyCodeStep,
): (typeof voiceOverKeyCodeCommands)[keyof typeof voiceOverKeyCodeCommands] {
   return voiceOverKeyCodeCommands[step.command];
}

/** Resolves an NVDA key-code step to the Guidepup command object it names. */
export function getNvdaKeyCodeCommand(
   step: NvdaKeyCodeStep,
): (typeof NVDAKeyCodeCommands)[keyof typeof NVDAKeyCodeCommands] {
   return NVDAKeyCodeCommands[step.command];
}

import type { PortableDriverVerb } from '@a11ied/contracts';
import { NVDAKeyCodeCommands, voiceOverKeyCodeCommands } from '@guidepup/guidepup';

import { virtualPortableSteps } from './portable-commands-virtual.js';
import {
   methodStep,
   pressStep,
   type NvdaKeyCodeStep,
   type NvdaPortableStep,
   type VirtualPortableStep,
   type VoiceOverKeyCodeStep,
   type VoiceOverPortableStep,
} from './portable-steps.js';

export type {
   NvdaPortableStep,
   PortableReaderMethod,
   VirtualPortableStep,
   VoiceOverPortableStep,
} from './portable-steps.js';

export interface PortableCommandEntry {
   verb: PortableDriverVerb;
   description: string;
   voiceover: VoiceOverPortableStep;
   nvda: NvdaPortableStep;
   virtual: VirtualPortableStep;
}

/**
 * The one table every portable verb routes through. `sr next`, `sr do next`, and the MCP
 * `next` action all resolve here, so each target behaves the same way for a given verb.
 * Structural jumps (`sr next heading`) live in the navigation table next to this one.
 */
export const portableCommandTable: readonly PortableCommandEntry[] = [
   {
      verb: 'next',
      description: 'Move to the next item.',
      voiceover: methodStep('next'),
      nvda: methodStep('next'),
      virtual: virtualPortableSteps.next,
   },
   {
      verb: 'previous',
      description: 'Move to the previous item.',
      voiceover: methodStep('previous'),
      nvda: methodStep('previous'),
      virtual: virtualPortableSteps.previous,
   },
   {
      verb: 'interact',
      description: 'Enter interaction mode for the current group or control.',
      voiceover: methodStep('interact'),
      nvda: methodStep('interact'),
      virtual: virtualPortableSteps.interact,
   },
   {
      verb: 'stop-interacting',
      description: 'Leave interaction mode.',
      voiceover: methodStep('stopInteracting'),
      nvda: methodStep('stopInteracting'),
      virtual: virtualPortableSteps['stop-interacting'],
   },
   {
      verb: 'activate',
      description: 'Activate the current item.',
      voiceover: methodStep('act'),
      nvda: methodStep('act'),
      virtual: virtualPortableSteps.activate,
   },
   {
      verb: 'top',
      description: 'Move to the top of the current area or document.',
      voiceover: { kind: 'keycode', command: 'moveToAreaTop' },
      nvda: pressStep('Control+Home'),
      virtual: virtualPortableSteps.top,
   },
   {
      verb: 'bottom',
      description: 'Move to the bottom of the current area or document.',
      voiceover: { kind: 'keycode', command: 'moveToAreaBottom' },
      nvda: pressStep('Control+End'),
      virtual: virtualPortableSteps.bottom,
   },
   {
      verb: 'escape',
      description: 'Press Escape to dismiss a menu, dialog, or interaction.',
      voiceover: pressStep('Escape'),
      nvda: pressStep('Escape'),
      virtual: virtualPortableSteps.escape,
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

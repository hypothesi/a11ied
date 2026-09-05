import type {
   DriverNavigateRequest,
   DriverNavigationKind,
   Platform,
} from '@a11ied/contracts';
import { VoiceOverCommanderCommands } from '@guidepup/guidepup';

import {
   headingLevelCommandName,
   virtualNavigationSteps,
   type DirectionalSteps,
} from './portable-navigation-virtual.js';
import {
   methodStep,
   nvdaKeyCodeStep,
   voiceOverCommanderStep,
   voiceOverKeyCodeStep,
   type NvdaPortableStep,
   type RepeatUntilPhraseStep,
   type VirtualPortableStep,
   type VoiceOverPortableStep,
} from './portable-steps.js';

export { resolveVirtualNavigationStep } from './portable-navigation-virtual.js';

/** One row of the navigation table: how each target jumps by one kind of element. */
export interface NavigationKindEntry {
   kind: DriverNavigationKind;
   description: string;
   voiceover: DirectionalSteps<VoiceOverPortableStep>;
   nvda: DirectionalSteps<NvdaPortableStep>;
   virtual: DirectionalSteps<VirtualPortableStep>;
}

/**
 * The one table `sr next <kind>` and `sr previous <kind>` route through: one row per
 * kind, one column per target. VoiceOver uses the Guidepup jump methods, its key-code
 * commands, or a Commander phrase. NVDA uses its single-letter key commands. The virtual
 * reader uses `virtual.commands` where one exists and walks item by item otherwise.
 */
export const navigationKindTable: readonly NavigationKindEntry[] = [
   {
      kind: 'item',
      description: 'Move to the next or previous item.',
      voiceover: { next: methodStep('next'), previous: methodStep('previous') },
      nvda: { next: methodStep('next'), previous: methodStep('previous') },
      virtual: virtualNavigationSteps.item,
   },
   {
      kind: 'heading',
      description: 'Jump by heading. --level N limits the jump to one heading level.',
      voiceover: {
         next: methodStep('nextHeading'),
         previous: methodStep('previousHeading'),
      },
      nvda: { next: methodStep('nextHeading'), previous: methodStep('previousHeading') },
      virtual: virtualNavigationSteps.heading,
   },
   {
      kind: 'link',
      description: 'Jump by link.',
      voiceover: { next: methodStep('nextLink'), previous: methodStep('previousLink') },
      nvda: { next: methodStep('nextLink'), previous: methodStep('previousLink') },
      virtual: virtualNavigationSteps.link,
   },
   {
      kind: 'landmark',
      description: 'Jump by landmark: banner, navigation, main, and the others.',
      // Guidepup's VoiceOver nextLandmark presses VO-Command-N, the auto web spot key,
      // So the Commander phrase is the real landmark jump.
      voiceover: {
         next: voiceOverCommanderStep(VoiceOverCommanderCommands.FIND_NEXT_LANDMARK),
         previous: voiceOverCommanderStep(
            VoiceOverCommanderCommands.FIND_PREVIOUS_LANDMARK,
         ),
      },
      nvda: {
         next: methodStep('nextLandmark'),
         previous: methodStep('previousLandmark'),
      },
      virtual: virtualNavigationSteps.landmark,
   },
   {
      kind: 'control',
      description:
         'Jump by control: buttons, fields, checkboxes, and other form controls.',
      voiceover: {
         next: voiceOverKeyCodeStep('findNextControl'),
         previous: voiceOverKeyCodeStep('findPreviousControl'),
      },
      nvda: {
         next: nvdaKeyCodeStep('moveToNextFormField'),
         previous: nvdaKeyCodeStep('moveToPreviousFormField'),
      },
      virtual: virtualNavigationSteps.control,
   },
   {
      kind: 'button',
      description: 'Jump by button.',
      voiceover: {
         next: voiceOverCommanderStep(VoiceOverCommanderCommands.FIND_NEXT_BUTTON),
         previous: voiceOverCommanderStep(
            VoiceOverCommanderCommands.FIND_PREVIOUS_BUTTON,
         ),
      },
      nvda: {
         next: nvdaKeyCodeStep('moveToNextButton'),
         previous: nvdaKeyCodeStep('moveToPreviousButton'),
      },
      virtual: virtualNavigationSteps.button,
   },
   {
      kind: 'table',
      description: 'Jump by table.',
      voiceover: {
         next: voiceOverKeyCodeStep('findNextTable'),
         previous: voiceOverKeyCodeStep('findPreviousTable'),
      },
      nvda: {
         next: nvdaKeyCodeStep('moveToNextTable'),
         previous: nvdaKeyCodeStep('moveToPreviousTable'),
      },
      virtual: virtualNavigationSteps.table,
   },
   {
      kind: 'list',
      description: 'Jump by list.',
      voiceover: {
         next: voiceOverKeyCodeStep('findNextList'),
         previous: voiceOverKeyCodeStep('findPreviousList'),
      },
      nvda: {
         next: nvdaKeyCodeStep('moveToNextList'),
         previous: nvdaKeyCodeStep('moveToPreviousList'),
      },
      virtual: virtualNavigationSteps.list,
   },
   {
      kind: 'graphic',
      description: 'Jump by graphic: images and figures.',
      voiceover: {
         next: voiceOverKeyCodeStep('findNextGraphic'),
         previous: voiceOverKeyCodeStep('findPreviousGraphic'),
      },
      nvda: {
         next: nvdaKeyCodeStep('moveToNextGraphic'),
         previous: nvdaKeyCodeStep('moveToPreviousGraphic'),
      },
      virtual: virtualNavigationSteps.graphic,
   },
   {
      kind: 'region',
      description:
         'Jump by named region. NVDA treats a named region as a landmark, so it uses the landmark key.',
      voiceover: {
         next: voiceOverCommanderStep(VoiceOverCommanderCommands.FIND_NEXT_LIVE_REGION),
         previous: voiceOverCommanderStep(
            VoiceOverCommanderCommands.FIND_PREVIOUS_REGION,
         ),
      },
      nvda: {
         next: nvdaKeyCodeStep('moveToNextLandmark'),
         previous: nvdaKeyCodeStep('moveToPreviousLandmark'),
      },
      virtual: virtualNavigationSteps.region,
   },
   {
      kind: 'form-field',
      description:
         'Jump by text entry field. Use control for every kind of form control.',
      voiceover: {
         next: voiceOverCommanderStep(VoiceOverCommanderCommands.FIND_NEXT_TEXT_FIELD),
         previous: voiceOverCommanderStep(VoiceOverCommanderCommands.FIND_PREVIOUS_FIELD),
      },
      nvda: {
         next: nvdaKeyCodeStep('moveToNextEditField'),
         previous: nvdaKeyCodeStep('moveToPreviousEditField'),
      },
      virtual: virtualNavigationSteps['form-field'],
   },
];

/** Looks up the navigation table row for one kind. */
export function getNavigationKindEntry(kind: DriverNavigationKind): NavigationKindEntry {
   const entry = navigationKindTable.find((candidate) => candidate.kind === kind);
   if (!entry) {
      throw new Error(`Navigation kind "${kind}" is missing from the navigation table.`);
   }
   return entry;
}

/**
 * Resolves the VoiceOver step for one move. VoiceOver has no per-level heading key, so a
 * level filter repeats the heading jump until the phrase names that level.
 */
export function resolveVoiceOverNavigationStep(
   request: DriverNavigateRequest,
): VoiceOverPortableStep | RepeatUntilPhraseStep<VoiceOverPortableStep> {
   const step = getNavigationKindEntry(request.kind).voiceover[request.direction];
   if (request.kind === 'heading' && request.level !== undefined) {
      return {
         kind: 'repeat-until',
         step,
         phraseIncludes: `level ${String(request.level)}`,
      };
   }
   return step;
}

/** Resolves the NVDA step for one move; heading levels use NVDA's 1 to 6 keys. */
export function resolveNvdaNavigationStep(
   request: DriverNavigateRequest,
): NvdaPortableStep {
   if (request.kind === 'heading' && request.level !== undefined) {
      return nvdaKeyCodeStep(headingLevelCommandName(request.direction, request.level));
   }
   return getNavigationKindEntry(request.kind).nvda[request.direction];
}

/** Names the reader and kind in one line for errors that say a jump is not possible. */
export function describeNavigation(
   target: Platform,
   request: DriverNavigateRequest,
): string {
   const level = request.level === undefined ? '' : ` level ${String(request.level)}`;
   return `${request.direction} ${request.kind}${level} on ${target}`;
}

import type {
   DriverNavigateRequest,
   DriverNavigationDirection,
   DriverNavigationKind,
} from '@a11ied/contracts';

import {
   methodStep,
   virtualCommandStep,
   virtualRoleWalkStep,
   type VirtualCommandName,
   type VirtualPortableStep,
} from './portable-steps.js';

export interface DirectionalSteps<TStep> {
   next: TStep;
   previous: TStep;
}

/** Roles the virtual reader announces first in its phrase for each walked kind. */
const VIRTUAL_CONTROL_ROLES = [
   'button',
   'checkbox',
   'combobox',
   'listbox',
   'menuitem',
   'option',
   'radio',
   'searchbox',
   'slider',
   'spinbutton',
   'switch',
   'tab',
   'textbox',
] as const;
const VIRTUAL_FORM_FIELD_ROLES = [
   'textbox',
   'searchbox',
   'combobox',
   'spinbutton',
] as const;
const VIRTUAL_GRAPHIC_ROLES = ['image', 'img', 'figure'] as const;

function virtualWalk(roles: readonly string[]): DirectionalSteps<VirtualPortableStep> {
   return {
      next: virtualRoleWalkStep('next', roles),
      previous: virtualRoleWalkStep('previous', roles),
   };
}

function virtualCommands(
   next: VirtualCommandName,
   previous: VirtualCommandName,
): DirectionalSteps<VirtualPortableStep> {
   return { next: virtualCommandStep(next), previous: virtualCommandStep(previous) };
}

/**
 * The virtual column of the navigation table: `virtual.commands` where one exists, an
 * item by item walk until the announced role matches otherwise. It lives apart from the
 * VoiceOver and NVDA columns because the browser bundle includes this file and cannot
 * load Guidepup's command enums, which import Node modules.
 */
export const virtualNavigationSteps: Readonly<
   Record<DriverNavigationKind, DirectionalSteps<VirtualPortableStep>>
> = {
   item: { next: methodStep('next'), previous: methodStep('previous') },
   heading: virtualCommands('moveToNextHeading', 'moveToPreviousHeading'),
   link: virtualCommands('moveToNextLink', 'moveToPreviousLink'),
   landmark: virtualCommands('moveToNextLandmark', 'moveToPreviousLandmark'),
   control: virtualWalk(VIRTUAL_CONTROL_ROLES),
   button: virtualWalk(['button']),
   table: virtualWalk(['table']),
   list: virtualWalk(['list']),
   graphic: virtualWalk(VIRTUAL_GRAPHIC_ROLES),
   region: virtualCommands('moveToNextRegion', 'moveToPreviousRegion'),
   'form-field': virtualWalk(VIRTUAL_FORM_FIELD_ROLES),
};

const HEADING_LEVEL_SUFFIXES = ['1', '2', '3', '4', '5', '6'] as const;

export type HeadingLevelCommandName =
   `moveTo${'Next' | 'Previous'}HeadingLevel${(typeof HEADING_LEVEL_SUFFIXES)[number]}`;

/** The per-level heading command name the virtual reader and NVDA both use. */
export function headingLevelCommandName(
   direction: DriverNavigationDirection,
   level: number,
): HeadingLevelCommandName {
   const prefix = direction === 'next' ? 'moveToNext' : 'moveToPrevious';
   const suffix = HEADING_LEVEL_SUFFIXES[level - 1];
   if (suffix === undefined) {
      throw new Error(`Heading level ${String(level)} is outside 1 to 6.`);
   }
   return `${prefix}HeadingLevel${suffix}`;
}

/** Resolves the virtual step for one move. Heading levels use the per-level commands. */
export function resolveVirtualNavigationStep(
   request: DriverNavigateRequest,
): VirtualPortableStep {
   if (request.kind === 'heading' && request.level !== undefined) {
      return virtualCommandStep(
         headingLevelCommandName(request.direction, request.level),
      );
   }
   return virtualNavigationSteps[request.kind][request.direction];
}

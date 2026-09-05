import type { PortableDriverVerb } from '@a11ied/contracts';

import { methodStep, pressStep, type VirtualPortableStep } from './portable-steps.js';

/**
 * The virtual column of the portable verb table. It lives apart from the VoiceOver and
 * NVDA columns because the browser bundle includes this file and cannot load Guidepup's
 * key-code tables, which import Node modules.
 */
export const virtualPortableSteps: Readonly<
   Record<PortableDriverVerb, VirtualPortableStep>
> = {
   next: methodStep('next'),
   previous: methodStep('previous'),
   interact: methodStep('interact'),
   'stop-interacting': methodStep('stopInteracting'),
   activate: methodStep('act'),
   top: { kind: 'walk', edge: 'top' },
   bottom: { kind: 'walk', edge: 'bottom' },
   escape: pressStep('Escape'),
};

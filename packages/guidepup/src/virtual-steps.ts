import type { DriverNavigateRequest } from '@a11ied/contracts';

import { normalizeDriverKeys } from './key-aliases.js';
import { resolveVirtualNavigationStep } from './portable-navigation.js';
import type {
   MethodStep,
   VirtualPortableStep,
   VirtualRoleWalkStep,
} from './portable-steps.js';
import { repeatTimes, repeatUntil, runInOrder } from './sequential.js';
import type { VirtualReader } from './virtual-dom.js';
import { getVirtualPhraseRole, getVirtualPositionToken } from './virtual-position.js';

/**
 * The virtual reader wraps at both ends, so a walk to an edge is bounded by this many
 * steps instead of by a "no movement" check.
 */
export const VIRTUAL_WALK_STEP_CAP = 5000;

export interface VirtualStepContext {
   virtual: VirtualReader;
   /** The body the reader was started on; undefined before the first document attaches. */
   container: Node | undefined;
}

/** What one virtual move reports back: whether the cursor ended somewhere new. */
export interface VirtualMoveOutcome {
   moved: boolean;
}

function isElementNode(node: Node): node is Element {
   return node.nodeType === node.ELEMENT_NODE;
}

function isTreeRoot(node: Node, container: Node | undefined): boolean {
   if (node === container) {
      return true;
   }
   // A modal dialog replaces the document as the root of the tree the reader walks.
   return isElementNode(node) && node.getAttribute('aria-modal') === 'true';
}

async function isAtTreeTop(context: VirtualStepContext): Promise<boolean> {
   const node = context.virtual.activeNode;
   if (!node) {
      return true;
   }
   if (!isTreeRoot(node, context.container)) {
      return false;
   }
   // The root appears twice in the tree: once at the start and once as "end of ...".
   const phrase = await context.virtual.lastSpokenPhrase();
   return !phrase.startsWith('end of ');
}

/** Moves the virtual cursor back to the first node of the document or open dialog. */
export async function walkToTop(context: VirtualStepContext): Promise<void> {
   await repeatUntil(
      () => isAtTreeTop(context),
      () => context.virtual.previous(),
      VIRTUAL_WALK_STEP_CAP,
   );
}

/** Presses each chord in order through the virtual reader. */
export async function pressVirtualKeys(
   virtual: VirtualReader,
   keys: readonly string[],
): Promise<void> {
   await runInOrder(keys, (chord) =>
      virtual.press(normalizeDriverKeys(chord, 'virtual')),
   );
}

async function runMethod(
   virtual: VirtualReader,
   method: MethodStep['method'],
): Promise<void> {
   const methods: Partial<Record<MethodStep['method'], () => Promise<void>>> = {
      next: () => virtual.next(),
      previous: () => virtual.previous(),
      interact: () => virtual.interact(),
      stopInteracting: () => virtual.stopInteracting(),
      act: () => virtual.act(),
   };
   const run = methods[method];
   if (!run) {
      throw new Error(
         `The virtual reader has no "${method}" method; use a virtual command.`,
      );
   }
   await run();
}

export interface VirtualWalkArgs {
   context: VirtualStepContext;
   direction: 'next' | 'previous';
   /** Decides whether the item the cursor is on ends the walk. */
   isMatch: (phrase: string, node: Node | null) => boolean;
}

async function walkStep(
   args: VirtualWalkArgs,
   start: string,
   remaining: number,
): Promise<boolean> {
   if (remaining <= 0) {
      return false;
   }
   await runMethod(args.context.virtual, args.direction);
   if ((await getVirtualPositionToken(args.context.virtual)) === start) {
      return false;
   }
   const phrase = await args.context.virtual.lastSpokenPhrase();
   if (args.isMatch(phrase, args.context.virtual.activeNode)) {
      return true;
   }
   return walkStep(args, start, remaining - 1);
}

/**
 * Walks item by item until `isMatch` accepts the current item. Returns false, with the
 * cursor back where it started, when the walk comes around to its starting point: the
 * virtual reader wraps, so that means the page has no matching item.
 */
export async function walkVirtualUntil(args: VirtualWalkArgs): Promise<boolean> {
   const start = await getVirtualPositionToken(args.context.virtual);
   return walkStep(args, start, VIRTUAL_WALK_STEP_CAP);
}

async function runRoleWalk(
   context: VirtualStepContext,
   step: VirtualRoleWalkStep,
): Promise<VirtualMoveOutcome> {
   const moved = await walkVirtualUntil({
      context,
      direction: step.direction,
      isMatch: (phrase) =>
         step.roles.includes(getVirtualPhraseRole(phrase)) &&
         !phrase.startsWith('end of '),
   });
   return { moved };
}

/** Runs one virtual step and reports whether the cursor moved. */
export async function runVirtualStep(
   context: VirtualStepContext,
   step: VirtualPortableStep,
): Promise<VirtualMoveOutcome> {
   const before = await getVirtualPositionToken(context.virtual);
   if (step.kind === 'role-walk') {
      return runRoleWalk(context, step);
   }
   if (step.kind === 'method') {
      await runMethod(context.virtual, step.method);
   } else if (step.kind === 'press') {
      await pressVirtualKeys(context.virtual, [step.keys]);
   } else if (step.kind === 'command') {
      await context.virtual.perform(context.virtual.commands[step.command]);
   } else {
      await walkToTop(context);
      if (step.edge === 'bottom') {
         // Moving backwards from the top wraps to the last item in the tree.
         await context.virtual.previous();
      }
   }
   return { moved: before !== (await getVirtualPositionToken(context.virtual)) };
}

/** Runs one `sr next <kind>` request on the virtual reader, `times` times. */
export async function runVirtualNavigation(
   context: VirtualStepContext,
   request: DriverNavigateRequest,
): Promise<VirtualMoveOutcome> {
   const step = resolveVirtualNavigationStep(request);
   let moved = false;
   await repeatTimes(request.times ?? 1, async () => {
      const outcome = await runVirtualStep(context, step);
      moved = moved || outcome.moved;
   });
   return { moved };
}

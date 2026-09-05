import {
   driverFocusResultSchema,
   driverReadinessSchema,
   type DriverCheckpoint,
   type DriverFocusTarget,
   type DriverPerformPayload,
   type DriverReadiness,
   type DriverStateSnapshot,
   type PortableDriverVerb,
} from '@a11ied/contracts';

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
   getPortableCommand,
   type PortableReaderMethod,
   type VirtualPortableStep,
} from './portable-commands.js';
import { loadVirtualReader, replaceVirtualDocument, type VirtualReader } from './virtual-dom.js';

/**
 * The virtual reader wraps at both ends, so a walk to an edge is bounded by this many
 * steps instead of by a "no movement" check.
 */
const VIRTUAL_WALK_STEP_CAP = 5000;

const defaultVirtualHtml = `
<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>a11ied virtual target</h1>
      <p>No live page is attached to this driver session yet.</p>
      <button type="button">Continue</button>
    </main>
  </body>
</html>
`;

async function virtualCheckReadiness(): Promise<DriverReadiness> {
   return driverReadinessSchema.parse({
      target: 'virtual',
      status: 'ready',
      summary: 'Virtual screen reader is ready.',
      details: ['Uses an in-memory DOM when no live page is attached.'],
   });
}

async function virtualReadState(
   checkpoints: DriverCheckpoint[],
): Promise<DriverStateSnapshot> {
   return buildStateSnapshot(await loadVirtualReader(), checkpoints);
}

async function virtualFocus(
   target: DriverFocusTarget,
): Promise<ReturnType<typeof driverFocusResultSchema.parse>> {
   return driverFocusResultSchema.parse({
      status: 'skipped',
      target,
      platform: 'virtual',
      details: ['Virtual target has no OS window to focus.'],
   });
}

async function virtualPress(keys: readonly string[]): Promise<void> {
   const virtual = await loadVirtualReader();
   for (const chord of keys) {
      await virtual.press(normalizeDriverKeys(chord, 'virtual'));
   }
}

async function runMethod(virtual: VirtualReader, method: PortableReaderMethod): Promise<void> {
   const methods: Record<PortableReaderMethod, () => Promise<void>> = {
      next: () => virtual.next(),
      previous: () => virtual.previous(),
      interact: () => virtual.interact(),
      stopInteracting: () => virtual.stopInteracting(),
      act: () => virtual.act(),
   };
   await methods[method]();
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

async function isAtTreeTop(virtual: VirtualReader, container: Node | undefined): Promise<boolean> {
   const node = virtual.activeNode;
   if (!node) {
      return true;
   }
   if (!isTreeRoot(node, container)) {
      return false;
   }
   // The root appears twice in the tree: once at the start and once as "end of ...".
   const phrase = await virtual.lastSpokenPhrase();
   return !phrase.startsWith('end of ');
}

async function walkToTop(virtual: VirtualReader, container: Node | undefined): Promise<void> {
   for (let step = 0; step < VIRTUAL_WALK_STEP_CAP; step += 1) {
      if (await isAtTreeTop(virtual, container)) {
         return;
      }
      await virtual.previous();
   }
}

async function runVirtualStep(
   step: VirtualPortableStep,
   container: Node | undefined,
): Promise<void> {
   const virtual = await loadVirtualReader();
   if (step.kind === 'method') {
      await runMethod(virtual, step.method);
      return;
   }
   if (step.kind === 'press') {
      await virtualPress([step.keys]);
      return;
   }
   await walkToTop(virtual, container);
   if (step.edge === 'bottom') {
      // Moving backwards from the top wraps to the last item in the tree.
      await virtual.previous();
   }
}

async function virtualPerformCommand(
   command: DriverPerformPayload,
   performPortable: (verb: PortableDriverVerb) => Promise<void>,
): Promise<ReturnType<typeof serializeResolvedDriverCommand>> {
   let commandSet: DriverCommandSet = 'auto';
   if (command.commandSet) {
      commandSet = parseDriverCommandSet(command.commandSet);
   }
   const resolved = resolveDriverCommand({
      target: 'virtual',
      command: command.command,
      commandSet,
   });
   if (resolved.portableAction) {
      await performPortable(resolved.portableAction);
   }
   return serializeResolvedDriverCommand(resolved);
}

export function createVirtualAdapter(): DriverAdapter {
   let container: Node | undefined = undefined;

   async function stopVirtual(): Promise<void> {
      const virtual = await loadVirtualReader();
      await virtual.stop().catch(() => undefined);
      container = undefined;
   }

   async function attachDocument(document: { html: string; url: string }): Promise<void> {
      const virtual = await loadVirtualReader();
      await virtual.stop().catch(() => undefined);
      const window = replaceVirtualDocument(document);
      container = window.document.body;
      await virtual.start({ container: window.document.body, window });
   }

   async function performPortable(
      verb: PortableDriverVerb,
      _options?: DriverActionOptions,
   ): Promise<void> {
      await runVirtualStep(getPortableCommand(verb).virtual, container);
   }

   return {
      target: 'virtual',
      capabilities: driverCapabilities,
      checkReadiness: virtualCheckReadiness,
      start: async () => {
         await attachDocument({ html: defaultVirtualHtml, url: 'https://a11ied.local/virtual' });
      },
      stop: stopVirtual,
      attachDocument,
      focus: virtualFocus,
      performPortable,
      press: virtualPress,
      type: async (text: string) => {
         await (await loadVirtualReader()).type(text);
      },
      performCommand: (command) => virtualPerformCommand(command, performPortable),
      readState: virtualReadState,
      waitForSpeechStabilization: async () => {
         // The virtual screen reader speaks synchronously, so there is nothing to wait for.
      },
   };
}

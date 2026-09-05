import {
   driverFocusResultSchema,
   driverReadinessSchema,
   type DriverCheckpoint,
   type DriverCurrentItem,
   type DriverFocusTarget,
   type DriverNavigateRequest,
   type DriverPerformPayload,
   type DriverReadiness,
   type DriverStateSnapshot,
   type DriverTableMove,
   type PortableDriverVerb,
} from '@a11ied/contracts';

import {
   buildStateSnapshot,
   driverCapabilities,
   type DriverAdapter,
} from './adapter-shared.js';
import {
   parseDriverCommandSet,
   resolveDriverCommand,
   serializeResolvedDriverCommand,
   type DriverCommandSet,
} from './command-registry.js';
import { getPortableCommand } from './portable-commands.js';
import { ignoreError } from './sequential.js';
import { loadVirtualReader, replaceVirtualDocument } from './virtual-dom.js';
import { readVirtualItem } from './virtual-item.js';
import { getVirtualPositionToken } from './virtual-position.js';
import {
   isAtTreeEnd,
   pressVirtualKeys,
   runVirtualNavigation,
   runVirtualStep,
   type VirtualStepContext,
} from './virtual-steps.js';
import {
   findVirtualText,
   moveInVirtualTable,
   readVirtualTitle,
} from './virtual-structure.js';

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

/** The one piece of state an adapter keeps: the body the reader was started on. */
interface VirtualAdapterState {
   container: Node | undefined;
}

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
   const virtual = await loadVirtualReader();
   return buildStateSnapshot(virtual, checkpoints, () => readVirtualItem(virtual));
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
   await pressVirtualKeys(await loadVirtualReader(), keys);
}

async function virtualType(text: string): Promise<void> {
   const virtual = await loadVirtualReader();
   await virtual.type(text);
}

async function virtualWaitForSpeech(): Promise<void> {
   // The virtual screen reader speaks synchronously, so there is nothing to wait for.
}

async function stepContext(state: VirtualAdapterState): Promise<VirtualStepContext> {
   return { virtual: await loadVirtualReader(), container: state.container };
}

async function virtualReadCurrentItem(state: VirtualAdapterState): Promise<{
   item: DriverCurrentItem;
   position: string;
   atEnd: boolean;
}> {
   const context = await stepContext(state);
   const [item, position, atEnd] = await Promise.all([
      readVirtualItem(context.virtual),
      getVirtualPositionToken(context.virtual),
      isAtTreeEnd(context),
   ]);
   return { item, position, atEnd };
}

async function stopVirtual(state: VirtualAdapterState): Promise<void> {
   const virtual = await loadVirtualReader();
   await virtual.stop().catch(ignoreError);
   state.container = undefined;
}

async function attachVirtualDocument(
   state: VirtualAdapterState,
   document: { html: string; url: string },
): Promise<void> {
   const virtual = await loadVirtualReader();
   await virtual.stop().catch(ignoreError);
   const window = replaceVirtualDocument(document);
   state.container = window.document.body;
   await virtual.start({ container: window.document.body, window });
}

async function performVirtualPortable(
   state: VirtualAdapterState,
   verb: PortableDriverVerb,
): Promise<void> {
   await runVirtualStep(await stepContext(state), getPortableCommand(verb).virtual);
}

async function navigateVirtual(
   state: VirtualAdapterState,
   request: DriverNavigateRequest,
): Promise<{ moved?: boolean }> {
   return runVirtualNavigation(await stepContext(state), request);
}

async function virtualPerformCommand(
   state: VirtualAdapterState,
   command: DriverPerformPayload,
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
   if (resolved.portableNavigation) {
      await navigateVirtual(state, resolved.portableNavigation);
   } else if (resolved.portableAction) {
      await performVirtualPortable(state, resolved.portableAction);
   }
   return serializeResolvedDriverCommand(resolved);
}

export function createVirtualAdapter(): DriverAdapter {
   const state: VirtualAdapterState = { container: undefined };
   return {
      target: 'virtual',
      capabilities: driverCapabilities,
      checkReadiness: virtualCheckReadiness,
      start: () =>
         attachVirtualDocument(state, {
            html: defaultVirtualHtml,
            url: 'https://a11ied.local/virtual',
         }),
      stop: () => stopVirtual(state),
      attachDocument: (document) => attachVirtualDocument(state, document),
      focus: virtualFocus,
      performPortable: (verb) => performVirtualPortable(state, verb),
      navigate: (request) => navigateVirtual(state, request),
      readCurrentItem: () => virtualReadCurrentItem(state),
      readTitle: async () => readVirtualTitle(),
      findText: async (text: string) => findVirtualText(await stepContext(state), text),
      moveInTable: async (move: DriverTableMove) =>
         moveInVirtualTable(await stepContext(state), move),
      press: virtualPress,
      type: virtualType,
      performCommand: (command) => virtualPerformCommand(state, command),
      readState: virtualReadState,
      waitForSpeechStabilization: virtualWaitForSpeech,
   };
}

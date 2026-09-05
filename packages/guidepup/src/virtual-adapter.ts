import {
   driverFocusResultSchema,
   driverReadinessSchema,
   type DriverCheckpoint,
   type DriverFocusTarget,
   type DriverNavigateRequest,
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
import {
   pressVirtualKeys,
   runVirtualNavigation,
   runVirtualStep,
   type VirtualStepContext,
} from './virtual-steps.js';

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

interface VirtualPerformHandlers {
   performPortable: (verb: PortableDriverVerb) => Promise<void>;
   navigate: (request: DriverNavigateRequest) => Promise<{ moved?: boolean }>;
}

async function virtualPerformCommand(
   command: DriverPerformPayload,
   handlers: VirtualPerformHandlers,
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
      await handlers.navigate(resolved.portableNavigation);
   } else if (resolved.portableAction) {
      await handlers.performPortable(resolved.portableAction);
   }
   return serializeResolvedDriverCommand(resolved);
}

export function createVirtualAdapter(): DriverAdapter {
   let container: Node | undefined = undefined;

   async function stepContext(): Promise<VirtualStepContext> {
      return { virtual: await loadVirtualReader(), container };
   }

   async function stopVirtual(): Promise<void> {
      const virtual = await loadVirtualReader();
      await virtual.stop().catch(ignoreError);
      container = undefined;
   }

   async function attachDocument(document: { html: string; url: string }): Promise<void> {
      const virtual = await loadVirtualReader();
      await virtual.stop().catch(ignoreError);
      const window = replaceVirtualDocument(document);
      container = window.document.body;
      await virtual.start({ container: window.document.body, window });
   }

   async function performPortable(
      verb: PortableDriverVerb,
      _options?: DriverActionOptions,
   ): Promise<void> {
      await runVirtualStep(await stepContext(), getPortableCommand(verb).virtual);
   }

   async function navigate(
      request: DriverNavigateRequest,
      _options?: DriverActionOptions,
   ): Promise<{ moved?: boolean }> {
      return runVirtualNavigation(await stepContext(), request);
   }

   return {
      target: 'virtual',
      capabilities: driverCapabilities,
      checkReadiness: virtualCheckReadiness,
      start: async () => {
         await attachDocument({
            html: defaultVirtualHtml,
            url: 'https://a11ied.local/virtual',
         });
      },
      stop: stopVirtual,
      attachDocument,
      focus: virtualFocus,
      performPortable,
      navigate,
      press: virtualPress,
      type: virtualType,
      performCommand: (command) =>
         virtualPerformCommand(command, { performPortable, navigate }),
      readState: virtualReadState,
      waitForSpeechStabilization: virtualWaitForSpeech,
   };
}

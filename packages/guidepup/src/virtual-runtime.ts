import type {
   DriverCurrentItem,
   DriverNavigateRequest,
   DriverTableMove,
   PortableDriverVerb,
} from '@a11ied/contracts';

import { virtualPortableSteps } from './portable-commands-virtual.js';
import { readVirtualItem } from './virtual-item.js';
import { getVirtualPositionToken } from './virtual-position.js';
import type { VirtualReader, VirtualWindow } from './virtual-reader.js';
import {
   isAtTreeEnd,
   isElementNode,
   pressVirtualKeys,
   runVirtualNavigation,
   runVirtualStep,
   type VirtualMoveOutcome,
   type VirtualStepContext,
} from './virtual-steps.js';
import {
   findVirtualText,
   moveInVirtualTable,
   readVirtualTitle,
} from './virtual-structure.js';

/** What the virtual reader has said so far, as the adapter state reads it. */
export interface VirtualSpeech {
   lastSpokenPhrase: string;
   itemText: string;
   spokenPhraseLog: string[];
   itemTextLog: string[];
}

/** The item under the cursor, its position token, and whether it is the last item. */
export interface VirtualCurrentItem {
   item: DriverCurrentItem;
   position: string;
   atEnd: boolean;
}

/**
 * The operations the virtual adapter needs from wherever the reader's document lives.
 * Actions and observations cross the page boundary as JSON. Browser activation uses an
 * element handle so navigation cannot destroy a pending simulated-click promise.
 */
export interface VirtualRuntime {
   /** Starts the reader on the body of the current document. */
   start(): Promise<void>;
   stop(): Promise<void>;
   /** An injected bundle can exist before its reader is initialized. */
   isStarted(): Promise<boolean>;
   readSpeech(): Promise<VirtualSpeech>;
   readCurrentItem(): Promise<VirtualCurrentItem>;
   /** Bind browser input to the cursor node without resolving a replacement selector. */
   readActivationNode(): Promise<Element | undefined>;
   /** Runs one portable verb through the virtual column of the portable table. */
   runPortable(verb: PortableDriverVerb): Promise<VirtualMoveOutcome>;
   /** Jumps by kind through the virtual column of the navigation table. */
   navigate(request: DriverNavigateRequest): Promise<VirtualMoveOutcome>;
   press(keys: readonly string[]): Promise<void>;
   type(text: string): Promise<void>;
   readTitle(): Promise<{ title: string; source: string }>;
   findText(text: string): Promise<{ found: boolean }>;
   moveInTable(move: DriverTableMove): Promise<{ moved?: boolean; header?: string }>;
}

export interface VirtualRuntimeOptions {
   /** Resolves the reader. The jsdom host imports it only once the DOM globals exist. */
   getVirtual: () => Promise<VirtualReader>;
   /** The window whose document the reader walks, read again on every start. */
   getWindow: () => VirtualWindow;
   /** The node the reader is bounded to, or the document body when absent. */
   getContainer?: (() => Node) | undefined;
}

declare global {
   /**
    * Set on a page by the injected script so Playwright can drive the reader in it. A
    * `var` is the one declaration form TypeScript adds to `globalThis`.
    */
   var a11iedVirtualRuntime: VirtualRuntime;
}

async function readSpeech(virtual: VirtualReader): Promise<VirtualSpeech> {
   const [lastSpokenPhrase, itemText, spokenPhraseLog, itemTextLog] = await Promise.all([
      virtual.lastSpokenPhrase(),
      virtual.itemText(),
      virtual.spokenPhraseLog(),
      virtual.itemTextLog(),
   ]);
   return { lastSpokenPhrase, itemText, spokenPhraseLog, itemTextLog };
}

async function readCurrentItem(context: VirtualStepContext): Promise<VirtualCurrentItem> {
   const [item, position, atEnd] = await Promise.all([
      readVirtualItem(context.virtual),
      getVirtualPositionToken(context.virtual),
      isAtTreeEnd(context),
   ]);
   return { item, position, atEnd };
}

/**
 * Builds the runtime over one reader and one window. The only state it keeps is the body
 * the reader was started on, which the tree-edge checks need.
 */
export function createVirtualRuntime(options: VirtualRuntimeOptions): VirtualRuntime {
   const state: { container: Node | undefined } = { container: undefined };
   const context = async (): Promise<VirtualStepContext> => ({
      virtual: await options.getVirtual(),
      container: state.container,
      window: options.getWindow(),
   });
   return {
      async start(): Promise<void> {
         const virtual = await options.getVirtual(),
            window = options.getWindow();
         const container = options.getContainer?.() ?? window.document.body;
         if (state.container === container && container.isConnected) {
            return;
         }
         if (state.container && state.container !== container) {
            await virtual.stop();
         }
         state.container = undefined;
         await virtual.start({ container, window });
         state.container = container;
      },
      async stop(): Promise<void> {
         const virtual = await options.getVirtual();
         await virtual.stop();
         state.container = undefined;
      },
      async isStarted(): Promise<boolean> {
         const container = state.container,
            document = options.getWindow().document;
         return (
            container !== undefined &&
            container.isConnected &&
            (container === document || container.ownerDocument === document)
         );
      },
      readSpeech: async () => readSpeech(await options.getVirtual()),
      readCurrentItem: async () => readCurrentItem(await context()),
      async readActivationNode(): Promise<Element | undefined> {
         const virtual = await options.getVirtual();
         const node = virtual.activeNode;
         if (!node) {
            return undefined;
         }
         return isElementNode(node) ? node : (node.parentElement ?? undefined);
      },
      runPortable: async (verb) =>
         runVirtualStep(await context(), virtualPortableSteps[verb]),
      navigate: async (request) => runVirtualNavigation(await context(), request),
      press: async (keys) => pressVirtualKeys(await options.getVirtual(), keys),
      type: async (text) => {
         const virtual = await options.getVirtual();
         await virtual.type(text);
      },
      readTitle: async () => readVirtualTitle(await context()),
      findText: async (text) => findVirtualText(await context(), text),
      moveInTable: async (move) => moveInVirtualTable(await context(), move),
   };
}

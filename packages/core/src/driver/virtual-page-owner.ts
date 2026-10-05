import type { Frame, Page } from 'playwright';
import { defaultVirtualDocument, type VirtualHost } from '@a11ied/guidepup';
import { CliEnvironmentError } from '../errors/cli-errors.js';
import { withCurrentBrowserPage } from '../browser/current-page.js';
import { CommandQueue } from './command-queue.js';

const owners = new WeakMap<Page, symbol>();

interface OwnedPage {
   host: VirtualHost;
   page: Page;
   url: string;
   owner: symbol;
   queue: CommandQueue;
   state: {
      changed: boolean;
      initialized: boolean;
      loaded: boolean;
      stopped: boolean;
      stopping: boolean;
   };
   release: () => void;
   recordNavigation: (frame: Frame) => void;
}

async function attachOwnedDocument(
   input: OwnedPage,
   document: { html: string; url: string },
): Promise<void> {
   const { page, url, host, state, recordNavigation } = input;
   if (!state.initialized && state.changed) {
      throw new CliEnvironmentError(
         'browser-state-changed',
         'The document changed before reader startup. Reobserve it.',
      );
   }
   try {
      await withCurrentBrowserPage({
         load: { kind: 'goto', url: state.initialized ? page.url() : url },
         page,
         callback: async () => host.attachDocument(document),
      });
      state.initialized = true;
      page.off('framenavigated', recordNavigation);
   } finally {
      state.loaded =
         !page.isClosed() &&
         (await page
            .evaluate(() => 'a11iedVirtualRuntime' in globalThis)
            .catch(() => true));
   }
}

async function stopOwnedPage(input: OwnedPage): Promise<void> {
   const { page, host, state, queue, owner, release } = input;
   state.stopping = true;
   await queue.enqueue(async () => {
      if (state.stopped || owners.get(page) !== owner) {
         return;
      }
      if (
         state.loaded &&
         !page.isClosed() &&
         (await page.evaluate(() => 'a11iedVirtualRuntime' in globalThis))
      ) {
         await host.dispose();
      }
      release();
   }, new Error('Virtual reader cleanup was queued here.'));
}

async function runOwnedCommand<TResult>(
   input: OwnedPage,
   action: () => Promise<TResult>,
): Promise<TResult> {
   const { page, state, queue, owner } = input;
   return await queue.enqueue(async () => {
      if (state.stopping || owners.get(page) !== owner) {
         throw new CliEnvironmentError(
            'virtual-session-not-started',
            'This reader no longer owns the page.',
         );
      }
      return action();
   }, new Error('Virtual reader action was queued here.'));
}

function wrapOwnedPage(input: OwnedPage): VirtualHost {
   const { host } = input;
   const snapshot = host.readSnapshot;
   return {
      engine: 'browser',
      ...(snapshot ? { readSnapshot: () => runOwnedCommand(input, snapshot) } : {}),
      start: () =>
         runOwnedCommand(input, () => attachOwnedDocument(input, defaultVirtualDocument)),
      attachDocument: (document) =>
         runOwnedCommand(input, () => attachOwnedDocument(input, document)),
      stop: () => stopOwnedPage(input),
      dispose: () => stopOwnedPage(input),
      readSpeech: () => runOwnedCommand(input, host.readSpeech),
      readCurrentItem: () => runOwnedCommand(input, host.readCurrentItem),
      runPortable: (verb) => runOwnedCommand(input, () => host.runPortable(verb)),
      navigate: (request) => runOwnedCommand(input, () => host.navigate(request)),
      press: (keys) => runOwnedCommand(input, () => host.press(keys)),
      type: (text) => runOwnedCommand(input, () => host.type(text)),
      readTitle: () => runOwnedCommand(input, host.readTitle),
      findText: (text) => runOwnedCommand(input, () => host.findText(text)),
      moveInTable: (move) => runOwnedCommand(input, () => host.moveInTable(move)),
   };
}

/** Bind one simulated reader to a caller document without taking over its browser. */
export async function ownVirtualPage(input: {
   page: Page;
   url: string;
   create: () => Promise<VirtualHost>;
}): Promise<VirtualHost> {
   const { page, url, create } = input;
   if (owners.has(page)) {
      throw new CliEnvironmentError(
         'virtual-session-conflict',
         'This page already has a virtual reader. Stop it before starting another.',
      );
   }
   const owner = Symbol('virtual-page'),
      queue = new CommandQueue();
   const state = {
      changed: false,
      initialized: false,
      loaded: false,
      stopped: false,
      stopping: false,
   };
   function recordNavigation(frame: Frame): void {
      if (frame === page.mainFrame()) {
         state.changed = true;
      }
   }
   function release(): void {
      state.stopped = true;
      page.off('framenavigated', recordNavigation);
      if (owners.get(page) === owner) {
         owners.delete(page);
      }
   }
   owners.set(page, owner);
   page.on('framenavigated', recordNavigation);
   const host = await create().catch((error: unknown) => {
      release();
      throw error;
   });
   return wrapOwnedPage({
      host,
      page,
      url,
      owner,
      queue,
      state,
      release,
      recordNavigation,
   });
}

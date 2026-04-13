import { virtual } from '@guidepup/virtual-screen-reader';
import {
   driverFocusResultSchema,
   driverReadinessSchema,
   type DriverCheckpoint,
   type DriverFocusTarget,
   type DriverReadiness,
   type DriverStateSnapshot,
} from '@a11ied/contracts';
import { JSDOM } from 'jsdom';

import {
   buildStateSnapshot,
   driverCapabilities,
   type DriverAdapter,
} from './adapter-shared.js';
import { normalizeDriverKeys } from './key-aliases.js';

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
      details: ['Uses an in-memory DOM when no live target is attached.'],
   });
}

async function virtualReadState(
   checkpoints: DriverCheckpoint[],
): Promise<DriverStateSnapshot> {
   return buildStateSnapshot(virtual, checkpoints);
}

async function virtualClearLogs(
   checkpoints: DriverCheckpoint[],
): Promise<DriverStateSnapshot> {
   await Promise.all([virtual.clearSpokenPhraseLog(), virtual.clearItemTextLog()]);
   return buildStateSnapshot(virtual, checkpoints);
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

function createNavigationMethods(): Pick<
   DriverAdapter,
   | 'next'
   | 'previous'
   | 'press'
   | 'type'
   | 'interact'
   | 'stopInteracting'
   | 'activateCurrentItem'
> {
   return {
      next: async () => {
         await virtual.next();
      },
      previous: async () => {
         await virtual.previous();
      },
      press: async (keys: string) => {
         await virtual.press(normalizeDriverKeys(keys, 'virtual'));
      },
      type: async (text: string) => {
         await virtual.type(text);
      },
      interact: async () => {
         await virtual.interact();
      },
      stopInteracting: async () => {
         await virtual.stopInteracting();
      },
      activateCurrentItem: async () => {
         await virtual.act();
      },
   };
}

export function createVirtualAdapter(): DriverAdapter {
   let dom: JSDOM | undefined = undefined;

   async function stopVirtual(): Promise<void> {
      await virtual.stop().catch(() => {
         // No-op
      });
      dom?.window.close();
      dom = undefined;
   }

   async function attachDocument(document: { html: string; url: string }): Promise<void> {
      await virtual.stop().catch(() => {
         // No-op
      });
      dom?.window.close();
      dom = new JSDOM(document.html, {
         pretendToBeVisual: true,
         url: document.url,
      });
      await virtual.start({
         container: dom.window.document.body,
         window: dom.window,
      });
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
      readState: virtualReadState,
      clearLogs: virtualClearLogs,
      waitForSpeechStabilization: async () => {
         // Virtual screen reader is synchronous — no stabilization needed.
      },
      ...createNavigationMethods(),
   };
}

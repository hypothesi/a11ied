import { virtual } from '@guidepup/virtual-screen-reader';
import {
   driverReadinessSchema,
   type DriverCheckpoint,
   type DriverReadiness,
   type DriverStateSnapshot,
} from '@a11ied/contracts';
import { JSDOM } from 'jsdom';

import {
   buildStateSnapshot,
   driverCapabilities,
   type DriverAdapter,
} from './adapters.js';

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
         await virtual.press(keys);
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
      readState: virtualReadState,
      clearLogs: virtualClearLogs,
      ...createNavigationMethods(),
   };
}

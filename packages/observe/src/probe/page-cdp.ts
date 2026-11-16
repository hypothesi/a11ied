import type { CDPSession, Page } from 'playwright';
import type { Instrumented, ListenerInfo, PageFacts } from './page-fact-types.js';

const DOWN_EVENTS = new Set(['mousedown', 'pointerdown', 'touchstart']);
const INSTRUMENT_MS = 1500;
const SENSOR_ORIENTATION = 'absolute-orientation';
const SNIPPET_LENGTH = 100;

/** Sensor emulation is optional: a browser without it still yields listener facts. */
function ignoreUnsupportedSensor(): void {
   // Nothing to undo; the motion-listener count stays zero.
}

async function listenerTypes(cdp: CDPSession, expression: string): Promise<string[]> {
   const { result } = await cdp.send('Runtime.evaluate', { expression });
   if (!result.objectId) {
      return [];
   }
   const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
      objectId: result.objectId,
   });
   return [...new Set(listeners.map((listener) => listener.type))];
}

const DESCRIBE_ELEMENT = `function () { return { html: this.outerHTML.slice(0, ${String(SNIPPET_LENGTH)}), native: !!this.closest("a[href],button,input,select,textarea,summary,label"), focusable: this.tabIndex >= 0 }; }`;

async function describeListeners(
   cdp: CDPSession,
   objectId: string,
): Promise<{ types: string[]; info: ListenerInfo } | undefined> {
   const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId });
   const types = [...new Set(listeners.map((listener) => listener.type))];
   if (types.length === 0) {
      return undefined;
   }
   const { result } = await cdp.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: DESCRIBE_ELEMENT,
      returnByValue: true,
   });
   const info: ListenerInfo = result.value;
   return { types, info };
}

function listObjectIds(
   properties: { name: string; value?: { objectId?: string | undefined } | undefined }[],
): string[] {
   return properties
      .filter((entry) => /^\d+$/.test(entry.name))
      .map((entry) => entry.value?.objectId)
      .filter((objectId): objectId is string => objectId !== undefined);
}

type ElementListenerFacts = Pick<PageFacts, 'clickOnNonInteractive' | 'downHandlers'>;

function classifyListeners(
   described: ({ types: string[]; info: ListenerInfo } | undefined)[],
): ElementListenerFacts {
   const facts: ElementListenerFacts = { clickOnNonInteractive: [], downHandlers: [] };
   for (const entry of described) {
      if (!entry) {
         continue;
      }
      const { types, info } = entry;
      if (types.includes('click') && !info.native && !info.focusable) {
         facts.clickOnNonInteractive.push(info.html);
      }
      if (types.some((type) => DOWN_EVENTS.has(type))) {
         facts.downHandlers.push({ html: info.html, types });
      }
   }
   return facts;
}

export async function readElementListeners(
   cdp: CDPSession,
): Promise<ElementListenerFacts> {
   const { result } = await cdp.send('Runtime.evaluate', {
      expression: 'Array.from(document.querySelectorAll("*"))',
   });
   if (!result.objectId) {
      return { clickOnNonInteractive: [], downHandlers: [] };
   }
   const { result: properties } = await cdp.send('Runtime.getProperties', {
      objectId: result.objectId,
      ownProperties: true,
   });
   const described = await Promise.all(
      listObjectIds(properties).map((objectId) => describeListeners(cdp, objectId)),
   );
   return classifyListeners(described);
}

export async function readInstrumentation(
   page: Page,
   cdp: CDPSession,
): Promise<Pick<PageFacts, 'instrumented' | 'listeners'>> {
   await cdp
      .send('Emulation.setSensorOverrideEnabled', {
         enabled: true,
         type: SENSOR_ORIENTATION,
      })
      .catch(ignoreUnsupportedSensor);
   await page.waitForTimeout(INSTRUMENT_MS);
   return {
      instrumented: await page.evaluate<Instrumented>('window.__a11'),
      listeners: {
         window: await listenerTypes(cdp, 'window'),
         document: await listenerTypes(cdp, 'document'),
         body: await listenerTypes(cdp, 'document.body'),
      },
   };
}

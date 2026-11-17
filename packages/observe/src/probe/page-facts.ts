import type { Browser, Page } from 'playwright';
import type { BaseFacts, PageFacts, SmallTarget, TabStop } from './page-fact-types.js';
import { collectMediaInventory } from './media-inventory.js';
import { readElementListeners, readInstrumentation } from './page-cdp.js';
import { findClippedText, measureViewports } from './page-layout.js';
import {
   INSTRUMENT_SCRIPT,
   PAGE_FACTS_SCRIPT,
   SMALL_TARGETS_SCRIPT,
   TAB_STOP_SCRIPT,
} from './page-script.js';

export type { PageFacts, TabStop } from './page-fact-types.js';

const DESKTOP = { width: 1280, height: 900 };
const MAX_TAB_STOPS = 120;
const MIN_DISTINCT_STOPS = 3;
const SETTLE_MS = 300;
const STOP_KEY_LENGTH = 20;
const TRAILING_NULL_STOPS = 3;

/** Opens an isolated page whose media and motion hooks load before the site's scripts. */
export async function openProbePage(
   browser: Browser,
   options: { storageStatePath?: string | undefined } = {},
): Promise<Page> {
   const context = await browser.newContext({
      viewport: DESKTOP,
      ...(options.storageStatePath ? { storageState: options.storageStatePath } : {}),
   });
   await context.addInitScript(INSTRUMENT_SCRIPT);
   return context.newPage();
}

async function walkTabStops(
   page: Page,
): Promise<Pick<PageFacts, 'tabStops' | 'urlUnchangedAfterTab' | 'trapSuspected'>> {
   const startUrl = page.url();
   const tabStops: (TabStop | null)[] = [];
   for (let press = 0; press < MAX_TAB_STOPS; press += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each press depends on the previous focus
      await page.keyboard.press('Tab');
      // oxlint-disable-next-line no-await-in-loop -- read focus before the next press
      tabStops.push(await page.evaluate<TabStop | null>(TAB_STOP_SCRIPT));
      const trailing = tabStops.slice(-TRAILING_NULL_STOPS);
      if (
         trailing.length === TRAILING_NULL_STOPS &&
         trailing.every((stop) => stop === null)
      ) {
         break;
      }
   }
   const stops = tabStops.filter((stop): stop is TabStop => stop !== null);
   return {
      tabStops,
      urlUnchangedAfterTab: page.url() === startUrl,
      trapSuspected:
         stops.length > 0 &&
         new Set(stops.map((stop) => stop.id)).size < MIN_DISTINCT_STOPS,
   };
}

export interface IndicatorProbe {
   id: string;
   keyLength?: number;
   selector?: string;
   index?: number;
}

/** True when focusing the stop changes its own styling, or null when it cannot be found. */
export function focusChangesStyle(probe: IndicatorProbe): boolean | undefined {
   const defaultStopKeyLength = 20;
   const resolveTarget = (): Element | undefined => {
      if (probe.selector) {
         return document.querySelector(probe.selector) ?? undefined;
      }
      if (typeof probe.index === 'number') {
         return document.querySelectorAll('*')[probe.index];
      }
      const colonIndex = probe.id.indexOf(':');
      const tag = colonIndex === -1 ? probe.id : probe.id.slice(0, colonIndex);
      const key = colonIndex === -1 ? '' : probe.id.slice(colonIndex + 1);
      const keyLength = probe.keyLength ?? defaultStopKeyLength;
      return [...document.querySelectorAll(tag || '*')].find(
         (node) =>
            (node.id || (node.textContent ?? '').trim().slice(0, keyLength)) === key,
      );
   };
   const element = resolveTarget();
   if (!(element instanceof HTMLElement)) {
      return undefined;
   }
   const describe = (): string => {
      const computed = getComputedStyle(element);
      const selfStyles = [
         computed.outlineColor,
         computed.outlineWidth,
         computed.outlineStyle,
         computed.boxShadow,
         computed.borderTopColor,
         computed.borderRightColor,
         computed.borderBottomColor,
         computed.borderLeftColor,
         computed.backgroundColor,
         computed.color,
         computed.textDecorationLine,
         computed.opacity,
         computed.transform,
      ].join('|');
      const parentStyles: string[] = [];
      for (
         let parent = element.parentElement;
         parent && parent !== document.documentElement;
         parent = parent.parentElement
      ) {
         const pc = getComputedStyle(parent);
         parentStyles.push(
            [
               pc.outlineColor,
               pc.outlineWidth,
               pc.outlineStyle,
               pc.boxShadow,
               pc.borderTopColor,
               pc.borderRightColor,
               pc.borderBottomColor,
               pc.borderLeftColor,
            ].join(';'),
         );
      }
      return `${selfStyles}#${parentStyles.join(';')}`;
   };
   element.blur();
   const before = describe();
   element.focus({ focusVisible: true });
   return before !== describe();
}

/** A stop with no outline or shadow still counts when focusing changes its own styling. */
async function findStopsWithoutIndicator(
   page: Page,
   stops: TabStop[],
): Promise<string[]> {
   const candidates = stops.filter((entry) => !entry.outline && !entry.shadow);
   const results: { id: string; changed: boolean | undefined }[] = [];
   for (const stop of candidates) {
      // oxlint-disable-next-line no-await-in-loop -- focus is global, so stops run one at a time
      const changed = await page.evaluate(focusChangesStyle, {
         id: stop.id,
         keyLength: STOP_KEY_LENGTH,
      });
      results.push({ id: stop.id, changed });
   }
   return results.filter((entry) => entry.changed !== true).map((entry) => entry.id);
}

function readFocusedSkipLink(): string | undefined {
   const element = document.activeElement;
   const href = element?.getAttribute('href') ?? '';
   return element?.tagName === 'A' && href.startsWith('#')
      ? (element.textContent ?? '').trim()
      : undefined;
}

export async function readSkipLink(
   page: Page,
   _url?: string,
): Promise<string | undefined> {
   await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
         document.activeElement.blur();
      }
      document.body?.focus();
   });
   await page.keyboard.press('Tab');
   return page.evaluate(readFocusedSkipLink);
}

/** Collects the observable facts on an already loaded page without reloading. */
export async function collectLoadedPageFacts(
   page: Page,
   url = page.url(),
): Promise<PageFacts> {
   const cdp = await page.context().newCDPSession(page);
   await page.waitForTimeout(SETTLE_MS);
   const base = await page.evaluate<BaseFacts>(PAGE_FACTS_SCRIPT);
   const smallTargets = await page.evaluate<SmallTarget[]>(SMALL_TARGETS_SCRIPT);
   const instruments = await readInstrumentation(page, cdp);
   const mediaInventory = await collectMediaInventory(page);
   const elementListeners = await readElementListeners(cdp);
   const walked = await walkTabStops(page);
   const stops = walked.tabStops.filter((stop): stop is TabStop => stop !== null);
   const noIndicator = await findStopsWithoutIndicator(page, stops);
   const skipLink = await readSkipLink(page, url);
   const viewports = await measureViewports(page, url);
   const textSpacingClipped = await findClippedText(page);
   return {
      ...base,
      mediaInventory,
      ...instruments,
      ...elementListeners,
      ...walked,
      ...viewports,
      url,
      smallTargets,
      noIndicator,
      skipLink,
      textSpacingClipped,
   };
}

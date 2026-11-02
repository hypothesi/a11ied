import type { Browser, Page } from 'playwright';
import type { BaseFacts, PageFacts, SmallTarget, TabStop } from './page-fact-types.js';
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
export async function openProbePage(browser: Browser): Promise<Page> {
   const context = await browser.newContext({ viewport: DESKTOP });
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

interface IndicatorProbe {
   id: string;
   keyLength: number;
}

/** True when focusing the stop changes its own styling, or null when it cannot be found. */
function focusChangesStyle(probe: IndicatorProbe): boolean | undefined {
   const [tag, key] = probe.id.split(':');
   const element = [...document.querySelectorAll(tag ?? '')].find(
      (node) =>
         (node.id || (node.textContent ?? '').trim().slice(0, probe.keyLength)) === key,
   );
   if (!(element instanceof HTMLElement)) {
      return undefined;
   }
   const describe = (): string => {
      const computed = getComputedStyle(element);
      return [
         computed.backgroundColor,
         computed.color,
         computed.textDecorationLine,
         computed.borderTopColor,
         computed.opacity,
         computed.transform,
      ].join('|');
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

async function readSkipLink(page: Page, url: string): Promise<string | undefined> {
   await page.goto(url, { waitUntil: 'networkidle' });
   await page.keyboard.press('Tab');
   return page.evaluate(readFocusedSkipLink);
}

/** Collects the observable facts for one page in a fresh, instrumented browser page. */
export async function collectPageFacts(page: Page, url: string): Promise<PageFacts> {
   const cdp = await page.context().newCDPSession(page);
   await page.goto(url, { waitUntil: 'networkidle' });
   await page.waitForTimeout(SETTLE_MS);
   const base = await page.evaluate<BaseFacts>(PAGE_FACTS_SCRIPT);
   const smallTargets = await page.evaluate<SmallTarget[]>(SMALL_TARGETS_SCRIPT);
   const instruments = await readInstrumentation(page, cdp);
   const elementListeners = await readElementListeners(cdp);
   const walked = await walkTabStops(page);
   const stops = walked.tabStops.filter((stop): stop is TabStop => stop !== null);
   const noIndicator = await findStopsWithoutIndicator(page, stops);
   const skipLink = await readSkipLink(page, url);
   const viewports = await measureViewports(page, url);
   const textSpacingClipped = await findClippedText(page);
   return {
      ...base,
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

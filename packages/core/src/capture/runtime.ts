import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { withTextSpacing } from '@a11ied/observe';
import type { Browser, Page } from 'playwright';
import { gotoSettled } from '../browser/load.js';
import { launchAutomationBrowser } from '../browser/runtime.js';
import { CliUsageError } from '../errors/cli-errors.js';
import { screenshotElement } from './element.js';
import { parseHttpUrl } from '../targets/parse.js';

const DEFAULT_VIEWPORT = { width: 1280, height: 900 };
const DEFAULT_TIMEOUT_MS = 30_000;
const SETTLE_MS = 300;
const NAME_LIMIT = 80;
const KEY_REPEAT = /^(?<key>.+)\*(?<count>\d+)$/u;
const VIEWPORT = /^(?<width>\d+)x(?<height>\d+)$/u;

export interface CapturePageOptions {
   /** Where to write the PNG. Parent directories are created. */
   out: string;
   /** CSS pixels as `320x800`. Defaults to 1280x900. */
   viewport?: string | undefined;
   /** Browser zoom factor, such as 2 for 200 percent. */
   zoom?: number | undefined;
   /** Apply the WCAG 1.4.12 text spacing values before capturing. */
   textSpacing?: boolean | undefined;
   /** Click these elements in order first, to open a menu, dialog, or widget. */
   click?: readonly string[] | undefined;
   /** Keys to press in order, such as `Tab`, `Shift+Tab`, or `Tab*5` for five presses. */
   press?: readonly string[] | undefined;
   /** Hover this element before capturing. */
   hover?: string | undefined;
   /** Capture this element, outlined, with some of the page around it. */
   selector?: string | undefined;
   /** Capture the whole scrollable page instead of the viewport. */
   fullPage?: boolean | undefined;
   waitFor?: string | undefined;
   storageStatePath?: string | undefined;
   timeoutMs?: number | undefined;
}

/** What had keyboard focus when the picture was taken. */
export interface FocusedElement {
   tag: string;
   role: string;
   name: string;
   box: { left: number; top: number; width: number; height: number };
   /** False when the element has no size, is hidden, or lies outside the viewport. */
   inViewport: boolean;
   /** True when another element covers its center point. */
   covered: boolean;
   outline: string;
   boxShadow: string;
}

export interface CaptureResult {
   file: string;
   url: string;
   title: string;
   viewport: { width: number; height: number };
   zoom: number;
   /** How far the page scrolls sideways, in CSS pixels. Zero means no horizontal scroll. */
   horizontalOverflowPx: number;
   focused: FocusedElement | undefined;
}

function parseViewport(value: string | undefined): { width: number; height: number } {
   if (value === undefined) {
      return DEFAULT_VIEWPORT;
   }
   const groups = VIEWPORT.exec(value)?.groups;
   if (!groups) {
      throw new CliUsageError(
         'invalid-viewport',
         `Viewport "${value}" is not WIDTHxHEIGHT, such as 320x800.`,
      );
   }
   return { width: Number(groups['width']), height: Number(groups['height']) };
}

/** Expands `Tab*3` into three `Tab` presses. */
export function expandKeys(keys: readonly string[]): string[] {
   return keys.flatMap((entry) => {
      const groups = KEY_REPEAT.exec(entry)?.groups;
      return groups
         ? Array.from({ length: Number(groups['count']) }, () => groups['key'] ?? '')
         : [entry];
   });
}

/**
 * Whether the focused element is on screen and whether something else is drawn over its
 * center. Focus inside a web component is reported on its host, so both lookups follow
 * open shadow roots down to the real element.
 */
async function readFocusVisibility(
   page: Page,
): Promise<Pick<FocusedElement, 'inViewport' | 'covered'>> {
   return page.evaluate(() => {
      const half = 0.5;
      let element = document.activeElement;
      while (element?.shadowRoot?.activeElement) {
         element = element.shadowRoot.activeElement;
      }
      if (!element) {
         return { inViewport: false, covered: false };
      }
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width * half;
      const centerY = rect.top + rect.height * half;
      let top = document.elementFromPoint(centerX, centerY);
      let inner = top?.shadowRoot?.elementFromPoint(centerX, centerY);
      while (inner && inner !== top) {
         top = inner;
         inner = top.shadowRoot?.elementFromPoint(centerX, centerY);
      }
      const inViewport =
         rect.width > 0 &&
         rect.height > 0 &&
         getComputedStyle(element).visibility !== 'hidden' &&
         centerX >= 0 &&
         centerY >= 0 &&
         centerX <= innerWidth &&
         centerY <= innerHeight;
      return {
         inViewport,
         covered: inViewport && top !== null && top !== element && !element.contains(top),
      };
   });
}

async function readFocusedElement(page: Page): Promise<CaptureResult['focused']> {
   const described = await page.evaluate((nameLimit) => {
      let element = document.activeElement;
      while (element?.shadowRoot?.activeElement) {
         element = element.shadowRoot.activeElement;
      }
      if (!(element instanceof HTMLElement) || element === document.body) {
         return;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
         tag: element.tagName.toLowerCase(),
         role: element.getAttribute('role') ?? '',
         name: (element.getAttribute('aria-label') ?? element.textContent ?? '')
            .replaceAll(/\s+/gu, ' ')
            .trim()
            .slice(0, nameLimit),
         box: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
         },
         outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
         boxShadow: style.boxShadow,
      };
   }, NAME_LIMIT);
   if (!described) {
      return undefined;
   }
   return { ...described, ...(await readFocusVisibility(page)) };
}

async function readPageState(
   page: Page,
): Promise<Pick<CaptureResult, 'horizontalOverflowPx' | 'focused'>> {
   const horizontalOverflowPx = await page.evaluate(() =>
      Math.max(
         0,
         document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
   );
   return { horizontalOverflowPx, focused: await readFocusedElement(page) };
}

/** Runs steps one after another, since each acts on the state the last one left. */
export async function runInOrder<TItem>(
   items: readonly TItem[],
   step: (item: TItem) => Promise<void>,
): Promise<void> {
   const [first, ...rest] = items;
   if (first === undefined) {
      return;
   }
   await step(first);
   await runInOrder(rest, step);
}

async function preparePage(page: Page, options: CapturePageOptions): Promise<void> {
   if (options.waitFor) {
      await page.waitForSelector(options.waitFor);
   }
   await runInOrder(options.click ?? [], async (selector) => {
      await page.locator(selector).first().click();
      await page.waitForTimeout(SETTLE_MS);
   });
   await runInOrder(expandKeys(options.press ?? []), async (key) => {
      await page.keyboard.press(key);
   });
   if (options.hover) {
      await page.locator(options.hover).first().hover();
   }
   await page.waitForTimeout(SETTLE_MS);
}

async function takeScreenshot(page: Page, options: CapturePageOptions): Promise<void> {
   if (options.selector) {
      await screenshotElement(page, options.selector, options.out);
      return;
   }
   const path = resolve(options.out);
   await mkdir(dirname(path), { recursive: true });
   await page.screenshot({ path, fullPage: options.fullPage ?? false });
}

/** `capturePage` in a fresh context of a browser the caller owns and closes. */
export async function captureWithBrowser(
   browser: Browser,
   url: string,
   options: CapturePageOptions,
): Promise<CaptureResult> {
   const viewport = parseViewport(options.viewport);
   const zoom = options.zoom ?? 1;
   // Browser zoom is a narrower layout viewport drawn at a higher pixel density.
   const context = await browser.newContext({
      viewport: {
         width: Math.round(viewport.width / zoom),
         height: Math.round(viewport.height / zoom),
      },
      deviceScaleFactor: zoom,
      ...(options.storageStatePath ? { storageState: options.storageStatePath } : {}),
   });
   try {
      const page = await context.newPage();
      page.setDefaultTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      await gotoSettled(page, parseHttpUrl(url).href, {
         timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      await preparePage(page, options);
      const capture = async (): Promise<
         Pick<CaptureResult, 'horizontalOverflowPx' | 'focused'>
      > => {
         await takeScreenshot(page, options);
         return readPageState(page);
      };
      const state = options.textSpacing
         ? await withTextSpacing(page, capture)
         : await capture();
      return {
         file: resolve(options.out),
         url: page.url(),
         title: await page.title(),
         viewport,
         zoom,
         ...state,
      };
   } finally {
      await context.close();
   }
}

/**
 * Loads a page, puts it in the requested condition, and saves a screenshot together with
 * facts about focus and overflow. It is how an auditor gets visual evidence for a narrow
 * viewport, 200 percent zoom, text spacing, a focused control, or an opened state.
 */
export async function capturePage(
   url: string,
   options: CapturePageOptions,
): Promise<CaptureResult> {
   const { browser } = await launchAutomationBrowser();
   try {
      return await captureWithBrowser(browser, url, options);
   } finally {
      await browser.close();
   }
}

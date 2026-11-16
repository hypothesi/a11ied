import type { TextResizeObservation } from '@a11ied/contracts';
import type { Page } from 'playwright';
import type { PageFacts } from './page-fact-types.js';

const DESKTOP = { width: 1280, height: 900 };
const MIN_CLIPPED_HEIGHT = 4;
const PHONE = { width: 320, height: 800 };
const PORTRAIT = { width: 800, height: 1280 };
const SAMPLE_SIZE = 5;
const SETTLE_MS = 300;
const SNIPPET_LENGTH = 100;
const SNIPPET_SHORT = 20;
const TEXT_SPACING_CSS =
   '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';
const ZOOMED = { width: 640, height: 800 };

interface ReflowProbe {
   width: number;
   sample: number;
   snippet: number;
}

function measureReflow(probe: ReflowProbe): { overflowPx: number; wide: string[] } {
   return {
      overflowPx: document.documentElement.scrollWidth - probe.width,
      wide: [...document.querySelectorAll('body *')]
         .filter((element) => element.getBoundingClientRect().right > probe.width + 1)
         .slice(0, probe.sample)
         .map(
            (element) =>
               `${element.tagName}.${String(element.className).slice(0, probe.snippet)}`,
         ),
   };
}

export async function measureViewports(
   page: Page,
   _url?: string,
): Promise<Pick<PageFacts, 'reflow' | 'zoom200OverflowPx' | 'portraitOverflowPx'>> {
   try {
      await page.setViewportSize(PHONE);
      await page.waitForTimeout(SETTLE_MS);
      const reflow = await page.evaluate(measureReflow, {
         width: PHONE.width,
         sample: SAMPLE_SIZE,
         snippet: SNIPPET_SHORT,
      });
      const overflowAt = (width: number): Promise<number> =>
         page.evaluate((target) => document.documentElement.scrollWidth - target, width);
      await page.setViewportSize(ZOOMED);
      await page.waitForTimeout(SETTLE_MS);
      const zoom200OverflowPx = await overflowAt(ZOOMED.width);
      await page.setViewportSize(PORTRAIT);
      const portraitOverflowPx = await overflowAt(PORTRAIT.width);
      return { reflow, zoom200OverflowPx, portraitOverflowPx };
   } finally {
      await page.setViewportSize(DESKTOP);
   }
}

interface ClipProbe {
   minHeight: number;
   sample: number;
   snippet: number;
}

function findClipped(probe: ClipProbe): string[] {
   return [...document.querySelectorAll('p,li,a,button,h1,h2,h3,span,div')]
      .filter(
         (element) =>
            getComputedStyle(element).overflow === 'hidden' &&
            element.clientHeight > probe.minHeight &&
            element.scrollHeight > element.clientHeight + 1 &&
            (element.textContent ?? '').trim().length > 0,
      )
      .slice(0, probe.sample)
      .map((element) => element.outerHTML.slice(0, probe.snippet));
}

export async function measureClippedText(page: Page): Promise<string[]> {
   return page.evaluate(findClipped, {
      minHeight: MIN_CLIPPED_HEIGHT,
      sample: SAMPLE_SIZE,
      snippet: SNIPPET_LENGTH,
   });
}

export async function isTextSpacingApplied(page: Page): Promise<boolean> {
   return page.evaluate(() => {
      const letterFactor = 0.12,
         lineFactor = 1.5,
         paragraphFactor = 2,
         tolerance = 0.1,
         wordFactor = 0.16;
      return [...document.querySelectorAll('html, body, body *')].every((element) => {
         if (!(element instanceof HTMLElement) || !element.textContent?.trim()) {
            return true;
         }
         const style = getComputedStyle(element);
         const size = Number.parseFloat(style.fontSize);
         const letter = Number.parseFloat(style.letterSpacing),
            line = Number.parseFloat(style.lineHeight),
            word = Number.parseFloat(style.wordSpacing);
         const paragraph =
            element.tagName !== 'P' ||
            Number.parseFloat(style.marginBottom) + tolerance >= size * paragraphFactor;
         return (
            line + tolerance >= size * lineFactor &&
            letter + tolerance >= size * letterFactor &&
            word + tolerance >= size * wordFactor &&
            paragraph
         );
      });
   });
}

export async function withTextSpacing<TResult>(
   page: Page,
   operation: () => Promise<TResult>,
): Promise<TResult> {
   const styleHandle = await page.addStyleTag({ content: TEXT_SPACING_CSS });
   try {
      return await operation();
   } finally {
      await styleHandle.evaluate((element: Element) => element.remove());
   }
}

export async function findClippedText(page: Page): Promise<string[]> {
   await page.setViewportSize(DESKTOP);
   return withTextSpacing(page, async () => measureClippedText(page));
}

export interface TextResizeCapture {
   observation: Omit<TextResizeObservation, 'screenshotPath' | 'screenshotDigest'>;
   screenshot: Buffer;
}

/** Apply baseline pixel sizes in one pass so nested rem/em rules cannot compound scaling. */
export async function withTextResize<TResult>(
   page: Page,
   operation: (
      measure: () => Promise<TextResizeCapture['observation']>,
   ) => Promise<TResult>,
): Promise<TResult> {
   const factor = 2;
   const baselines = await page.evaluateHandle(() =>
      [...document.querySelectorAll('html, body, body *')]
         .filter((element): element is HTMLElement => element instanceof HTMLElement)
         .map((element) => {
            const computed = getComputedStyle(element);
            return {
               element,
               style: element.getAttribute('style'),
               fontSize: Number.parseFloat(computed.fontSize),
               lineHeight: computed.lineHeight,
            };
         }),
   );
   try {
      await baselines.evaluate((entries, scale) => {
         for (const { element, fontSize, lineHeight } of entries) {
            element.style.setProperty(
               'font-size',
               `${String(fontSize * scale)}px`,
               'important',
            );
            if (lineHeight.endsWith('px')) {
               element.style.setProperty(
                  'line-height',
                  `${String(Number.parseFloat(lineHeight) * scale)}px`,
                  'important',
               );
            }
         }
      }, factor);
      return await operation(async () => {
         const counts = await baselines.evaluate((entries, scale) => {
            const tolerance = 0.1;
            let verifiedCount = 0;
            const baselineElements = new Set(entries.map((entry) => entry.element));
            let unverifiedCount = [
               ...document.querySelectorAll('html, body, body *'),
            ].filter(
               (element) =>
                  element instanceof HTMLElement && !baselineElements.has(element),
            ).length;
            for (const { element, fontSize: baseline } of entries) {
               if (!element.isConnected) {
                  continue;
               }
               const actual = Number.parseFloat(getComputedStyle(element).fontSize);
               if (baseline > 0 && Math.abs(actual - baseline * scale) <= tolerance) {
                  verifiedCount += 1;
               } else {
                  unverifiedCount += 1;
               }
            }
            return {
               verifiedCount,
               unverifiedCount,
               overflowPx: Math.max(
                  0,
                  document.documentElement.scrollWidth - window.innerWidth,
               ),
            };
         }, factor);
         const clippedText = await measureClippedText(page);
         return { factor, ...counts, clippedText };
      });
   } finally {
      try {
         await baselines.evaluate((entries) => {
            for (const { element, style } of entries) {
               if (style === null) {
                  element.removeAttribute('style');
               } else {
                  element.setAttribute('style', style);
               }
            }
         });
      } finally {
         await baselines.dispose();
      }
   }
}

export async function captureTextResize(page: Page): Promise<TextResizeCapture> {
   return withTextResize(page, async (measure) => {
      const observation = await measure();
      const screenshot = await page.screenshot({ fullPage: true });
      return { observation, screenshot };
   });
}

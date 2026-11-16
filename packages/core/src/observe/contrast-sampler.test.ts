// oxlint-disable id-length
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import {
   computeContrastRatio,
   computeRelativeLuminance,
   parseCssColorToRgba,
   samplePageContrast,
} from './contrast-sampler.js';

const BLACK_LUMINANCE = 0;
const WHITE_LUMINANCE = 1;
const MAX_CONTRAST = 21;
const MIN_CONTRAST = 1;
const HALF_ALPHA = 0.5;
const MID_GRAY_RATIO = 4.54;
const CHANNEL_MAX = 255;
const TRANSITION_DELAY_TEST_MS = 20;
const PRECISION_FOUR = 4;
const EXPECTED_SAMPLE_COUNT = 3;

describe('parseCssColorToRgba', () => {
   it('parses 3-digit and 6-digit hex colors', () => {
      expect(parseCssColorToRgba('#fff')).toEqual({
         r: CHANNEL_MAX,
         g: CHANNEL_MAX,
         b: CHANNEL_MAX,
         a: 1,
      });
      expect(parseCssColorToRgba('#000000')).toEqual({
         r: 0,
         g: 0,
         b: 0,
         a: 1,
      });
      expect(parseCssColorToRgba('#ff0000')).toEqual({
         r: CHANNEL_MAX,
         g: 0,
         b: 0,
         a: 1,
      });
   });

   it('parses hex colors with alpha', () => {
      const parsed = parseCssColorToRgba('#ffffff80');
      expect(parsed?.r).toBe(CHANNEL_MAX);
      expect(parsed?.g).toBe(CHANNEL_MAX);
      expect(parsed?.b).toBe(CHANNEL_MAX);
      expect(parsed?.a).toBeCloseTo(HALF_ALPHA, 1);
   });

   it('parses rgb and rgba strings', () => {
      expect(parseCssColorToRgba('rgb(255, 0, 0)')).toEqual({
         r: CHANNEL_MAX,
         g: 0,
         b: 0,
         a: 1,
      });
      expect(parseCssColorToRgba('rgba(0, 0, 0, 0.5)')).toEqual({
         r: 0,
         g: 0,
         b: 0,
         a: HALF_ALPHA,
      });
   });

   it('parses named colors and transparent', () => {
      expect(parseCssColorToRgba('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
      expect(parseCssColorToRgba('white')).toEqual({
         r: CHANNEL_MAX,
         g: CHANNEL_MAX,
         b: CHANNEL_MAX,
         a: 1,
      });
      expect(parseCssColorToRgba('transparent')).toEqual({
         r: 0,
         g: 0,
         b: 0,
         a: 0,
      });
   });

   it('returns undefined for invalid color strings', () => {
      expect(parseCssColorToRgba('')).toBeUndefined();
      expect(parseCssColorToRgba('not-a-color')).toBeUndefined();
   });
});

describe('computeRelativeLuminance', () => {
   it('computes black as 0 and white as 1', () => {
      expect(computeRelativeLuminance({ r: 0, g: 0, b: 0 })).toBe(BLACK_LUMINANCE);
      expect(
         computeRelativeLuminance({
            r: CHANNEL_MAX,
            g: CHANNEL_MAX,
            b: CHANNEL_MAX,
         }),
      ).toBeCloseTo(WHITE_LUMINANCE, PRECISION_FOUR);
   });
});

describe('computeContrastRatio', () => {
   it('computes 21:1 for black on white', () => {
      expect(computeContrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBe(
         MAX_CONTRAST,
      );
   });

   it('computes 1:1 for identical colors', () => {
      expect(computeContrastRatio('#ffffff', '#ffffff')).toBe(MIN_CONTRAST);
   });

   it('computes approximately 4.54 for #767676 on white', () => {
      expect(computeContrastRatio('#767676', '#ffffff')).toBeCloseTo(MID_GRAY_RATIO, 1);
   });
});

describe('samplePageContrast integration', () => {
   // oxlint-disable-next-line init-declarations
   let browser: Browser | undefined;
   // oxlint-disable-next-line init-declarations
   let page: Page | undefined;

   beforeAll(async () => {
      browser = await chromium.launch({ headless: true });
   });

   afterAll(async () => {
      await browser?.close();
   });

   it('samples button with colon in text and detects focus indicator', async () => {
      if (!browser) {
         return;
      }
      page = await browser.newPage();
      await page.setContent(`
         <!DOCTYPE html>
         <html>
            <head>
               <style>
                  body { background: #ffffff; margin: 0; padding: 20px; }
                  #btn1 {
                     background-color: #000000;
                     color: #ffffff;
                     border: none;
                     padding: 10px 20px;
                     outline: none;
                  }
                  #btn1:focus-visible {
                     outline: 2px solid #0000ff;
                  }
               </style>
            </head>
            <body>
               <button id="btn1">Step 1: Continue</button>
            </body>
         </html>
      `);

      const results = await samplePageContrast(page);
      expect(results).toHaveLength(1);
      const buttonSample = results[0];
      expect(buttonSample?.selector).toBe('#btn1');
      expect(buttonSample?.text).toBe('Step 1: Continue');
      expect(buttonSample?.samples).toHaveLength(EXPECTED_SAMPLE_COUNT);

      const restState = buttonSample?.samples.find((s) => s.state === 'rest');
      expect(restState?.contrastRatio).toBe(MAX_CONTRAST);

      const focusState = buttonSample?.samples.find((s) => s.state === 'focus-visible');
      expect(focusState?.hasVisibleIndicator).toBe(true);

      const isBlurred = await page.evaluate(
         () =>
            document.activeElement === document.body ||
            document.activeElement === document.documentElement,
      );
      expect(isBlurred).toBe(true);
      await page.close();
   });

   it('samples element with hover transition and measures min transition contrast', async () => {
      if (!browser) {
         return;
      }
      page = await browser.newPage();
      await page.setContent(`
         <!DOCTYPE html>
         <html>
            <head>
               <style>
                  body { background: #ffffff; margin: 0; padding: 20px; }
                  .fade-btn {
                     background-color: #000000;
                     color: #ffffff;
                     border: none;
                     padding: 10px 20px;
                     transition: color 150ms ease;
                  }
                  .fade-btn:hover {
                     color: #888888;
                  }
               </style>
            </head>
            <body>
               <button class="fade-btn">Fade Button</button>
            </body>
         </html>
      `);

      const results = await samplePageContrast(page, {
         transitionSampleDelayMs: TRANSITION_DELAY_TEST_MS,
      });
      expect(results).toHaveLength(1);
      const buttonSample = results[0];
      const hoverState = buttonSample?.samples.find((s) => s.state === 'hover');
      expect(hoverState).toBeDefined();
      expect(hoverState?.minTransitionContrastRatio).toBeDefined();

      const isBlurred = await page.evaluate(
         () =>
            document.activeElement === document.body ||
            document.activeElement === document.documentElement,
      );
      expect(isBlurred).toBe(true);
      await page.close();
   });
});

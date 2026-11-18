import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Page } from 'playwright';
import { CliUsageError } from '../errors/cli-errors.js';

/** Context kept around the element so a reader can see where it sits on the page. */
const CONTEXT_PX = 48;
/** A taller crop is cut off; the element's top is what a reader needs to find it. */
const MAX_CROP_HEIGHT_PX = 1600;
/** A small control is shown with at least this much of the page around it. */
const MIN_CROP_WIDTH_PX = 480;
const MIN_CROP_HEIGHT_PX = 200;
const CENTER_DIVISOR = 2;
const OUTLINE_PX = 3;
/** The ring is drawn outside the element on both sides. */
const OUTLINE_SIDES = 2;
/** A white halo keeps the ring visible on backgrounds close to its color. */
const HALO = '0 0 0 2px #ffffff';
const OUTLINE_COLOR = '#d6008f';
const FRAME_ID = 'a11ied-evidence-frame';

interface Box {
   left: number;
   top: number;
   width: number;
   height: number;
}

/** Converts the element's viewport box to document coordinates. */
async function getDocumentBox(page: Page, selector: string): Promise<Box> {
   const locator = page.locator(selector).first();
   if ((await locator.count()) === 0) {
      throw new CliUsageError(
         'element-not-found',
         `No element matches "${selector}" on ${page.url()}.`,
      );
   }
   await locator.scrollIntoViewIfNeeded();
   const box = await locator.boundingBox();
   if (!box || box.width === 0 || box.height === 0) {
      throw new CliUsageError(
         'element-not-visible',
         `"${selector}" matches an element with no size on ${page.url()}. Open the state that shows it first.`,
      );
   }
   const scroll = await page.evaluate(() => ({ left: scrollX, top: scrollY }));
   return {
      left: box.x + scroll.left,
      top: box.y + scroll.top,
      width: box.width,
      height: box.height,
   };
}

/**
 * Adds a transparent frame over the area to capture, with a ring around the element
 * inside it. Photographing the frame element captures the page beneath it, so the crop
 * needs no coordinates of its own.
 */
async function drawFrame(page: Page, input: { box: Box; frame: Box }): Promise<void> {
   await page.evaluate(
      ({ box, frame, id, ringWidth, sides, color, halo }) => {
         const area = document.createElement('div');
         const ring = document.createElement('div');
         area.id = id;
         Object.assign(area.style, {
            position: 'absolute',
            left: `${String(frame.left)}px`,
            top: `${String(frame.top)}px`,
            width: `${String(frame.width)}px`,
            height: `${String(frame.height)}px`,
            zIndex: '2147483647',
            pointerEvents: 'none',
         });
         Object.assign(ring.style, {
            position: 'absolute',
            left: `${String(box.left - frame.left - ringWidth)}px`,
            top: `${String(box.top - frame.top - ringWidth)}px`,
            width: `${String(box.width + ringWidth * sides)}px`,
            height: `${String(box.height + ringWidth * sides)}px`,
            boxSizing: 'border-box',
            border: `${String(ringWidth)}px solid ${color}`,
            boxShadow: halo,
         });
         area.append(ring);
         document.documentElement.append(area);
      },
      {
         ...input,
         id: FRAME_ID,
         ringWidth: OUTLINE_PX,
         sides: OUTLINE_SIDES,
         color: OUTLINE_COLOR,
         halo: HALO,
      },
   );
}

async function removeFrame(page: Page): Promise<void> {
   await page.evaluate((id) => {
      document.querySelector(`#${id}`)?.remove();
   }, FRAME_ID);
}

/** Centers a span of `size` on the element's span and keeps it inside the document. */
function fitSpan(input: { start: number; length: number; size: number; limit: number }): {
   start: number;
   length: number;
} {
   const length = Math.min(input.size, input.limit);
   const centered = input.start - (length - input.length) / CENTER_DIVISOR;
   const start = Math.min(Math.max(0, centered), Math.max(0, input.limit - length));
   return { start, length };
}

/**
 * The area to photograph: the element with a margin, at least large enough that a small
 * control shows the text around it, and no taller than the cap.
 */
async function getFrame(page: Page, box: Box): Promise<Box> {
   const size = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
   }));
   const across = fitSpan({
      start: box.left,
      length: box.width,
      size: Math.max(box.width + CONTEXT_PX * OUTLINE_SIDES, MIN_CROP_WIDTH_PX),
      limit: size.width,
   });
   const down = fitSpan({
      start: box.top,
      length: box.height,
      size: Math.min(
         Math.max(box.height + CONTEXT_PX * OUTLINE_SIDES, MIN_CROP_HEIGHT_PX),
         MAX_CROP_HEIGHT_PX,
      ),
      limit: size.height,
   });
   // A crop shorter than the element keeps its top, where a reader looks first.
   const top = box.height > down.length ? Math.max(0, box.top - CONTEXT_PX) : down.start;
   return { left: across.start, top, width: across.length, height: down.length };
}

/**
 * Saves a picture of one element as it appears in the page: outlined, with some of the
 * page around it, and including any part that overflows the viewport. Works for elements
 * inside open shadow roots, since Playwright selectors reach into them.
 */
export async function screenshotElement(
   page: Page,
   selector: string,
   out: string,
): Promise<string> {
   const path = resolve(out);
   await mkdir(dirname(path), { recursive: true });
   const box = await getDocumentBox(page, selector);
   await drawFrame(page, { box, frame: await getFrame(page, box) });
   try {
      await page.locator(`#${FRAME_ID}`).screenshot({ path });
   } finally {
      await removeFrame(page);
   }
   return path;
}

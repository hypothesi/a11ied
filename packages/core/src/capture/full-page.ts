import { runInOrder } from '@a11ied/guidepup';
import type { Page } from 'playwright';
import type { PNG } from 'pngjs';
import { writeAtomic } from '../files/store.js';

/**
 * Chromium draws a screenshot on one GPU surface. Past this many device pixels it fills
 * the rest of the picture with copies of the top of the page.
 */
const MAX_SURFACE_DEVICE_PX = 16_384;
/**
 * Tile heights are multiples of four CSS pixels, so a tile also ends on a whole device
 * pixel at zooms such as 1.25, 1.5, and 2.5.
 */
const TILE_ALIGNMENT_CSS_PX = 4;
const RGBA_BYTES = 4;
/** The mode Playwright gives a screenshot it saves itself, so both kinds match. */
const SCREENSHOT_FILE_MODE = 0o644;

interface FullPageMetrics {
   width: number;
   height: number;
   /** Device pixels per CSS pixel. */
   scale: number;
}

/** The document size Playwright itself uses for a full-page screenshot. */
async function readFullPageMetrics(page: Page): Promise<FullPageMetrics> {
   return page.evaluate(() => {
      const { body, documentElement: root } = document;
      return {
         width: Math.max(
            body.scrollWidth,
            root.scrollWidth,
            body.offsetWidth,
            root.offsetWidth,
            body.clientWidth,
            root.clientWidth,
         ),
         height: Math.max(
            body.scrollHeight,
            root.scrollHeight,
            body.offsetHeight,
            root.offsetHeight,
            body.clientHeight,
            root.clientHeight,
         ),
         scale: devicePixelRatio,
      };
   });
}

function getTileHeight(scale: number): number {
   const height = Math.floor(MAX_SURFACE_DEVICE_PX / scale);
   return Math.max(TILE_ALIGNMENT_CSS_PX, height - (height % TILE_ALIGNMENT_CSS_PX));
}

async function captureTiles(
   PngImage: typeof PNG,
   page: Page,
   metrics: FullPageMetrics,
): Promise<PNG[]> {
   const tileHeight = getTileHeight(metrics.scale);
   const tiles: PNG[] = [],
      tops = Array.from(
         { length: Math.ceil(metrics.height / tileHeight) },
         (_unused, index) => index * tileHeight,
      );
   await runInOrder(tops, async (top) => {
      // oxlint-disable-next-line id-length -- Playwright names the clip origin x and y
      const origin = { x: 0, y: top };
      const clip = {
         ...origin,
         width: metrics.width,
         height: Math.min(tileHeight, metrics.height - top),
      };
      tiles.push(PngImage.sync.read(await page.screenshot({ fullPage: true, clip })));
   });
   return tiles;
}

function stackTiles(PngImage: typeof PNG, tiles: readonly PNG[]): Buffer {
   const height = tiles.reduce((memo, tile) => memo + tile.height, 0),
      width = tiles[0]?.width ?? 0;
   const picture = new PngImage({ width, height });
   let row = 0;
   for (const tile of tiles) {
      tile.data.copy(picture.data, row * width * RGBA_BYTES);
      row += tile.height;
   }
   return PngImage.sync.write(picture);
}

/**
 * Saves a picture of the whole scrollable page. A page too tall for one browser surface
 * is captured in tiles and joined, since the browser would otherwise repeat the top of
 * the page down the rest of the picture.
 */
export async function screenshotFullPage(page: Page, path: string): Promise<void> {
   const metrics = await readFullPageMetrics(page);
   if (metrics.height * metrics.scale <= MAX_SURFACE_DEVICE_PX) {
      await page.screenshot({ path, fullPage: true });
      return;
   }
   const { PNG: PngImage } = await import('pngjs');
   const tiles = await captureTiles(PngImage, page, metrics);
   await writeAtomic(path, stackTiles(PngImage, tiles), {
      mode: SCREENSHOT_FILE_MODE,
   });
}

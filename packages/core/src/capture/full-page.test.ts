import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
   cleanupTempRoots,
   createTempRoot,
   createTestServer,
} from '../../../cli/src/testing/fixtures.js';
import { capturePage } from './runtime.js';

/** `tall-page.html` stacks this many bands, each a different color. */
const BAND_COUNT = 20;
const BAND_HEIGHT_PX = 1000;
const RGBA_BYTES = 4;
const CENTER_DIVISOR = 2;
const timeoutMs = 30_000;

const server = createTestServer(),
   tempRoots: string[] = [];

beforeAll(async () => {
   await server.start();
});

afterAll(async () => {
   await server.stop();
});

afterEach(async () => {
   await cleanupTempRoots(tempRoots);
});

/** The color at the center of each band, as it appears in the saved picture. */
function readBandColors(file: string, scale: number): string[] {
   const picture = PNG.sync.read(readFileSync(file));
   const column = Math.floor(picture.width / CENTER_DIVISOR);
   return Array.from({ length: BAND_COUNT }, (_unused, band) => {
      const row = (band * BAND_HEIGHT_PX + BAND_HEIGHT_PX / CENTER_DIVISOR) * scale;
      const offset = (row * picture.width + column) * RGBA_BYTES;
      return picture.data.subarray(offset, offset + RGBA_BYTES).join(',');
   });
}

async function captureTallPage(options: {
   viewport: string;
   zoom?: number;
}): Promise<string> {
   const out = resolve(await createTempRoot(tempRoots), 'tall.png');
   await capturePage(`${server.getBaseUrl()}/tall-page.html`, {
      ...options,
      out,
      fullPage: true,
   });
   return out;
}

describe('full-page capture of a page taller than one browser surface', () => {
   it(
      'shows every part of the page once instead of repeating the top',
      async () => {
         const file = await captureTallPage({ viewport: '320x800' });

         const colors = readBandColors(file, 1);

         expect(PNG.sync.read(readFileSync(file)).height).toBe(
            BAND_COUNT * BAND_HEIGHT_PX,
         );
         expect(new Set(colors).size).toBe(BAND_COUNT);
      },
      timeoutMs,
   );

   it(
      'shows every part of the page once at 200 percent zoom',
      async () => {
         const zoom = 2;
         const file = await captureTallPage({ viewport: '640x800', zoom });

         const colors = readBandColors(file, zoom);

         expect(PNG.sync.read(readFileSync(file)).height).toBe(
            BAND_COUNT * BAND_HEIGHT_PX * zoom,
         );
         expect(new Set(colors).size).toBe(BAND_COUNT);
      },
      timeoutMs,
   );
});

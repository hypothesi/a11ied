import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import type { Browser, Page } from 'playwright';
import {
   conditionCaptureRequestSchema,
   conditionCaptureSchema,
   type ConditionCapture,
   type ConditionCaptureRequest,
   type ObservationBundle,
} from '@a11ied/contracts';
import {
   canonicalizeObservationURL,
   getContentDigest,
   getObservationDigest,
   validateObservationReceipt,
} from './cache.js';
import {
   getObservationEnvironment,
   openObservationPage,
   replayStateSetup,
} from './collector.js';
import { renameAtomicPath, writeAtomic } from './files-store.js';
import { collectVirtualSrSummary } from './virtual-sr.js';
import {
   measureClippedText,
   isTextSpacingApplied,
   withTextResize,
   withTextSpacing,
} from './probe/page-layout.js';
import { validateConditionCapture } from './condition-capture-store.js';
import { TAB_STOP_SCRIPT } from './probe/page-script.js';

const REFLOW_WIDTH = 320;
const REFLOW_HEIGHT = 800;
const SETTLE_MS = 300;
const focusSchema = z.record(z.string(), z.unknown()).nullable();

type ResizeMeasurement = NonNullable<ConditionCapture['observation']['textResize']>;
type CaptureImage = ConditionCapture['screenshots']['before'];

async function saveImage(
   page: Page,
   directory: string,
   path: string,
): Promise<CaptureImage> {
   const bytes = await page.screenshot({
      fullPage: path === 'before.png' || path === 'after.png',
   });
   await writeAtomic(join(directory, path), bytes, { overwrite: false });
   return { path, digest: getContentDigest(bytes) };
}

function assertTarget(page: Page, bundle: ObservationBundle): void {
   const expected = bundle.navigation?.observedURL ?? bundle.targetUrl;
   if (canonicalizeObservationURL(page.url()) !== canonicalizeObservationURL(expected)) {
      throw new Error(
         'Condition capture left its registered state target. Register a separate state or journey.',
      );
   }
}

async function installReadOnlyCapture(
   page: Page,
   bundle: ObservationBundle,
): Promise<ConditionCapture['blockedRequests']> {
   const blocked: ConditionCapture['blockedRequests'] = [];
   await page.context().route('**/*', async (route) => {
      const request = route.request();
      const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(request.method());
      const differentPage =
         request.isNavigationRequest() &&
         request.frame().parentFrame() === null &&
         canonicalizeObservationURL(request.url()) !==
            canonicalizeObservationURL(bundle.targetUrl);
      if (unsafeMethod || differentPage) {
         blocked.push({ method: request.method(), url: request.url() });
         await route.abort('blockedbyclient');
         return;
      }
      await route.continue();
   });
   await page.context().addInitScript(() => {
      globalThis.addEventListener('submit', (event) => event.preventDefault(), true);
   });
   return blocked;
}

async function measureCondition(
   page: Page,
   measureResize?: () => Promise<ResizeMeasurement>,
   condition: ConditionCaptureRequest['condition'] = 'default',
): Promise<ConditionCapture['observation']> {
   const dimensions = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      contentWidth: document.documentElement.scrollWidth,
      overflowPx: Math.max(
         0,
         document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
   }));
   const clippedText = await measureClippedText(page);
   const textResize = measureResize ? await measureResize() : undefined;
   const spacingVerified =
      condition === 'textSpacing' ? await isTextSpacingApplied(page) : undefined;
   return {
      ...dimensions,
      clippedText,
      conditionVerified: true,
      ...(textResize ? { textResize } : {}),
      ...(spacingVerified === undefined ? {} : { spacingVerified }),
   };
}

async function captureActionSequence(
   input: Parameters<typeof captureActions>[0],
   index = 0,
): Promise<ConditionCapture['actionTrace']> {
   const { page, bundle, directory } = input;
   const action = input.request.actions[index];
   if (!action) {
      return [];
   }
   const [entry] = await replayStateSetup(page, [action]);
   if (!entry) {
      throw new Error('Condition action did not produce a receipt.');
   }
   await page.waitForTimeout(SETTLE_MS);
   assertTarget(page, bundle);
   const focus = focusSchema.parse(await page.evaluate(TAB_STOP_SCRIPT));
   const focusedSpeech = focus ? await page.locator(':focus').ariaSnapshot() : '';
   const screenshot = await saveImage(page, directory, `steps/${String(index)}.png`);
   const observation = await measureCondition(
      page,
      input.measureResize,
      input.request.condition,
   );
   const url = page.url();
   const remaining = await captureActionSequence(input, index + 1);
   return [
      { ...entry, index, screenshot, focus, focusedSpeech, url, observation },
      ...remaining,
   ];
}

async function captureActions(input: {
   page: Page;
   directory: string;
   bundle: ObservationBundle;
   request: ConditionCaptureRequest;
   measureResize?: (() => Promise<ResizeMeasurement>) | undefined;
}): Promise<
   Pick<
      ConditionCapture,
      'actionTrace' | 'observation' | 'transcript' | 'screenshots' | 'baselineCondition'
   >
> {
   const { page, directory, bundle, request } = input;
   const baselineCondition = await measureCondition(
      page,
      input.measureResize,
      request.condition,
   );
   const before = await saveImage(page, directory, 'before.png');
   const actionTrace = await captureActionSequence(input);
   const observation = await measureCondition(
      page,
      input.measureResize,
      request.condition,
   );
   if (
      observation.textResize &&
      (observation.textResize.verifiedCount === 0 ||
         observation.textResize.unverifiedCount > 0)
   ) {
      throw new Error('Text resizing could not be verified for all current content.');
   }
   const { summary: transcript } = await collectVirtualSrSummary(page);
   const after = await saveImage(page, directory, 'after.png');
   assertTarget(page, bundle);
   return {
      actionTrace,
      observation,
      baselineCondition,
      transcript,
      screenshots: { before, after },
   };
}

async function captureUnderCondition(
   input: Parameters<typeof captureActions>[0],
): ReturnType<typeof captureActions> {
   if (input.request.condition === 'text200') {
      return withTextResize(input.page, async (measureResize) =>
         captureActions({ ...input, measureResize }),
      );
   }
   if (input.request.condition === 'textSpacing') {
      return withTextSpacing(input.page, async () => captureActions(input));
   }
   if (input.request.condition === 'reflow320') {
      await input.page.setViewportSize({ width: REFLOW_WIDTH, height: REFLOW_HEIGHT });
      await input.page.waitForTimeout(SETTLE_MS);
   }
   return captureActions(input);
}

export async function captureCondition(input: {
   browser: Browser;
   cacheRoot: string;
   bundle: ObservationBundle;
   request: ConditionCaptureRequest;
}): Promise<{ id: string; path: string; capture: ConditionCapture }> {
   const { bundle, cacheRoot, browser } = input;
   const request = conditionCaptureRequestSchema.parse(input.request);
   await validateObservationReceipt({ cacheRoot, bundle });
   const directory = join(cacheRoot, 'condition-captures', 'attempts', randomUUID());
   const startedAt = new Date().toISOString();
   await writeAtomic(join(directory, 'request.json'), {
      request,
      rootFingerprint: bundle.fingerprint,
      startedAt,
   });
   const page = await openObservationPage({
      browser,
      cacheRoot,
      targetUrl: bundle.targetUrl,
      excludedSelectors: bundle.excludedSelectors,
   });
   try {
      const blockedRequests = await installReadOnlyCapture(page, bundle);
      await page.goto(bundle.targetUrl, { waitUntil: 'domcontentloaded' });
      await replayStateSetup(page, bundle.setup);
      assertTarget(page, bundle);
      const baselineTreeHash = getContentDigest(
         await page.locator('body').ariaSnapshot(),
      );
      if (baselineTreeHash !== bundle.treeHash) {
         throw new Error(
            'Baseline semantic tree changed. Collect a fresh root observation before capturing conditions.',
         );
      }
      const observed = await captureUnderCondition({ page, directory, bundle, request });
      const capture = conditionCaptureSchema.parse({
         producer: 'condition-1',
         rootFingerprint: bundle.fingerprint,
         rootDigest: getObservationDigest(bundle),
         stateId: bundle.stateId,
         targetUrl: bundle.targetUrl,
         setup: bundle.setup,
         excludedSelectors: bundle.excludedSelectors ?? [],
         baselineTreeHash,
         startedAt,
         capturedAt: new Date().toISOString(),
         environment: getObservationEnvironment(browser),
         request,
         ...observed,
         blockedRequests,
         limitations: [
            'Virtual DOM evidence does not establish native screen-reader behavior.',
            'Form submission and non-idempotent HTTP requests are blocked; captures are state-local.',
         ],
      });
      validateConditionCapture(capture, bundle);
      const id = getContentDigest(JSON.stringify(capture));
      await writeAtomic(join(directory, 'capture.json'), capture, { overwrite: false });
      const path = join('condition-captures', id, 'capture.json');
      await renameAtomicPath(directory, join(cacheRoot, 'condition-captures', id));
      return { id, path, capture };
   } catch (error) {
      await writeAtomic(join(directory, 'failure.json'), {
         message: error instanceof Error ? error.message : String(error),
         at: new Date().toISOString(),
      });
      throw error;
   } finally {
      await page.context().close();
   }
}

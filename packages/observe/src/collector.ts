import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import {
   observationBundleSchema,
   type ObservationBundle,
   type AuditEnvironment,
   type ObservationHeuristics,
   type StateSetupAction,
   type StateSetupTraceEntry,
   type ViewportObservation,
} from '@a11ied/contracts';
import axe from 'axe-core';
import {
   computeObservationFingerprint,
   getObservationCacheDir,
   readCachedObservationBundle,
   getObservationDigest,
   getContentDigest,
   validateObservationReceipt,
   OBSERVATION_COLLECTOR_VERSION,
   canonicalizeObservationURL,
   writeCachedObservationBundle,
} from './cache.js';
import { samplePageContrast } from './contrast-sampler.js';
import { collectVirtualSrSummary, discoverInteractiveCandidates } from './virtual-sr.js';
import {
   collectLoadedPageFacts,
   openProbePage,
   type PageFacts,
} from './probe/page-facts.js';
import { captureTextResize, type TextResizeCapture } from './probe/page-layout.js';
import { writeAtomic } from './files-store.js';

const DEFAULT_WAIT_TIMEOUT = 5000;

export interface ObserveStateInput {
   browser: Browser;
   targetUrl: string;
   stateId?: string;
   setup?: readonly StateSetupAction[];
   cacheRoot: string;
   excludedSelectors?: readonly string[] | undefined;
   useCache?: boolean;
}

export class AxeBuilderInstance {
   private readonly page: Page;
   private tags: string[] = [];

   public constructor({ page }: { page: Page }) {
      this.page = page;
   }

   public withTags(tags: string[]): this {
      this.tags = tags;
      return this;
   }

   public async analyze(): Promise<Record<string, unknown>> {
      await this.page.evaluate(axe.source);
      return this.page.evaluate((tags) => {
         const axeRef = (
            globalThis as unknown as {
               axe: {
                  run: (ctx: unknown, opts: unknown) => Promise<Record<string, unknown>>;
               };
            }
         ).axe;
         return axeRef.run(document, {
            runOnly: { type: 'tag', values: tags },
         });
      }, this.tags);
   }
}

export type AxeBuilder = AxeBuilderInstance;
export const AxeBuilder = function createAxeBuilder(
   this: unknown,
   options: { page: Page },
): AxeBuilderInstance {
   return new AxeBuilderInstance(options);
} as unknown as {
   new (options: { page: Page }): AxeBuilderInstance;
   (options: { page: Page }): AxeBuilderInstance;
};

export async function replayStateSetup(
   page: Page,
   setup: readonly StateSetupAction[],
): Promise<StateSetupTraceEntry[]> {
   const trace: StateSetupTraceEntry[] = [];
   let lastTimestamp = 0;

   for (let index = 0; index < setup.length; index += 1) {
      const step = setup[index];
      if (!step) {
         continue;
      }
      const startedAt = Math.max(Date.now(), lastTimestamp + 1);
      lastTimestamp = startedAt;
      const startTime = performance.now();

      switch (step.action) {
         case 'click': {
            // oxlint-disable-next-line no-await-in-loop -- sequential action replay
            await page.locator(step.selector).first().click();
            break;
         }
         case 'press': {
            // oxlint-disable-next-line no-await-in-loop -- sequential action replay
            await (step.selector
               ? page.locator(step.selector).first().press(step.key)
               : page.keyboard.press(step.key));
            break;
         }
         case 'fill': {
            // oxlint-disable-next-line no-await-in-loop -- sequential action replay
            await page.locator(step.selector).first().fill(step.value);
            break;
         }
         case 'hover': {
            // oxlint-disable-next-line no-await-in-loop -- sequential action replay
            await page.locator(step.selector).first().hover();
            break;
         }
         case 'focus': {
            // oxlint-disable-next-line no-await-in-loop -- sequential action replay
            await page.locator(step.selector).first().focus();
            break;
         }
         case 'waitForSelector': {
            // oxlint-disable-next-line no-await-in-loop -- sequential action replay
            await page
               .locator(step.selector)
               .first()
               .waitFor({
                  state: 'visible',
                  timeout: step.timeoutMs ?? DEFAULT_WAIT_TIMEOUT,
               });
            break;
         }
         default: {
            break;
         }
      }

      const durationMs = Math.max(0, Math.round(performance.now() - startTime));
      trace.push({
         index,
         action: step,
         at: new Date(startedAt).toISOString(),
         durationMs,
      });
   }

   return trace;
}

export async function computeObservationHeuristics(
   facts: PageFacts,
   page: Page,
): Promise<ObservationHeuristics> {
   const hasSiteNavigation =
      (facts.landmarks?.nav ?? 0) > 0 || (facts.navLinks?.length ?? 0) > 0;

   const domGestures = await page.evaluate(() =>
      Boolean(document.querySelector('[data-gesture], [ontouchstart], [onpointermove]')),
   );
   const hasMultipointGesture = (facts.sliders?.length ?? 0) > 0 || domGestures;

   const hasDraggable = await page.evaluate(() =>
      Boolean(
         document.querySelector(
            '[draggable="true"], [aria-grabbed], [class*="drag"], [class*="sortable"]',
         ),
      ),
   );

   return {
      hasSiteNavigation,
      hasMultipointGesture,
      hasDraggable,
   };
}

function computeTargetKey(
   targetUrl: string,
   setup?: readonly StateSetupAction[],
   stateId = 'initial',
): string {
   const canonicalUrl = canonicalizeObservationURL(targetUrl);
   const canonicalSetup = JSON.stringify(setup ?? []);
   return getContentDigest(`${canonicalUrl}|${canonicalSetup}|${stateId}`);
}

function buildViewportObservation(facts: PageFacts): ViewportObservation {
   return {
      desktop: { width: 1280, height: 900 },
      reflow320: {
         overflowPx: facts.reflow.overflowPx,
         wideElements: facts.reflow.wide,
      },
      zoom200: { overflowPx: facts.zoom200OverflowPx },
      portrait: { overflowPx: facts.portraitOverflowPx },
      textSpacingClipped: facts.textSpacingClipped,
   };
}

async function checkCachePointer(
   cacheRoot: string,
   key: string,
): Promise<ObservationBundle | undefined> {
   const pointerPath = join(cacheRoot, 'cache', 'by-key', `${key}.json`);
   try {
      const raw = await readFile(pointerPath, 'utf8');
      const parsed = JSON.parse(raw) as { fingerprint?: string };
      if (parsed.fingerprint) {
         const cached = await readCachedObservationBundle(cacheRoot, parsed.fingerprint);
         if (cached) {
            await validateObservationReceipt({ cacheRoot, bundle: cached });
            return cached;
         }
      }
   } catch {
      // Cache miss or unreadable pointer
   }
   return undefined;
}

async function persistObservation(
   cacheRoot: string,
   key: string,
   bundle: ObservationBundle,
): Promise<ObservationBundle> {
   const validated = observationBundleSchema.parse(bundle);
   await writeCachedObservationBundle(cacheRoot, validated);
   await writeAtomic(
      join(cacheRoot, 'cache', validated.fingerprint, 'capture-receipt.json'),
      {
         collectorVersion: OBSERVATION_COLLECTOR_VERSION,
         digest: getObservationDigest(validated),
         stateId: validated.stateId,
         capturedAt: validated.capturedAt,
         environmentId: 'playwright-virtual',
      },
   );
   await writeAtomic(join(cacheRoot, 'cache', 'by-key', `${key}.json`), {
      fingerprint: validated.fingerprint,
   });

   return validated;
}

export function getObservationEnvironment(browser: Browser): AuditEnvironment {
   return {
      environmentId: 'playwright-virtual',
      platform: 'virtual',
      os: process.platform,
      browser: browser.version(),
      capabilities: [
         'dom',
         'rendered-ui',
         'keyboard',
         'screen-reader',
         'speech',
         'pointer',
         'screenshot',
         'viewport',
         'style-overrides',
         'measurement',
      ],
      limitations: [
         'Virtual DOM observations do not establish native VoiceOver or NVDA behavior.',
      ],
   };
}

function getScopedTargetKey(input: ObserveStateInput): string {
   return getContentDigest(
      JSON.stringify([
         computeTargetKey(input.targetUrl, input.setup, input.stateId),
         [...(input.excludedSelectors ?? [])].toSorted(),
      ]),
   );
}

export async function openObservationPage(input: ObserveStateInput): Promise<Page> {
   const page = await openProbePage(input.browser);
   const selectors = input.excludedSelectors ?? [];
   if (selectors.length > 0) {
      await page.addInitScript(
         (excluded) => {
            const removeExcludedRoots = (): void => {
               for (const root of document.querySelectorAll(excluded.join(','))) {
                  root.remove();
               }
            };
            const observer = new MutationObserver(removeExcludedRoots);
            observer.observe(document, { childList: true, subtree: true });
            removeExcludedRoots();
         },
         [...selectors],
      );
   }
   return page;
}

async function writeObservationScreenshots(input: {
   cacheRoot: string;
   fingerprint: string;
   fullPageBuffer: Buffer;
   resize: TextResizeCapture;
}): Promise<Pick<ObservationBundle, 'screenshots' | 'textResize'>> {
   const fullPagePath = join(
      getObservationCacheDir(input.cacheRoot, input.fingerprint),
      'full-page.png',
   );
   const resizedPath = join(
      getObservationCacheDir(input.cacheRoot, input.fingerprint),
      'text-resize.png',
   );
   await Promise.all([
      writeAtomic(fullPagePath, input.fullPageBuffer),
      writeAtomic(resizedPath, input.resize.screenshot),
   ]);
   return {
      screenshots: {
         fullPagePath,
         fullPageDigest: getContentDigest(input.fullPageBuffer),
         elements: {},
      },
      textResize: {
         ...input.resize.observation,
         screenshotPath: resizedPath,
         screenshotDigest: getContentDigest(input.resize.screenshot),
      },
   };
}

async function navigateReviewState(
   page: Page,
   input: ObserveStateInput,
): Promise<{
   actionTrace: StateSetupTraceEntry[];
   navigation: NonNullable<ObservationBundle['navigation']>;
}> {
   const response = await page.goto(input.targetUrl, { waitUntil: 'networkidle' });
   const loadedURL = page.url();
   const actionTrace = await replayStateSetup(page, input.setup ?? []);
   return {
      actionTrace,
      navigation: {
         requestedURL: input.targetUrl,
         loadedURL,
         observedURL: page.url(),
         ...(response ? { status: response.status() } : {}),
         frameURLs: page.frames().map((frame) => frame.url()),
      },
   };
}

function getCollectionTrace({
   stateId,
   readAt,
   factsAt,
   contrastAt,
   contrastCount,
}: {
   stateId: string;
   readAt: string;
   factsAt: string;
   contrastAt: string;
   contrastCount: number;
}): NonNullable<ObservationBundle['collectionTrace']> {
   return [
      {
         operation: 'virtual-dom-read',
         status: 'completed',
         capturedAt: readAt,
         stateId,
         limitations: [
            'Virtual DOM reading is bounded to the observed document; embedded documents require separate assessment.',
         ],
      },
      {
         operation: 'keyboard-layout-observation',
         status: 'truncated',
         capturedAt: factsAt,
         stateId,
         limitations: [
            'Forward tab walk is capped at 120 presses; component activation and escape paths are untested.',
         ],
      },
      {
         operation: 'native-screen-reader',
         status: 'unsupported',
         capturedAt: readAt,
         stateId,
         limitations: [
            'Virtual DOM reading does not observe native accessibility APIs or VoiceOver/NVDA behavior.',
         ],
      },
      {
         operation: 'site-process-observation',
         status: 'unsupported',
         capturedAt: readAt,
         stateId,
         limitations: [
            'A single state does not establish site-wide consistency or a complete user process.',
         ],
      },
      {
         operation: 'contrast-sampling',
         status: contrastCount ? 'truncated' : 'absent',
         capturedAt: contrastAt,
         stateId,
         limitations: [
            'At most 40 candidate elements; gradients, images, generated content and transition timing require review.',
         ],
      },
   ];
}

export async function observeState(
   input: ObserveStateInput,
): Promise<{ bundle: ObservationBundle; fromCache: boolean }> {
   const { browser, targetUrl, cacheRoot, setup } = input;
   const excludedSelectors = [...(input.excludedSelectors ?? [])].toSorted();
   const key = getScopedTargetKey(input);

   if (input.useCache !== false) {
      const cached = await checkCachePointer(cacheRoot, key);
      if (cached) {
         return { bundle: cached, fromCache: true };
      }
   }

   const page = await openObservationPage(input);
   try {
      const { actionTrace, navigation } = await navigateReviewState(page, input);

      const virtualSr = await collectVirtualSrSummary(page);
      const readAt = new Date().toISOString();
      const interactiveCandidates = await discoverInteractiveCandidates(page);
      const treeHash = getContentDigest(virtualSr.yaml);

      const axeResult = await new AxeBuilder({ page })
         .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
         .analyze();

      const fullPageBuffer = await page.screenshot({ fullPage: true });

      const facts = await collectLoadedPageFacts(page, navigation.observedURL);
      const factsAt = new Date().toISOString();
      const contrast = await samplePageContrast(page);
      const contrastAt = new Date().toISOString();
      const heuristics = await computeObservationHeuristics(facts, page);
      const resize = await captureTextResize(page),
         viewports = buildViewportObservation(facts);

      const fingerprint = computeObservationFingerprint({
         stateId: input.stateId ?? 'initial',
         treeHash,
         observationHash: getContentDigest(
            JSON.stringify({
               excludedSelectors,
               navigation,
               textResize: resize.observation,
               resizedScreenshotDigest: getContentDigest(resize.screenshot),
               facts,
               contrast,
               viewports,
               heuristics,
               actionTrace,
               readAt,
               factsAt,
               contrastAt,
               axeResult,
               interactiveCandidates,
               screenshotDigest: getContentDigest(fullPageBuffer),
               collectorVersion: OBSERVATION_COLLECTOR_VERSION,
               browser: browser.version(),
            }),
         ),
         targetUrl,
         ...(setup ? { setup } : {}),
      });
      const { screenshots, textResize } = await writeObservationScreenshots({
         cacheRoot,
         fingerprint,
         fullPageBuffer,
         resize,
      });
      const bundle: ObservationBundle = {
         excludedSelectors,
         navigation,
         textResize,
         version: '1',
         collectionTrace: getCollectionTrace({
            stateId: input.stateId ?? 'initial',
            readAt,
            factsAt,
            contrastAt,
            contrastCount: contrast.length,
         }),
         environment: getObservationEnvironment(browser),
         fingerprint,
         targetUrl,
         stateId: input.stateId ?? 'initial',
         capturedAt: contrastAt,
         setup: [...(setup ?? [])],
         actionTrace,
         treeHash,
         axe: axeResult,
         tree: { yaml: virtualSr.yaml, nodes: virtualSr.nodes },
         facts: facts as unknown as Record<string, unknown>,
         heuristics,
         contrast,
         viewports,
         screenshots,
         transcript: virtualSr.summary,
         interactiveCandidates,
      };

      const validated = await persistObservation(cacheRoot, key, bundle);

      return { bundle: validated, fromCache: false };
   } catch (error) {
      await writeAtomic(join(cacheRoot, 'cache', 'failures', `${randomUUID()}.json`), {
         collectorVersion: OBSERVATION_COLLECTOR_VERSION,
         targetUrl,
         stateId: input.stateId ?? 'initial',
         setup: setup ?? [],
         status: 'failed',
         capturedAt: new Date().toISOString(),
         error: error instanceof Error ? error.message : String(error),
      });
      throw error;
   } finally {
      await page.context().close();
   }
}

import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import {
   afterAll,
   afterEach,
   beforeAll,
   describe,
   expect,
   it,
   vi,
   type MockInstance,
} from 'vitest';
import { observationReceiptSchema } from '@a11ied/contracts';
import * as observation from '@a11ied/observe';
import { getObservationCacheDir, getObservationDigest } from '@a11ied/observe';
import {
   readReviewRunState,
   writeReviewRunState,
   review,
   browserReview,
} from '@a11ied/review';
import * as runtime from '../browser/runtime.js';

const HTTP_OK = 200;
const AFTER_SETUP_LAUNCHES = 2;
const AFTER_RECOVERY_LAUNCHES = 3;
const MISSING_SELECTOR_TIMEOUT_MS = 50;
const BACKGROUND_CAPTURE_TIMEOUT_MS = 15_000;
const browsers: Browser[] = [];
const tempDirs: string[] = [];
const requests: string[] = [];
let targetUrl = '';
const requestGate: {
   release?: (() => void) | undefined;
   started?: (() => void) | undefined;
} = {};
const server = createServer((request, response) => {
   requests.push(`${request.method} ${request.url}`);
   if (request.url === '/delayed') {
      requestGate.release = (): void => {
         response.writeHead(HTTP_OK, { 'Content-Type': 'text/html' });
         response.end(
            '<!doctype html><html lang="en"><title>Delayed</title><main><h1>Delayed</h1></main></html>',
         );
      };
      requestGate.started?.();
      return;
   }
   response.writeHead(HTTP_OK, { 'Content-Type': 'text/html' });
   response.end(
      [
         '<!doctype html><html lang="en"><title>Review transport</title><main>',
         '<h1>Review transport</h1><button type="button" id="toggle"',
         ' onclick="document.querySelector(\'#details\').hidden=false">Open details</button>',
         '<p id="details" hidden>Revealed details</p>',
         '<form method="post" action="/submit"><input aria-label="Message">',
         '<button type="submit">Send message</button></form>',
         '<a href="/unregistered">Unregistered page</a></main></html>',
         request.url === '/busy-state' ? '<script>void fetch("/delayed")</script>' : '',
      ].join(''),
   );
});

beforeAll(async () => {
   await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
   });
   const address = server.address();
   if (!address || typeof address === 'string') {
      throw new Error('Expected a local server address');
   }
   targetUrl = `http://127.0.0.1:${address.port}/`;
});

afterAll(async () => {
   await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
   });
});

afterEach(async () => {
   requestGate.release?.();
   requestGate.release = undefined;
   requestGate.started = undefined;
   const connected = browsers.map((browser) => browser.isConnected());
   await Promise.all(browsers.splice(0).map((browser) => browser.close()));
   vi.restoreAllMocks();
   requests.splice(0);
   await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
   );

   expect(connected.every((value) => !value)).toBe(true);
});

async function createRunDir(): Promise<string> {
   const dir = await mkdtemp(join(tmpdir(), 'a11ied-browser-review-'));
   tempDirs.push(dir);
   return dir;
}

function trackBrowserLaunches(): MockInstance<typeof runtime.launchAutomationBrowser> {
   const launch = runtime.launchAutomationBrowser;
   return vi
      .spyOn(runtime, 'launchAutomationBrowser')
      .mockImplementation(async (...args) => {
         const result = await launch(...args);
         browsers.push(result.browser);
         return result;
      });
}

describe('browser review lifecycle', () => {
   it('collects genuine receipts, caches reads, refreshes setup, and does not submit or crawl', async () => {
      const launch = trackBrowserLaunches();
      const runDir = await createRunDir();
      await browserReview.start({ runDir, target: targetUrl, criterionIds: ['2.4.2'] });
      const observed = await browserReview.observe({ runDir, stateId: 'initial' });
      if (!observed.bundle) {
         throw new Error('Expected a collected bundle');
      }
      const receiptPath = join(
         getObservationCacheDir(runDir, observed.fingerprint),
         'capture-receipt.json',
      );
      const receipt = observationReceiptSchema.parse(
         JSON.parse(await readFile(receiptPath, 'utf8')),
      );

      expect(observed.bundle.facts.title).toBe('Review transport');
      expect(receipt.digest).toBe(getObservationDigest(observed.bundle));
      expect(launch).toHaveBeenCalledTimes(1);
      expect(
         await browserReview.observe({ runDir, stateId: 'initial', slice: 'facts' }),
      ).toMatchObject({
         fingerprint: observed.fingerprint,
         data: { title: 'Review transport' },
      });
      expect(launch).toHaveBeenCalledTimes(1);

      const refreshed = await browserReview.observe({
         runDir,
         stateId: 'initial',
         setup: [{ action: 'click', selector: '#toggle' }],
      });

      expect(refreshed.fingerprint).not.toBe(observed.fingerprint);
      expect(refreshed.bundle?.tree.yaml).toContain('Revealed details');
      expect(launch).toHaveBeenCalledTimes(AFTER_SETUP_LAUNCHES);
      expect(requests.some((request) => request.startsWith('POST'))).toBe(false);
      expect(requests).not.toContain('GET /unregistered');
      const run = await readReviewRunState(runDir);

      expect(run.states).toHaveLength(1);
   });

   it('closes a failed collection and permits a later successful refresh', async () => {
      const launch = trackBrowserLaunches();
      const runDir = await createRunDir();
      await browserReview.start({ runDir, target: targetUrl, criterionIds: ['2.4.2'] });
      const before = await browserReview.observe({ runDir, stateId: 'initial' });

      await expect(
         browserReview.observe({
            runDir,
            stateId: 'initial',
            setup: [
               {
                  action: 'waitForSelector',
                  selector: '#missing',
                  timeoutMs: MISSING_SELECTOR_TIMEOUT_MS,
               },
            ],
         }),
      ).rejects.toThrow();
      expect(await browserReview.observe({ runDir, stateId: 'initial' })).toEqual(before);

      const recovered = await browserReview.observe({
         runDir,
         stateId: 'initial',
         refresh: true,
      });

      const failures = await readdir(join(runDir, 'cache', 'failures'));

      expect(failures).toHaveLength(1);
      expect(
         JSON.parse(
            await readFile(join(runDir, 'cache', 'failures', failures[0] ?? ''), 'utf8'),
         ).status,
      ).toBe('failed');
      expect(recovered.bundle?.facts.title).toBe('Review transport');
      expect(launch).toHaveBeenCalledTimes(AFTER_RECOVERY_LAUNCHES);
   });
});

describe('browser review scope', () => {
   it('skips excluded states without launching and refuses to refresh them', async () => {
      const launch = trackBrowserLaunches();
      const runDir = await createRunDir();
      await browserReview.start({
         runDir,
         states: [
            {
               stateId: 'excluded',
               targetUrl,
               excluded: true,
               exclusionReason: 'Outside scope',
            },
            { stateId: 'policy-excluded', targetUrl, excluded: false },
         ],
         exclusions: [
            {
               ruleId: 'private-state',
               stateIds: ['policy-excluded'],
               reason: 'Private state',
            },
         ],
         criterionIds: ['2.4.2'],
      });

      await expect(
         browserReview.observe({ runDir, stateId: 'excluded', refresh: true }),
      ).rejects.toThrow('Excluded');
      await expect(
         browserReview.observe({ runDir, stateId: 'policy-excluded', refresh: true }),
      ).rejects.toThrow('Excluded');
      await expect(
         review.observe({
            runDir,
            stateId: 'policy-excluded',
            capture: { condition: 'default', actions: [] },
         }),
      ).rejects.toThrow('Excluded');
      expect(launch).not.toHaveBeenCalled();
      expect(requests).toEqual([]);
   });

   it('runs the combined workflow and rejects target changes or missing targets', async () => {
      trackBrowserLaunches();
      const runDir = await createRunDir();
      const result = await browserReview.run({
         runDir,
         target: targetUrl,
         criterionIds: ['2.4.2'],
         draftReport: false,
      });

      expect(result.startResult.statesCount).toBe(1);
      await expect(
         browserReview.observe({
            runDir,
            stateId: 'initial',
            targetUrl: `${targetUrl}other`,
            refresh: true,
         }),
      ).rejects.toThrow('different state ID');
      await expect(
         browserReview.observe({ runDir, stateId: 'unknown', refresh: true }),
      ).rejects.toThrow('target URL');
   });
});

describe('in-flight observation recovery', () => {
   it('rejects a capture when scope changes while navigation is in flight', async () => {
      trackBrowserLaunches();
      const runDir = await createRunDir();
      await browserReview.start({ runDir, target: targetUrl, criterionIds: ['2.4.2'] });
      const started = new Promise<void>((resolve) => {
         requestGate.started = resolve;
      });
      const collection = browserReview.observe({
         runDir,
         stateId: 'delayed',
         targetUrl: `${targetUrl}delayed`,
         refresh: true,
      });
      await started;
      const state = await readReviewRunState(runDir);
      state.states.push({
         stateId: 'delayed',
         targetUrl: `${targetUrl}delayed`,
         excluded: true,
         exclusionReason: 'Scope changed during collection',
      });
      await writeReviewRunState(runDir, state);
      requestGate.release?.();
      requestGate.release = undefined;

      await expect(collection).rejects.toThrow('changed during collection');
      const current = await readReviewRunState(runDir);

      expect(
         current.states.find((item) => item.stateId === 'delayed')?.fingerprint,
      ).toBeUndefined();
   });
});

describe('condition capture through the browser facade', () => {
   it(
      'captures the matching state while an unrelated background request remains open',
      async () => {
         trackBrowserLaunches();
         const runDir = await createRunDir();
         requestGate.started = (): void => {
            requestGate.release?.();
            requestGate.release = undefined;
         };
         await browserReview.start({
            runDir,
            target: `${targetUrl}busy-state`,
            criterionIds: ['2.4.2'],
         });
         const before = await readReviewRunState(runDir);
         let backgroundRequested = false;
         requestGate.started = (): void => {
            backgroundRequested = true;
         };
         try {
            const captured = await browserReview.observe({
               runDir,
               stateId: 'initial',
               capture: { condition: 'default', actions: [] },
            });

            expect(backgroundRequested).toStrictEqual(true);
            expect(requestGate.release).toBeDefined();
            expect(captured.fingerprint).toStrictEqual(before.states[0]?.fingerprint);
            expect(captured.data).toMatchObject({ capture: { producer: 'condition-1' } });
            expect(await readReviewRunState(runDir)).to.eql(before);
         } finally {
            requestGate.release?.();
            requestGate.release = undefined;
            requestGate.started = undefined;
         }
      },
      BACKGROUND_CAPTURE_TIMEOUT_MS,
   );

   it('launches and closes capture browsers, preserves run identity, and blocks submissions', async () => {
      const launch = trackBrowserLaunches();
      const runDir = await createRunDir();
      await browserReview.start({ runDir, target: targetUrl, criterionIds: ['1.4.10'] });
      const before = await readReviewRunState(runDir);
      const captured = await browserReview.observe({
         runDir,
         stateId: 'initial',
         capture: {
            condition: 'reflow320',
            actions: [{ action: 'click', selector: 'button[type="submit"]' }],
         },
      });

      expect(captured.data).toMatchObject({
         capture: { observation: { width: 320 }, request: { condition: 'reflow320' } },
      });
      expect(await readReviewRunState(runDir)).toEqual(before);
      expect(launch).toHaveBeenCalledTimes(AFTER_SETUP_LAUNCHES);
      expect(requests.some((request) => request.startsWith('POST'))).toStrictEqual(false);
      await expect(
         browserReview.observe({
            runDir,
            stateId: 'initial',
            refresh: true,
            capture: { condition: 'default', actions: [] },
         }),
      ).rejects.toThrow('cannot be combined');
      await expect(
         browserReview.observe({
            runDir,
            stateId: 'initial',
            slice: 'facts',
            capture: { condition: 'default', actions: [] },
         }),
      ).rejects.toThrow('unsupported');
   });
});

describe('condition capture concurrency', () => {
   it.each(['unrelated-progress', 'current-state', 'exclusions'] as const)(
      'checks only relevant revisions for %s',
      async (change) => {
         trackBrowserLaunches();
         const runDir = await createRunDir();
         await browserReview.start({
            runDir,
            target: targetUrl,
            criterionIds: ['1.4.10'],
         });
         const capture = observation.captureCondition;
         vi.spyOn(observation, 'captureCondition').mockImplementation(async (input) => {
            const result = await capture(input);
            const current = await readReviewRunState(runDir);
            current.updatedAt = new Date().toISOString();
            if (change === 'unrelated-progress') {
               current.states.push({
                  stateId: 'another-state',
                  targetUrl: `${targetUrl}other`,
               });
            }
            if (change === 'current-state') {
               const initial = current.states.find(
                  (state) => state.stateId === 'initial',
               );
               if (initial) {
                  initial.fingerprint = 'changed';
               }
            }
            if (change === 'exclusions') {
               current.exclusions = [
                  {
                     ruleId: 'new-scope',
                     selectors: ['main'],
                     reason: 'Changed during capture',
                  },
               ];
            }
            await writeReviewRunState(runDir, current);
            return result;
         });
         const pending = browserReview.observe({
            runDir,
            stateId: 'initial',
            capture: { condition: 'reflow320', actions: [] },
         });

         if (change === 'unrelated-progress') {
            await expect(pending).resolves.toMatchObject({
               data: { capture: { stateId: 'initial' } },
            });
            return;
         }
         await expect(pending).rejects.toThrow('changed during collection');
      },
   );
});

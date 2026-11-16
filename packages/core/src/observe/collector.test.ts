import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchAutomationBrowser } from '../browser/runtime.js';
import {
   verdictSchema,
   type ConditionCapture,
   type ObservationBundle,
} from '@a11ied/contracts';
import {
   admitReviewVerdict,
   createBundleRef,
   isAcceptedVerdict,
   scoreObservationBundle,
   recordVerdict,
   readReviewVerdicts,
   scoreCriterionVerdict,
} from '@a11ied/verdict';
import {
   createCompletedAssessment,
   seedObservationFixture,
} from '../review/review-test-fixtures.js';
import {
   captureTextResize,
   captureCondition,
   readConditionCapture,
   validateConditionCapture,
   resolveConditionEvidence,
   getContentDigest,
   getObservationDigest,
   OBSERVATION_COLLECTOR_VERSION,
} from '@a11ied/observe';
import { observeState } from './collector.js';

const HTTP_OK = 200;
const HTTP_REDIRECT = 302;
const TEXT_SCALE_FACTOR = 2;
const AGENT_TIER = 2;
const HTTP_NOT_FOUND = 404;
const TEST_TIMEOUT_MS = 30_000;

interface TestFixture {
   browser?: Browser;
   server?: Server;
   serverUrl?: string;
}

const fixture: TestFixture = {};
const requestCounts = new Map<string, number>();
const tempDirs: string[] = [];

beforeAll(async () => {
   const launched = await launchAutomationBrowser();
   fixture.browser = launched.browser;

   const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const count = requestCounts.get(url.pathname) ?? 0;
      requestCounts.set(url.pathname, count + 1);

      if (url.pathname === '/excluded-root') {
         res.writeHead(HTTP_OK, { 'Content-Type': 'text/html' });
         res.end(
            '<!doctype html><html lang="en"><title>Scoped page</title><main><h1>Included content</h1></main><excluded-widget><button>Excluded control</button></excluded-widget><script>setTimeout(() => document.body.insertAdjacentHTML("beforeend", "<excluded-widget><button>Recreated excluded control</button></excluded-widget>"), 20)</script></html>',
         );
         return;
      }

      if (url.pathname === '/missing-name') {
         res.writeHead(HTTP_OK, { 'Content-Type': 'text/html' });
         res.end(
            '<!doctype html><html lang="en"><title>Missing name</title><main><button></button></main></html>',
         );
         return;
      }

      if (url.pathname === '/redirect') {
         res.writeHead(HTTP_REDIRECT, { Location: '/single-load' });
         res.end();
         return;
      }

      if (url.pathname === '/single-load') {
         res.writeHead(HTTP_OK, { 'Content-Type': 'text/html; charset=utf-8' });
         res.end(`<!doctype html>
<html lang="en">
<head>
   <meta charset="utf-8">
   <title>Single Load Test</title>
   <style>
      a.skip { position: absolute; top: -100px; }
      a.skip:focus { top: 0; }
   </style>
</head>
<body>
   <a href="#content" class="skip">Skip to main</a>
   <main id="content">
      <h1>Single Load Page</h1>
      <p>Testing single navigation fact collection.</p>
   </main>
</body>
</html>`);
         return;
      }

      if (url.pathname === '/interactive') {
         res.writeHead(HTTP_OK, { 'Content-Type': 'text/html; charset=utf-8' });
         res.end(`<!doctype html>
<html lang="en">
<head>
   <meta charset="utf-8">
   <title>Interactive Menu Test</title>
</head>
<body>
   <button id="menu-toggle" aria-expanded="false" onclick="
      const isOpen = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!isOpen));
      document.getElementById('drawer').style.display = isOpen ? 'none' : 'block';
   ">Menu</button>
   <nav id="drawer" style="display: none;">
      <a href="/secret">Secret Link</a>
   </nav>
</body>
</html>`);
         return;
      }

      res.writeHead(HTTP_NOT_FOUND);
      res.end('Not found');
   });

   fixture.server = server;
   await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
   });

   const address = server.address();
   if (typeof address === 'object' && address !== null) {
      fixture.serverUrl = `http://127.0.0.1:${String(address.port)}`;
   } else {
      throw new Error('Server address not available');
   }
});

afterAll(async () => {
   fixture.server?.close();
   await fixture.browser?.close();
});

afterEach(async () => {
   requestCounts.clear();
   await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
   );
});

async function createTempCacheRoot(): Promise<string> {
   const dir = await mkdtemp(join(tmpdir(), 'a11ied-collector-test-'));
   tempDirs.push(dir);
   return dir;
}

describe('observeState collector', () => {
   it('verifies text enlargement and restores root and nested inline styles', async () => {
      if (!fixture.browser) {
         throw new Error('Fixture not initialized');
      }
      const page = await fixture.browser.newPage();
      try {
         await page.setContent(
            '<html style="font-size:16px"><body><h1 style="font-size:1.5rem;line-height:2rem">Resize</h1></body></html>',
         );
         const before = await page.locator('h1').getAttribute('style');
         const resized = await captureTextResize(page);

         expect(resized.observation.factor).toBe(TEXT_SCALE_FACTOR);
         expect(resized.observation.verifiedCount).toBeGreaterThan(0);
         expect(resized.observation.unverifiedCount).toBe(0);
         expect(resized.screenshot.length).toBeGreaterThan(0);
         expect(await page.locator('h1').getAttribute('style')).toBe(before);
         expect(await page.locator('html').getAttribute('style')).toBe('font-size:16px');
      } finally {
         await page.close();
      }
   });

   it('records requested and resolved navigation identity separately', async () => {
      if (!fixture.browser || !fixture.serverUrl) {
         throw new Error('Fixture not initialized');
      }
      const cacheRoot = await createTempCacheRoot();
      const result = await observeState({
         browser: fixture.browser,
         targetUrl: `${fixture.serverUrl}/redirect`,
         cacheRoot,
      });

      expect(result.bundle.navigation).toMatchObject({
         requestedURL: `${fixture.serverUrl}/redirect`,
         loadedURL: `${fixture.serverUrl}/single-load`,
         observedURL: `${fixture.serverUrl}/single-load`,
      });
      expect(result.bundle.facts.url).toBe(`${fixture.serverUrl}/single-load`);
      expect(result.bundle.textResize?.verifiedCount).toBeGreaterThan(0);
      expect(
         result.bundle.collectionTrace?.find(
            (entry) => entry.operation === 'keyboard-layout-observation',
         )?.status,
      ).toBe('truncated');
   });

   it('measures cold collection and equivalent cache reads without expanding judgments', async () => {
      if (!fixture.browser || !fixture.serverUrl) {
         throw new Error('Fixture not initialized');
      }
      const cacheRoot = await createTempCacheRoot();
      const targetUrl = `${fixture.serverUrl}/single-load`;
      const coldStarted = performance.now();
      const cold = await observeState({ browser: fixture.browser, targetUrl, cacheRoot });
      const coldMilliseconds = performance.now() - coldStarted;
      const warmStarted = performance.now();
      const warm = await observeState({ browser: fixture.browser, targetUrl, cacheRoot });
      const warmMilliseconds = performance.now() - warmStarted;
      await writeFile(
         join(tmpdir(), 'a11ied-collection-benchmark.json'),
         JSON.stringify({
            collector: OBSERVATION_COLLECTOR_VERSION,
            coldMilliseconds,
            warmMilliseconds,
            requests: requestCounts.get('/single-load'),
            coldFingerprint: cold.bundle.fingerprint,
            warmFingerprint: warm.bundle.fingerprint,
            judgmentReuse: false,
            interpretation:
               'One local equivalent-state sample; cache reads are not fresh observations or reused judgments.',
         }),
      );

      expect(requestCounts.get('/single-load')).toBe(1);
      expect(warm.fromCache).toBe(true);
      expect(scoreObservationBundle(warm.bundle)).toEqual(
         scoreObservationBundle(cold.bundle),
      );
   });
});

describe('receipt-bound media absence', () => {
   it('admits an actual complete media inventory as media evidence', async () => {
      if (!fixture.browser || !fixture.serverUrl) {
         throw new Error('Fixture not initialized');
      }
      const runDir = await createTempCacheRoot();
      const { bundle } = await observeState({
         browser: fixture.browser,
         targetUrl: `${fixture.serverUrl}/single-load`,
         cacheRoot: runDir,
      });
      const proof = createCompletedAssessment('1.2.1', bundle);
      const evidence = [
         ...proof.evidence,
         {
            ...createBundleRef(bundle, 'facts'),
            path: 'bundle.json#facts.mediaInventory',
         },
      ];
      const proposal = verdictSchema.parse({
         ...proof,
         id: 'actual-media-absence',
         stateId: bundle.stateId,
         criterionId: '1.2.1',
         outcome: 'inapplicable',
         method: 'agent-judgment',
         tier: AGENT_TIER,
         confidence: 0.95,
         rationale: 'The complete observed document has no media or uninspected trees.',
         repro: ['Inspect actual media inventory'],
         recordedAt: bundle.capturedAt,
         evidence,
         assessment: {
            version: proof.assessment?.version,
            actions: proof.assessment?.actions.map((action) => ({
               index: action.index,
               outcome: 'inapplicable',
               observation: 'No media is present; this media action is inapplicable.',
               evidence,
            })),
         },
      });
      const accepted = await admitReviewVerdict({
         runDir,
         scope: {
            states: [
               {
                  stateId: bundle.stateId,
                  targetUrl: bundle.targetUrl,
                  fingerprint: bundle.fingerprint,
               },
            ],
            criterionIds: ['1.2.1'],
            exclusions: [],
         },
         verdict: proposal,
      });

      expect(accepted.outcome).toBe('inapplicable');
      expect(isAcceptedVerdict(accepted)).toBe(true);
   });
});

describe('excluded collection roots', () => {
   it('removes excluded roots before reading controls and keeps recreated roots excluded', async () => {
      if (!fixture.browser || !fixture.serverUrl) {
         throw new Error('Fixture not initialized');
      }
      const cacheRoot = await createTempCacheRoot();
      const { bundle } = await observeState({
         browser: fixture.browser,
         targetUrl: `${fixture.serverUrl}/excluded-root`,
         cacheRoot,
         excludedSelectors: ['excluded-widget'],
      });

      expect(bundle.excludedSelectors).toEqual(['excluded-widget']);
      expect(bundle.tree.yaml).toContain('Included content');
      expect(bundle.tree.yaml).not.toContain('Excluded control');
      expect(bundle.tree.yaml).not.toContain('Recreated excluded');
      expect(bundle.transcript.formControls).toEqual([]);
   });
});

describe('collector evidence and cache', () => {
   it('admits a deterministic failure from a real unnamed-button capture', async () => {
      if (!fixture.browser || !fixture.serverUrl) {
         throw new Error('Fixture not initialized');
      }
      const runDir = await createTempCacheRoot();
      const { bundle } = await observeState({
         browser: fixture.browser,
         targetUrl: `${fixture.serverUrl}/missing-name`,
         cacheRoot: runDir,
      });
      const proposed = scoreCriterionVerdict(bundle, '4.1.2');
      const accepted = await admitReviewVerdict({
         runDir,
         scope: {
            states: [
               {
                  stateId: bundle.stateId,
                  targetUrl: bundle.targetUrl,
                  fingerprint: bundle.fingerprint,
               },
            ],
            criterionIds: ['4.1.2'],
            exclusions: [],
         },
         verdict: proposed,
      });

      expect(accepted.outcome).toBe('failed');
      expect(accepted.method).toBe('axe');
      expect(isAcceptedVerdict(accepted)).toBe(true);
   });

   it(
      'admits supported procedure evidence from a genuine browser capture',
      async () => {
         if (!fixture.browser || !fixture.serverUrl) {
            throw new Error('Fixture not initialized');
         }
         const runDir = await createTempCacheRoot();
         const { bundle } = await observeState({
            browser: fixture.browser,
            targetUrl: `${fixture.serverUrl}/single-load`,
            cacheRoot: runDir,
         });
         const verdict = verdictSchema.parse({
            ...createCompletedAssessment('1.3.2', bundle),
            id: 'browser-proof',
            criterionId: '1.3.2',
            stateId: bundle.stateId,
            tier: AGENT_TIER,
            outcome: 'passed',
            confidence: 0.9,
            method: 'agent-judgment',
            rationale:
               'The single-column fixture places its heading before its explanatory paragraph in virtual reading order.',
            repro: ['Read the single-load fixture'],
            recordedAt: bundle.capturedAt,
         });
         const accepted = await admitReviewVerdict({
            runDir,
            scope: {
               states: [
                  {
                     stateId: bundle.stateId,
                     targetUrl: bundle.targetUrl,
                     fingerprint: bundle.fingerprint,
                  },
               ],
               criterionIds: ['1.3.2'],
               exclusions: [],
            },
            verdict,
         });

         expect(isAcceptedVerdict(accepted)).toStrictEqual(true);
         expect(
            bundle.collectionTrace?.some((step) => step.operation === 'virtual-dom-read'),
         ).toStrictEqual(true);
      },
      TEST_TIMEOUT_MS,
   );
});

describe('observeState collection and caching', () => {
   it(
      'runs on a single page navigation on cold cache and hits warm cache with 0 requests (FR-1 & FR-3)',
      async () => {
         if (!fixture.browser || !fixture.serverUrl) {
            throw new Error('Fixture not initialized');
         }
         const cacheRoot = await createTempCacheRoot();
         const targetUrl = `${fixture.serverUrl}/single-load`;

         // Cold cache run
         const coldResult = await observeState({
            browser: fixture.browser,
            targetUrl,
            cacheRoot,
         });

         expect(coldResult.fromCache).toBe(false);
         expect(coldResult.bundle.targetUrl).toBe(targetUrl);
         expect(requestCounts.get('/single-load')).toBe(1);

         // Warm cache run
         const warmResult = await observeState({
            browser: fixture.browser,
            targetUrl,
            cacheRoot,
         });

         expect(warmResult.fromCache).toBe(true);
         expect(warmResult.bundle.fingerprint).toBe(coldResult.bundle.fingerprint);
         // Zero additional requests on warm cache
         expect(requestCounts.get('/single-load')).toBe(1);
      },
      TEST_TIMEOUT_MS,
   );

   it(
      'isolates interactive state setup replay and captures dynamic DOM (5qp)',
      async () => {
         if (!fixture.browser || !fixture.serverUrl) {
            throw new Error('Fixture not initialized');
         }
         const cacheRoot = await createTempCacheRoot();
         const targetUrl = `${fixture.serverUrl}/interactive`;

         // Initial state without setup
         const initialResult = await observeState({
            browser: fixture.browser,
            targetUrl,
            stateId: 'initial',
            setup: [],
            cacheRoot,
         });

         // Interactive state with click setup
         const clickedResult = await observeState({
            browser: fixture.browser,
            targetUrl,
            stateId: 'menu-expanded',
            setup: [{ action: 'click', selector: '#menu-toggle' }],
            cacheRoot,
         });

         expect(clickedResult.fromCache).toBe(false);
         expect(clickedResult.bundle.fingerprint).not.toBe(
            initialResult.bundle.fingerprint,
         );

         // Verify interactive link is in clicked bundle's transcript & facts
         expect(clickedResult.bundle.transcript.links).toContain('Secret Link');
         const clickedLinks = clickedResult.bundle.facts.links as Array<{
            text: string;
         }>;
         expect(clickedLinks.some((link) => link.text === 'Secret Link')).toBe(true);

         // Initial state must not have secret link
         expect(initialResult.bundle.transcript.links).not.toContain('Secret Link');
         const initialLinks = initialResult.bundle.facts.links as Array<{
            text: string;
         }>;
         expect(initialLinks.some((link) => link.text === 'Secret Link')).toBe(false);
      },
      TEST_TIMEOUT_MS,
   );

   it(
      'verifies mutation hygiene and viewport/screenshot artifacts (FR-2)',
      async () => {
         if (!fixture.browser || !fixture.serverUrl) {
            throw new Error('Fixture not initialized');
         }
         const cacheRoot = await createTempCacheRoot();
         const targetUrl = `${fixture.serverUrl}/single-load`;

         const result = await observeState({
            browser: fixture.browser,
            targetUrl,
            cacheRoot,
         });

         const { bundle } = result;
         expect(bundle.viewports.desktop).toEqual({ width: 1280, height: 900 });
         expect(bundle.viewports.reflow320).toBeDefined();
         expect(Array.isArray(bundle.viewports.reflow320.wideElements)).toBe(true);
         expect(Array.isArray(bundle.viewports.textSpacingClipped)).toBe(true);

         // Baseline screenshot file exists on disk
         const screenshotStat = await stat(bundle.screenshots.fullPagePath);
         expect(screenshotStat.isFile()).toBe(true);
         expect(screenshotStat.size).toBeGreaterThan(0);
      },
      TEST_TIMEOUT_MS,
   );
});

async function createConditionFixture(): Promise<{
   runDir: string;
   bundle: ObservationBundle;
   browser: Browser;
}> {
   if (!fixture.browser || !fixture.serverUrl) {
      throw new Error('Fixture not initialized');
   }
   const runDir = await createTempCacheRoot();
   const { bundle } = await observeState({
      browser: fixture.browser,
      targetUrl: `${fixture.serverUrl}/interactive`,
      cacheRoot: runDir,
   });
   return { runDir, bundle, browser: fixture.browser };
}

describe('State-bound condition captures', () => {
   it.each(['text200', 'reflow320', 'textSpacing'] as const)(
      'records actual %s interactions without replacing the immutable root',
      async (condition) => {
         const { runDir, bundle, browser } = await createConditionFixture();
         const rootPath = join(runDir, 'cache', bundle.fingerprint, 'bundle.json');
         const before = await readFile(rootPath, 'utf8');
         const result = await captureCondition({
            browser,
            cacheRoot: runDir,
            bundle,
            request: {
               condition,
               actions: [
                  { action: 'focus', selector: '#menu-toggle' },
                  { action: 'press', key: 'Enter' },
               ],
            },
         });
         const capture = await readConditionCapture({ runDir, bundle, id: result.id });

         expect(await readFile(rootPath, 'utf8')).toStrictEqual(before);
         expect(capture.transcript.links).toContain('Secret Link');
         expect(capture.actionTrace.map((entry) => entry.index)).toEqual([0, 1]);
         expect(capture.actionTrace[0]?.focusedSpeech).toContain('Menu');
         expect(capture.request.condition).toStrictEqual(condition);
         expect(capture.observation.conditionVerified).toStrictEqual(true);
      },
   );

   it('admits captured evidence, then reopens the judgment when a step screenshot is altered', async () => {
      const { runDir, bundle, browser } = await createConditionFixture();
      const result = await captureCondition({
         browser,
         cacheRoot: runDir,
         bundle,
         request: {
            condition: 'text200',
            actions: [{ action: 'press', selector: '#menu-toggle', key: 'Enter' }],
         },
      });
      const proof = createCompletedAssessment('1.4.4', bundle);
      const rootRef = createBundleRef(bundle, 'facts');
      const evidence = [
         'capture.json#observation',
         'capture.json#actionTrace',
         'after.png',
      ].map((path) => ({
         fingerprint: rootRef.fingerprint,
         digest: rootRef.digest,
         path: `condition-captures/${result.id}/${path}`,
      }));
      const verdict = verdictSchema.parse({
         ...proof,
         id: 'condition-proof',
         criterionId: '1.4.4',
         stateId: bundle.stateId,
         outcome: 'passed',
         method: 'agent-judgment',
         tier: AGENT_TIER,
         confidence: 0.9,
         rationale: 'Fixture menu remains readable and can be opened with doubled text.',
         recordedAt: result.capture.capturedAt,
         repro: ['Enlarge text and operate the fixture menu'],
         evidence,
         assessment: {
            version: proof.assessment?.version,
            actions: proof.assessment?.actions.map((entry) => ({
               index: entry.index,
               outcome: entry.outcome,
               observation: entry.observation,
               evidence,
            })),
         },
      });
      const scope = {
         states: [
            {
               stateId: bundle.stateId,
               targetUrl: bundle.targetUrl,
               fingerprint: bundle.fingerprint,
            },
         ],
         criterionIds: ['1.4.4'] as const,
         exclusions: [],
      };
      const accepted = await admitReviewVerdict({ runDir, scope, verdict });

      expect(isAcceptedVerdict(accepted)).toStrictEqual(true);
      await recordVerdict(runDir, accepted);
      await writeFile(
         join(runDir, 'condition-captures', result.id, 'steps', '0.png'),
         'altered',
      );
      const revalidated = await readReviewVerdicts(runDir, scope);

      expect(revalidated[0]?.outcome).toStrictEqual('needsReview');

      await expect(admitReviewVerdict({ runDir, scope, verdict })).rejects.toThrow(
         'altered',
      );
   });
});

describe('Condition capture rejection', () => {
   it('preserves failed attempts when the actual baseline tree differs', async () => {
      const { runDir, bundle, browser } = await createConditionFixture();
      bundle.treeHash = getContentDigest('different baseline');
      await seedObservationFixture(runDir, bundle);

      await expect(
         captureCondition({
            browser,
            cacheRoot: runDir,
            bundle,
            request: { condition: 'default', actions: [] },
         }),
      ).rejects.toThrow('Baseline semantic tree changed');
      const attempts = await readdir(join(runDir, 'condition-captures', 'attempts'));
      const failure = await readFile(
         join(
            runDir,
            'condition-captures',
            'attempts',
            attempts[0] ?? '',
            'failure.json',
         ),
         'utf8',
      );

      expect(failure).toContain('Baseline semantic tree changed');
   });

   it('rejects unregistered sections, altered capture content and stale root data', async () => {
      const { runDir, bundle, browser } = await createConditionFixture();
      const result = await captureCondition({
         browser,
         cacheRoot: runDir,
         bundle,
         request: { condition: 'default', actions: [] },
      });
      const capturePath = join(runDir, result.path);
      await expect(
         resolveConditionEvidence({
            runDir,
            bundle,
            file: capturePath,
            fragment: 'invented',
            captures: new Map(),
         }),
      ).rejects.toThrow('Unsupported condition capture');
      const raw = await readFile(capturePath, 'utf8');
      await writeFile(capturePath, raw.replace('condition-1', 'condition-2'));

      await expect(
         readConditionCapture({ runDir, bundle, id: result.id }),
      ).rejects.toThrow();
      await writeFile(capturePath, raw);
      bundle.facts.changed = true;

      await expect(
         readConditionCapture({ runDir, bundle, id: result.id }),
      ).rejects.toThrow();
      expect(getObservationDigest(bundle)).not.toStrictEqual(result.capture.rootDigest);
   });

   it('refuses to navigate to another state through an interaction capture', async () => {
      const { runDir, bundle, browser } = await createConditionFixture();

      await expect(
         captureCondition({
            browser,
            cacheRoot: runDir,
            bundle,
            request: {
               condition: 'default',
               actions: [
                  { action: 'press', selector: '#menu-toggle', key: 'Enter' },
                  { action: 'click', selector: '#drawer a' },
               ],
            },
         }),
      ).rejects.toThrow();
      expect(requestCounts.get('/secret') ?? 0).toStrictEqual(0);
   });
});

const captureMutations: { name: string; mutate: (capture: ConditionCapture) => void }[] =
   [
      {
         name: 'state',
         mutate: (capture) => {
            capture.stateId = 'different';
         },
      },
      {
         name: 'target',
         mutate: (capture) => {
            capture.targetUrl = 'https://other.example/';
         },
      },
      {
         name: 'setup',
         mutate: (capture) => {
            capture.setup.push({ action: 'press', key: 'Tab' });
         },
      },
      {
         name: 'exclusions',
         mutate: (capture) => {
            capture.excludedSelectors.push('main');
         },
      },
      {
         name: 'digest',
         mutate: (capture) => {
            capture.rootDigest = getContentDigest('stale');
         },
      },
      {
         name: 'tree',
         mutate: (capture) => {
            capture.baselineTreeHash = getContentDigest('stale');
         },
      },
      {
         name: 'trace',
         mutate: (capture) => {
            capture.actionTrace = [];
         },
      },
      {
         name: 'mode',
         mutate: (capture) => {
            capture.request.condition = 'text200';
         },
      },
      {
         name: 'step mode',
         mutate: (capture) => {
            capture.request.condition = 'reflow320';
         },
      },
   ];

describe('Condition capture bindings', () => {
   it('rejects mismatched scope, incomplete actions and unverified conditions', async () => {
      const { runDir, bundle, browser } = await createConditionFixture();
      const { capture } = await captureCondition({
         browser,
         cacheRoot: runDir,
         bundle,
         request: {
            condition: 'default',
            actions: [{ action: 'focus', selector: '#menu-toggle' }],
         },
      });
      for (const mutation of captureMutations) {
         const changed = structuredClone(capture);
         mutation.mutate(changed);

         expect(() => validateConditionCapture(changed, bundle), mutation.name).toThrow();
      }
   });
});

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ObservationBundle } from '#contracts';
import { runCli, runCliInProcess, useTestServer } from './testing/setup.js';
import { createTempRoot } from './testing/fixtures.js';

const EXPECTED_CHECKS_COUNT = 4;
const USAGE_ERROR = 2;

function createMockBundle(): ObservationBundle {
   return {
      version: '1',
      fingerprint: 'fp-cli-review-test',
      targetUrl: 'https://example.com/test',
      stateId: 'root',
      capturedAt: '2026-11-10T12:00:00.000Z',
      setup: [],
      actionTrace: [],
      treeHash: 'tree-hash-cli',
      axe: { passes: [], violations: [], incomplete: [], inapplicable: [] },
      tree: { yaml: 'root: page', nodes: [] },
      facts: {
         title: 'CLI Review Test Page',
         lang: 'en',
         landmarks: { main: 1 },
         skipLink: '#main',
         headings: [{ level: 1, text: 'CLI Review' }],
         links: [{ name: 'Home', href: '/' }],
         controls: [{ type: 'button', label: 'Submit' }],
         tabStops: [{ id: 'b1', obscured: false, inView: true }],
         interactiveCount: 1,
         media: { video: 0, audio: 0, autoplay: 0, embeds: [] },
         runningAnimations: [],
         smallTargets: [],
         noIndicator: [],
         clickOnNonInteractive: [],
         trapSuspected: false,
         metaRefresh: false,
         urlUnchangedAfterTab: true,
      },
      heuristics: {
         hasSiteNavigation: true,
         hasMultipointGesture: false,
         hasDraggable: false,
      },
      contrast: [],
      viewports: {
         desktop: { width: 1280, height: 800 },
         reflow320: { overflowPx: 0, wideElements: [] },
         zoom200: { overflowPx: 0 },
         portrait: { overflowPx: 0 },
         textSpacingClipped: [],
      },
      screenshots: {
         fullPagePath: 'cache/fp-cli-review-test/full.png',
         elements: {},
      },
      transcript: {
         provenance: 'virtual-dom',
         spokenOrder: ['CLI Review', 'Submit'],
         headings: ['CLI Review'],
         landmarks: ['main'],
         links: [],
         formControls: ['Submit'],
         liveRegions: [],
      },
      interactiveCandidates: [],
   };
}

describe('CLI review start command', () => {
   let tempDir = '';
   let statesFilePath = '';

   beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'a11ied-cli-review-'));
      statesFilePath = join(tempDir, 'states.json');
      const states = [
         {
            stateId: 'root',
            targetUrl: 'https://example.com/test',
            bundle: createMockBundle(),
         },
      ];
      await writeFile(statesFilePath, JSON.stringify(states), 'utf8');
   });

   afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
   });

   it('runs review start --json and returns coverage and run details', async () => {
      const result = await runCliInProcess([
         'review',
         'start',
         '--run-dir',
         tempDir,
         '--states',
         statesFilePath,
         '--json',
      ]);

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.runId).toBeDefined();
      expect(parsed.statesCount).toBe(1);
      expect(parsed.verdictsRecorded).toBe(0);
      expect(parsed.coverage.passed).toBe(0);
      expect(parsed.coverage.unresolved).toBeGreaterThan(0);
      expect(parsed.coverage).toBeDefined();
   });

   it('runs review start with formatted text output', async () => {
      const result = await runCliInProcess([
         'review',
         'start',
         '--run-dir',
         tempDir,
         '--states',
         statesFilePath,
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Review run');
      expect(result.stdout).toContain('Coverage:');
   });
});

describe('CLI review next and observe subcommands', () => {
   let tempDir = '';
   let statesFilePath = '';

   beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'a11ied-cli-review-'));
      statesFilePath = join(tempDir, 'states.json');
      const states = [
         {
            stateId: 'root',
            targetUrl: 'https://example.com/test',
            bundle: createMockBundle(),
         },
      ];
      await writeFile(statesFilePath, JSON.stringify(states), 'utf8');
   });

   afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
   });

   it('runs review next and observe', async () => {
      await runCliInProcess([
         'review',
         'start',
         '--run-dir',
         tempDir,
         '--states',
         statesFilePath,
         '--json',
      ]);

      const nextResult = await runCliInProcess([
         'review',
         'next',
         '--run-dir',
         tempDir,
         '--agent',
         'cli-agent-1',
         '--count',
         '3',
         '--json',
      ]);
      expect(nextResult.status).toBe(0);
      const nextParsed = JSON.parse(nextResult.stdout);
      expect(nextParsed.done).toBe(false);
      expect(nextParsed.packet).toBeDefined();
      expect(nextParsed.packet.checks.length).toBeGreaterThan(0);

      const observeResult = await runCliInProcess([
         'review',
         'observe',
         'root',
         '--run-dir',
         tempDir,
         '--slice',
         'axe',
         '--json',
      ]);
      expect(observeResult.status).toBe(0);
      const observeParsed = JSON.parse(observeResult.stdout);
      expect(observeParsed.slice).toBe('axe');
      expect(observeParsed.data).toBeDefined();
   });
});

describe('CLI review judge, report, and run subcommands', () => {
   let tempDir = '';
   let statesFilePath = '';

   beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'a11ied-cli-review-'));
      statesFilePath = join(tempDir, 'states.json');
      const states = [
         {
            stateId: 'root',
            targetUrl: 'https://example.com/test',
            bundle: createMockBundle(),
         },
      ];
      await writeFile(statesFilePath, JSON.stringify(states), 'utf8');
   });

   afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
   });

   it('rejects an unsupported CLI pass and keeps the report incomplete', async () => {
      await runCliInProcess([
         'review',
         'start',
         '--run-dir',
         tempDir,
         '--states',
         statesFilePath,
         '--json',
      ]);

      const nextResult = await runCliInProcess([
         'review',
         'next',
         '--run-dir',
         tempDir,
         '--agent',
         'cli-agent-1',
         '--count',
         '3',
         '--json',
      ]);
      const nextParsed = JSON.parse(nextResult.stdout);
      const checks = nextParsed.packet.checks;

      const firstCheck = checks[0];
      const judgeSingleResult = await runCliInProcess([
         'review',
         'judge',
         '--run-dir',
         tempDir,
         '--agent',
         'cli-agent-1',
         '--criterion',
         firstCheck.criterionId,
         '--state',
         firstCheck.stateId,
         '--outcome',
         'passed',
         '--rationale',
         'Verified via CLI test single verdict.',
         '--json',
      ]);
      expect(judgeSingleResult.status).toBe(USAGE_ERROR);

      const statusResult = await runCliInProcess([
         'review',
         'status',
         '--run-dir',
         tempDir,
         '--full',
         '--json',
      ]);
      expect(statusResult.status).toBe(0);
      const statusParsed = JSON.parse(statusResult.stdout);
      expect(statusParsed.coverage.passed).toBe(0);

      const reportResult = await runCliInProcess([
         'review',
         'report',
         '--run-dir',
         tempDir,
         '--draft',
         '--json',
      ]);
      expect(reportResult.status).toBe(0);
      const reportParsed = JSON.parse(reportResult.stdout);
      expect(reportParsed.paths.markdownPath).toBeDefined();
      expect(reportParsed.report.isDraft).toBe(true);
   });

   it('runs review run with --states and --no-draft-report', async () => {
      const runResult = await runCliInProcess([
         'review',
         'run',
         '--run-dir',
         tempDir,
         '--states',
         statesFilePath,
         '--next-count',
         '4',
         '--no-draft-report',
         '--json',
      ]);

      expect(runResult.status).toBe(0);
      const parsed = JSON.parse(runResult.stdout);
      expect(parsed.runId).toBeDefined();
      expect(parsed.startResult).toBeDefined();
      expect(parsed.firstPacket).toBeDefined();
      expect(parsed.firstPacket.checks.length).toBeLessThanOrEqual(EXPECTED_CHECKS_COUNT);
      expect(parsed.draftReportPath).toBeUndefined();
   });
});

describe('CLI review browser transport', () => {
   const tempRoots: string[] = [];
   const server = useTestServer(tempRoots);

   it('collects a URL through the built CLI and refreshes the resulting state', async () => {
      const runDir = await createTempRoot(tempRoots);
      const started = await runCli([
         'review',
         'start',
         `${server.getBaseUrl()}/basic-page.html`,
         '--run-dir',
         runDir,
         '--json',
      ]);

      expect(started.status, started.stderr).toBe(0);
      const cached = await runCli([
         'review',
         'observe',
         'initial',
         '--run-dir',
         runDir,
         '--slice',
         'facts',
         '--json',
      ]);

      expect(cached.status, cached.stderr).toBe(0);
      const first = JSON.parse(cached.stdout);

      expect(first.data.title).toBe('Basic page');
      expect(first.digest).toBeTypeOf('string');
      const refreshed = await runCli([
         'review',
         'observe',
         'initial',
         '--run-dir',
         runDir,
         '--refresh',
         '--slice',
         'facts',
         '--json',
      ]);

      expect(refreshed.status, refreshed.stderr).toBe(0);
      const second = JSON.parse(refreshed.stdout);

      expect(second.data.title).toBe('Basic page');
      expect(second.fingerprint).not.toBe(first.fingerprint);
   });
});

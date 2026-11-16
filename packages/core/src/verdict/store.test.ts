import { mkdtemp, rm, appendFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verdictSchema, type Verdict } from '@a11ied/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
   computePageVerdicts,
   computeVerdictId,
   getVerdictStorePath,
   readVerdicts,
   recordVerdict,
} from './store.js';

const EXPECTED_MEASUREMENT_COUNT = 4,
   TIER_TWO = 2;

const roots: string[] = [];

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function createRunDir(): Promise<string> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-verdict-'));
   roots.push(root);
   return root;
}

function buildVerdict(overrides: Partial<Verdict> = {}): Verdict {
   return {
      id: computeVerdictId({ criterionId: '1.4.3', stateId: 'state-1' }),
      criterionId: '1.4.3',
      stateId: 'state-1',
      tier: 1,
      outcome: 'passed',
      confidence: 0.8,
      method: 'axe',
      rationale: 'Contrast measured at 4.6:1.',
      evidence: [{ fingerprint: 'fp-1', path: 'cache/fp-1/bundle.json' }],
      repro: ['axe.run(document)'],
      recordedAt: '2026-11-10T00:00:00.000Z',
      ...overrides,
   };
}

describe('computeVerdictId', () => {
   it('is deterministic for the same check key', () => {
      const input = { criterionId: '1.4.3', stateId: 'state-1', procedureId: 'contrast' };
      const first = computeVerdictId(input);
      const second = computeVerdictId({ ...input });

      expect(first).toBe(second);
      expect(first).toMatch(/^v-[a-f0-9]{16}$/u);
   });

   it('differs when the procedure differs', () => {
      const base = { criterionId: '1.4.3', stateId: 'state-1' };

      expect(computeVerdictId(base)).not.toBe(
         computeVerdictId({ ...base, procedureId: 'contrast' }),
      );
   });
});

describe('recordVerdict / readVerdicts', () => {
   it('is idempotent when the same check is recorded twice', async () => {
      const runDir = await createRunDir();
      const first = buildVerdict({ recordedAt: '2026-11-10T00:00:00.000Z' });
      const second = buildVerdict({ recordedAt: '2026-11-10T00:05:00.000Z' });

      await recordVerdict(runDir, first);
      await recordVerdict(runDir, second);

      const verdicts = await readVerdicts(runDir);

      expect(verdicts).toHaveLength(1);
      expect(verdicts[0]?.recordedAt).toBe('2026-11-10T00:05:00.000Z');
   });

   it('reads an empty list when the store is missing', async () => {
      const runDir = await createRunDir();

      expect(await readVerdicts(runDir)).toEqual([]);
   });

   it('writes to verdicts.jsonl inside the run dir', async () => {
      const runDir = await createRunDir();

      expect(getVerdictStorePath(runDir)).toBe(join(runDir, 'verdicts.jsonl'));
   });
});

describe('interrupted append recovery', () => {
   it('preserves an interrupted suffix and recovers the valid prefix before accepting new records', async () => {
      const runDir = await createRunDir();
      const first = buildVerdict();
      await recordVerdict(runDir, first);
      const path = getVerdictStorePath(runDir);
      await appendFile(path, '{"criterionId":', 'utf8');
      const recovered = await readVerdicts(runDir);
      const files = await readdir(runDir);
      const backup = files.find((file) => file.startsWith('verdicts-interrupted-'));

      expect(recovered).toEqual([first]);
      expect(backup).toBeDefined();
      if (!backup) {
         throw new Error('Expected preserved interrupted journal');
      }
      expect(await readFile(join(runDir, backup), 'utf8')).toContain('{"criterionId":');
      await recordVerdict(runDir, first);

      expect(await readVerdicts(runDir)).toEqual([first]);
   });
});

describe('verdictSchema soundness', () => {
   it('rejects confidence 1.0 when tier is 2', () => {
      const candidate = { ...buildVerdict(), tier: TIER_TWO, confidence: 1 };

      expect(() => verdictSchema.parse(candidate)).toThrow(
         /confidence 1\.0 is restricted/u,
      );
   });

   it('accepts confidence 1.0 when tier is 0', () => {
      const candidate = { ...buildVerdict(), tier: 0 as const, confidence: 1 };

      expect(() => verdictSchema.parse(candidate)).not.toThrow();
   });

   it('rejects outcome needsReview without a nextAction', () => {
      const candidate = buildVerdict({
         outcome: 'needsReview',
         confidence: 0.5,
         tier: TIER_TWO,
      });

      expect(() => verdictSchema.parse(candidate)).toThrow(/structured nextAction/u);
   });

   it('rejects outcome excluded without an exclusionReason', () => {
      const candidate = buildVerdict({
         outcome: 'excluded',
         method: 'scope-exclusion',
      });

      expect(() => verdictSchema.parse(candidate)).toThrow(/exclusionReason/u);
   });

   it('accepts real MeasurementRecord units', () => {
      const measurements = [
         {
            metric: 'contrastRatio',
            value: 4.6,
            threshold: 4.5,
            unit: 'contrastRatio' as const,
            pass: true,
         },
         {
            metric: 'targetSize',
            value: 24,
            threshold: 24,
            unit: 'px' as const,
            pass: true,
         },
         {
            metric: 'animationDuration',
            value: 100,
            threshold: 100,
            unit: 'ms' as const,
            pass: false,
         },
         {
            metric: 'flashFrequency',
            value: 3,
            threshold: 3,
            unit: 'Hz' as const,
            pass: true,
         },
      ];
      const verdict = verdictSchema.parse({
         ...buildVerdict(),
         outcome: 'failed',
         measurements,
      });

      expect(verdict.measurements).toHaveLength(EXPECTED_MEASUREMENT_COUNT);
      expect(verdict.measurements?.map((measurement) => measurement.unit)).toEqual([
         'contrastRatio',
         'px',
         'ms',
         'Hz',
      ]);
   });
});

describe('computePageVerdicts', () => {
   const states = [
      { stateId: 'state-1', targetUrl: 'https://example.test/' },
      { stateId: 'state-2', targetUrl: 'https://example.test/other' },
   ];

   it('keeps unadmitted failures unresolved', () => {
      const failing = buildVerdict({
         outcome: 'failed',
         impact: 'critical',
         method: 'axe',
      });

      const pageVerdicts = computePageVerdicts(states, [failing], ['1.4.3']);
      const state1 = pageVerdicts.find((verdict) => verdict.stateId === 'state-1');
      const state2 = pageVerdicts.find((verdict) => verdict.stateId === 'state-2');

      expect(state1?.status).toBe('passing-so-far');
      expect(state1?.failingCount).toBe(0);
      expect(state1?.highestImpact).toBeUndefined();
      expect(state2?.status).toBe('unstarted');
   });

   it('reports passing-so-far when unresolved verdicts exist but none fail', () => {
      const review = buildVerdict({
         outcome: 'needsReview',
         confidence: 0.5,
         tier: 2,
         nextAction: {
            kind: 'inspect-element',
            summary: 'Verify alt text describes the image.',
            selector: 'img.hero',
         },
      });

      const pageVerdicts = computePageVerdicts(states, [review], ['1.4.3']);
      const state1 = pageVerdicts.find((verdict) => verdict.stateId === 'state-1');

      expect(state1?.status).toBe('passing-so-far');
      expect(state1?.needsReviewCount).toBe(1);
   });

   it('requires admitted scope evidence before treating a state as excluded', () => {
      const excluded = buildVerdict({
         outcome: 'excluded',
         method: 'scope-exclusion',
         exclusionReason: 'Third-party widget, out of scope.',
      });

      const pageVerdicts = computePageVerdicts(states, [excluded], ['1.4.3']);
      const state1 = pageVerdicts.find((verdict) => verdict.stateId === 'state-1');

      expect(state1?.status).toBe('passing-so-far');
      expect(state1?.excludedCount).toBe(0);
      expect(state1?.highestImpact).toBeUndefined();
   });
});

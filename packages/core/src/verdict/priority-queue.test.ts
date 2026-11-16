import type { Verdict } from '@a11ied/contracts';
import { WCAG_22_AA_CRITERIA } from '@a11ied/verdict';
import { describe, expect, it } from 'vitest';

import {
   buildQueueSnapshot,
   compareClaimableWork,
   getCriterionImpact,
   sortClaimableWork,
   type ClaimableWorkItem,
} from './priority-queue.js';

function buildWorkItem(overrides: Partial<ClaimableWorkItem> = {}): ClaimableWorkItem {
   return {
      id: 'work-1',
      stateId: 'state-1',
      criterionId: '1.4.3',
      ...overrides,
   };
}

function buildVerdict(overrides: Partial<Verdict> = {}): Verdict {
   return {
      id: 'v-failed-1',
      criterionId: '1.4.3',
      stateId: 'state-1',
      tier: 1,
      outcome: 'failed',
      confidence: 0.9,
      impact: 'serious',
      method: 'axe',
      rationale: 'Contrast ratio below the required threshold.',
      evidence: [{ fingerprint: 'fp-1', path: 'cache/fp-1/bundle.json' }],
      repro: ['axe.run(document)'],
      recordedAt: '2026-11-10T00:00:00.000Z',
      ...overrides,
   };
}

describe('getCriterionImpact', () => {
   it('prefers the explicit impact over the default', () => {
      expect(getCriterionImpact('1.4.3', 'critical')).toBe('critical');
   });

   it('falls back to the default criterion impact and then moderate', () => {
      expect(getCriterionImpact('1.1.1')).toBe('critical');
      expect(getCriterionImpact('9.9.9')).toBe('moderate');
   });
});

describe('sortClaimableWork', () => {
   it('orders critical ahead of serious ahead of moderate', () => {
      const items = [
         buildWorkItem({ id: 'mod-1', criterionId: '2.4.5' }),
         buildWorkItem({ id: 'mod-2', criterionId: '3.1.2' }),
         buildWorkItem({ id: 'ser-1', criterionId: '1.4.3' }),
         buildWorkItem({ id: 'ser-2', criterionId: '2.4.7' }),
         buildWorkItem({ id: 'crit-1', criterionId: '2.1.2' }),
         buildWorkItem({ id: 'crit-2', criterionId: '4.1.2' }),
         buildWorkItem({ id: 'crit-3', criterionId: '1.1.1' }),
      ];

      const sorted = sortClaimableWork(items);

      expect(sorted.map((item) => item.id)).toEqual([
         'crit-3',
         'crit-1',
         'crit-2',
         'ser-1',
         'ser-2',
         'mod-1',
         'mod-2',
      ]);
   });

   it('respects statePriority ahead of impact rank', () => {
      const items = [
         buildWorkItem({
            id: 'crit-low-priority',
            criterionId: '1.1.1',
            statePriority: 1,
         }),
         buildWorkItem({
            id: 'mod-high-priority',
            criterionId: '2.4.5',
            statePriority: 0,
         }),
      ];

      const sorted = sortClaimableWork(items);

      expect(sorted.map((item) => item.id)).toEqual([
         'mod-high-priority',
         'crit-low-priority',
      ]);
   });

   it('breaks impact ties by criterion id with numeric ordering', () => {
      const items = [
         buildWorkItem({ id: 'a', criterionId: '1.4.13' }),
         buildWorkItem({ id: 'b', criterionId: '1.4.3' }),
         buildWorkItem({ id: 'c', criterionId: '1.4.10' }),
      ];

      const sorted = sortClaimableWork(items);

      expect(sorted.map((item) => item.criterionId)).toEqual([
         '1.4.3',
         '1.4.10',
         '1.4.13',
      ]);
   });

   it('does not mutate the input array', () => {
      const items = [
         buildWorkItem({ id: 'mod', criterionId: '2.4.5' }),
         buildWorkItem({ id: 'crit', criterionId: '1.1.1' }),
      ];

      const sorted = sortClaimableWork(items);

      expect(sorted.map((item) => item.id)).toEqual(['crit', 'mod']);
      expect(items.map((item) => item.id)).toEqual(['mod', 'crit']);
   });

   it('compareClaimableWork returns 0 for equivalent items', () => {
      const item = buildWorkItem({
         id: 'x',
         criterionId: '1.4.3',
         procedureId: 'contrast',
      });

      expect(compareClaimableWork(item, { ...item, id: 'y' })).toBe(0);
   });
});

describe('buildQueueSnapshot', () => {
   const states = [
      { stateId: 'state-1', targetUrl: 'https://example.test/' },
      { stateId: 'state-2', targetUrl: 'https://example.test/other' },
   ];

   it('keeps raw claims unresolved and orders claimable work', () => {
      const verdicts = [buildVerdict({ criterionId: '1.4.3', stateId: 'state-1' })];
      const pendingWork: ClaimableWorkItem[] = [
         buildWorkItem({ id: 'pending-1', stateId: 'state-1', criterionId: '2.4.7' }),
         buildWorkItem({ id: 'pending-2', stateId: 'state-1', criterionId: '1.1.1' }),
      ];

      const snapshot = buildQueueSnapshot({ states, verdicts, pendingWork });
      const state1 = snapshot.pageVerdicts.find(
         (verdict) => verdict.stateId === 'state-1',
      );
      const state2 = snapshot.pageVerdicts.find(
         (verdict) => verdict.stateId === 'state-2',
      );

      expect(state1?.status).toBe('passing-so-far');
      expect(state1?.failingCount).toBe(0);
      expect(state2?.status).toBe('unstarted');
      expect(snapshot.canRenderDraftReport).toBe(true);
      expect(snapshot.nextBatch.map((item) => item.id)).toEqual([
         'pending-2',
         'pending-1',
      ]);
      expect(snapshot.unresolvedCount).toBe(states.length * WCAG_22_AA_CRITERIA.length);
   });

   it('counts needsReview and cantTell verdicts as unresolved', () => {
      const verdicts = [
         buildVerdict({
            id: 'v-review',
            outcome: 'needsReview',
            nextAction: {
               kind: 'inspect-element',
               summary: 'Verify the accessible name.',
            },
         }),
         buildVerdict({
            id: 'v-canttell',
            outcome: 'cantTell',
            nextAction: {
               kind: 'escalate-native-sr',
               summary: 'Confirm with a screen reader.',
            },
         }),
      ];

      const snapshot = buildQueueSnapshot({ states, verdicts, pendingWork: [] });

      expect(snapshot.unresolvedCount).toBe(states.length * WCAG_22_AA_CRITERIA.length);
      expect(snapshot.canRenderDraftReport).toBe(true);
   });
});

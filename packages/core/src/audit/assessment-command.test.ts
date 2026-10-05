import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessmentCapabilitySchema, type AssessmentCapability } from '@a11ied/contracts';
import * as lifecycle from './run-lifecycle.js';
import { executeAuditAssessment } from './assessment-command.js';
import { readAuditRun, updateAuditRun } from './run-store.js';
import { registerAuditJourney, registerAuditState } from './run-state.js';
import { createEvidenceTestAssessment } from '../evidence/test-fixtures.js';
import { recordEvidence } from '../evidence/store.js';
import { listAssessmentObligations } from './run-obligations.js';
import { buildState, createObservedAuditRun } from './test-fixtures.js';

const FIRST_PAGE_LIMIT = 20,
   STATE_COUNT = 21;
afterEach(() => {
   vi.restoreAllMocks();
});

async function withRun(
   check: (file: string) => Promise<void>,
   capabilities?: AssessmentCapability[],
): Promise<void> {
   const fixture = await createObservedAuditRun(capabilities ? { capabilities } : {});
   try {
      await check(fixture.file);
   } finally {
      await rm(dirname(fixture.file), { recursive: true, force: true });
   }
}

async function assertRetriedClaim(): Promise<void> {
   await withRun(async (file) => {
      const readStatus = lifecycle.getAuditAssessmentStatus;
      vi.spyOn(lifecycle, 'getAuditAssessmentStatus').mockImplementationOnce(async () => {
         const run = await readAuditRun(file);
         const checkId = run.activeCheckId ?? '';
         await lifecycle.resumeAuditAssessment({ file });
         await lifecycle.resumeAuditAssessment({ file, retryCheckIds: [checkId] });
         const retried = await lifecycle.nextAuditAssessment(file);

         expect(retried.check?.checkId).toStrictEqual(checkId);
         return readStatus(file);
      });

      await expect(executeAuditAssessment({ action: 'next', file })).rejects.toThrow(
         'audit changed',
      );
   });
}

async function assertStaleClaim(): Promise<void> {
   await withRun(async (file) => {
      const readStatus = lifecycle.getAuditAssessmentStatus;
      vi.spyOn(lifecycle, 'getAuditAssessmentStatus').mockImplementationOnce(async () => {
         const run = await readAuditRun(file),
            state = run.states[0];
         if (!state) {
            throw new Error('Missing fixture state.');
         }
         await registerAuditState({
            file,
            state: { ...state, fingerprint: 'changed-after-claim' },
         });
         const status = await readStatus(file);

         expect(status.run.activeCheckId).toStrictEqual(run.activeCheckId);
         return status;
      });

      await expect(executeAuditAssessment({ action: 'next', file })).rejects.toThrow(
         'audit changed',
      );
   });
}

async function assertBeyondPage(): Promise<void> {
   await withRun(async (file) => {
      await updateAuditRun({
         file,
         change(run) {
            run.states = Array.from({ length: STATE_COUNT }, (_entry, index) => ({
               ...buildState(),
               stateId: `state-${index}`,
               label: `State ${index}`,
               revision: 1,
               observedAt: run.startedAt,
            }));
            return run;
         },
      });
      const registered = await executeAuditAssessment({
         action: 'state',
         file,
         state: buildState('New state', 'new-state'),
      });
      const stateId = registered.mutation?.stateId;

      expect(stateId).toBeTruthy();
      expect(registered.states.items).toHaveLength(FIRST_PAGE_LIMIT);
      expect(
         registered.states.items.some((state) => state.stateId === stateId),
      ).toStrictEqual(false);
      if (!stateId) {
         throw new Error('Missing registered state ID.');
      }

      const queued = await executeAuditAssessment({
         action: 'queue',
         file,
         check: {
            criterionId: '2.1.1',
            procedureId: 'wcag_2_1_1',
            procedureVersion: '1',
            scope: 'element',
            stateIds: [stateId],
            pointer: '#control',
            environmentId: 'mac-voiceover',
         },
      });
      const selected = await executeAuditAssessment({ action: 'next', file });

      expect(selected.next?.check.checkId).toStrictEqual(queued.mutation?.checkId);
      expect(selected.next?.context.states.items[0]?.stateId).toStrictEqual(stateId);
      expect(selected.next?.context.environment?.environmentId).toStrictEqual(
         'mac-voiceover',
      );
   });
}

async function assertJourneyOrder(): Promise<void> {
   await withRun(
      async (file) => {
         const initial = await readAuditRun(file);
         const opened = await registerAuditState({
            file,
            state: buildState('Opened', 'opened'),
         });
         const firstId = initial.states[0]?.stateId ?? '',
            secondId = opened.states[1]?.stateId ?? '';
         const stateIds = [secondId, firstId];
         await registerAuditJourney({
            file,
            journey: {
               journeyId: 'process',
               label: 'Reverse registration order',
               stateIds,
               status: 'discovered',
            },
         });
         await executeAuditAssessment({
            action: 'queue',
            file,
            check: {
               criterionId: '2.2.1',
               procedureId: 'wcag_2_2_1',
               procedureVersion: '1',
               scope: 'journey',
               stateIds,
               journeyId: 'process',
               environmentId: 'mac-voiceover',
            },
         });
         const response = await executeAuditAssessment({ action: 'next', file });

         expect(
            response.next?.context.states.items.map((state) => state.stateId),
         ).toEqual(stateIds);
         expect(response.next?.context.journey?.stateIds).toEqual(stateIds);
      },
      [...assessmentCapabilitySchema.options],
   );
}

async function assertWidgetEvidence(): Promise<void> {
   const fixture = await createEvidenceTestAssessment([], {
      scope: 'element',
      pointer: '#control',
   });
   try {
      const saved = await recordEvidence(fixture.record, fixture);
      const result = await executeAuditAssessment({
         action: 'evaluate',
         file: fixture.runFile,
         checkId: saved.record.provenance?.checkId ?? '',
         outcome: 'passed',
         evidenceIds: [saved.record.evidenceId ?? ''],
      });
      const run = await readAuditRun(fixture.runFile);
      const required = listAssessmentObligations(run).find(
         (check) => check.criterionId === '4.1.1' && check.scope === 'state',
      );

      expect(result.coverage.assessed).toStrictEqual(1);
      expect(result.complete).toStrictEqual(false);
      expect(required).toBeDefined();
      expect(
         run.checks.some((check) => check.checkId === required?.checkId),
      ).toStrictEqual(false);
   } finally {
      await rm(dirname(fixture.runFile), { recursive: true, force: true });
   }
}

describe('assessment command claim generations', () => {
   it('rejects a different attempt with the same check ID', assertRetriedClaim);
   it('rejects scope invalidation that retains the active check ID', assertStaleClaim);
});
describe('assessment response pagination', () => {
   it(
      'returns generated registration IDs and selected state context beyond the first page',
      assertBeyondPage,
   );
   it('preserves journey order in actionable state context', assertJourneyOrder);
   it(
      'evaluates additive widget evidence while keeping required state obligations separate',
      assertWidgetEvidence,
   );
});

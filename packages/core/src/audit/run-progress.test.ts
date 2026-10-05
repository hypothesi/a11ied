import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditRun } from '@a11ied/contracts';
import {
   getAuditAssessmentStatus,
   nextAuditAssessment,
   finalizeAuditAssessment,
} from './run-lifecycle.js';
import { updateAuditRun } from './run-store.js';
import {
   registerAuditJourney,
   registerAuditState,
   transitionAssessmentCheck,
} from './run-state.js';
import { createObservedAuditRun, attachObservedAuditInventory } from './test-fixtures.js';
import { listAssessmentObligations } from './run-obligations.js';
import * as obligations from './run-obligations.js';
import { createEvidenceTestAssessment } from '../evidence/test-fixtures.js';
import { recordEvidence } from '../evidence/store.js';

const roots: string[] = [];

afterEach(async () => {
   vi.restoreAllMocks();
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function createRun(
   input: Parameters<typeof createObservedAuditRun>[0] = {},
): Promise<{ file: string; run: AuditRun }> {
   const created = await createObservedAuditRun(input);
   roots.push(dirname(created.file));
   return created;
}

describe('scope progress across environments', () => {
   it('keeps another environment out of individual state totals and invalidation', async () => {
      const { file, run } = await createRun();
      const environment = run.environments[0],
         state = run.states[0];
      if (!state || !environment) {
         throw new Error('Missing observed scope.');
      }
      const before = await getAuditAssessmentStatus(file);
      await updateAuditRun({
         file,
         change(current) {
            current.environments.push({ ...environment, environmentId: 'other' });
            return current;
         },
      });
      await registerAuditState({
         file,
         state: { ...state, stateId: 'other', environmentId: 'other' },
      });
      await nextAuditAssessment(file);
      await updateAuditRun({
         file,
         change(current) {
            const other = current.checks.find(
               (check) => check.scope === 'site' && check.environmentId === 'other',
            );
            if (!other) {
               throw new Error('Missing site obligation.');
            }
            Object.assign(other, {
               status: 'blocked',
               reason: 'Explicit environment blocker.',
            });
            return current;
         },
      });
      const changed = await registerAuditState({
         file,
         state: { ...state, fingerprint: 'changed' },
      });
      const after = await getAuditAssessmentStatus(file);

      expect(
         after.progress.states.find((item) => item.id === state.stateId)?.total,
      ).toStrictEqual(before.progress.states[0]?.total);
      expect(
         changed.checks.find(
            (check) => check.scope === 'site' && check.environmentId === 'other',
         )?.status,
      ).toStrictEqual('blocked');
   });
});

describe('complete process coverage', () => {
   it('withholds journey progress despite evaluated checks in a reduced fixture catalog', async () => {
      const fixture = await createEvidenceTestAssessment();
      roots.push(dirname(fixture.runFile));
      vi.spyOn(obligations, 'getAssessmentCatalog').mockReturnValue({
         procedures: [],
         gapCriterionIds: [],
      });
      vi.spyOn(obligations, 'listAssessmentObligations').mockImplementation(
         (run) => run.checks,
      );
      const saved = await recordEvidence(fixture.record, fixture);
      await transitionAssessmentCheck({
         file: fixture.runFile,
         checkId: saved.record.provenance?.checkId ?? '',
         status: 'evaluated',
         outcome: saved.record.outcome,
         evidenceIds: [saved.record.evidenceId ?? ''],
      });
      const journey = {
         journeyId: 'process',
         label: 'Contact process',
         stateIds: fixture.run.states.map((state) => state.stateId),
         status: 'discovered' as const,
      };
      await registerAuditJourney({ file: fixture.runFile, journey });
      const unfinished = await getAuditAssessmentStatus(fixture.runFile);
      await registerAuditJourney({
         file: fixture.runFile,
         journey: { ...journey, status: 'completed' },
      });
      const finished = await getAuditAssessmentStatus(fixture.runFile);

      expect(unfinished.progress.journeys[0]?.assessed).toStrictEqual(1);
      expect(unfinished.progress.journeys[0]?.complete).toStrictEqual(false);
      expect(finished.progress.journeys[0]?.complete).toStrictEqual(true);
   });
});

describe('unfinished process coverage', () => {
   it.each(['discovered', 'blocked'] as const)(
      'keeps a %s journey out of completed scope',
      async (journeyStatus) => {
         const { file, run } = await createRun();
         await registerAuditJourney({
            file,
            journey: {
               journeyId: 'process',
               label: 'Contact process',
               stateIds: run.states.map((state) => state.stateId),
               status: journeyStatus,
               ...(journeyStatus === 'blocked'
                  ? { reason: 'Submission not authorized.' }
                  : {}),
            },
         });
         const status = await getAuditAssessmentStatus(file);

         expect(
            status.issues.some((issue) => issue.code === 'audit-journey-incomplete'),
         ).toStrictEqual(true);
         expect(status.progress.journeys[0]?.complete).toStrictEqual(false);
         await expect(finalizeAuditAssessment({ file })).rejects.toThrow(
            'coverage issues',
         );
      },
   );
});

describe('observed process state changes', () => {
   it('revokes completed traversal when a constituent state changes', async () => {
      const { file, run } = await createRun();
      const state = run.states[0];
      if (!state) {
         throw new Error('Missing observed state.');
      }
      const journey = {
         journeyId: 'process',
         label: 'Contact process',
         stateIds: [state.stateId],
         status: 'completed' as const,
      };
      await registerAuditJourney({ file, journey });
      const unchanged = await registerAuditState({ file, state });
      const changed = await registerAuditState({
         file,
         state: { ...state, fingerprint: 'new-validation' },
      });
      const status = await getAuditAssessmentStatus(file);

      expect(unchanged.journeys[0]?.status).toStrictEqual('completed');
      expect(changed.journeys[0]?.status).toStrictEqual('discovered');
      expect(
         status.issues.some((issue) => issue.code === 'audit-journey-incomplete'),
      ).toStrictEqual(true);
      const traversed = await registerAuditJourney({ file, journey });

      expect(traversed.journeys[0]?.status).toStrictEqual('completed');
   });
});

describe('ordered process step changes', () => {
   it('requires a fresh completion after changing the ordered journey steps', async () => {
      const { file, run } = await createRun();
      const state = run.states[0];
      if (!state) {
         throw new Error('Missing observed state.');
      }
      await registerAuditState({
         file,
         state: { ...state, stateId: 'dialog', fingerprint: 'dialog' },
      });
      const journey = {
         journeyId: 'process',
         label: 'Contact process',
         stateIds: [state.stateId, 'dialog'],
         status: 'completed' as const,
      };
      await registerAuditJourney({ file, journey });
      const reordered = { ...journey, stateIds: ['dialog', state.stateId] };
      const changed = await registerAuditJourney({ file, journey: reordered });
      const completed = await registerAuditJourney({ file, journey: reordered });

      expect(changed.journeys[0]?.status).toStrictEqual('discovered');
      expect(completed.journeys[0]?.status).toStrictEqual('completed');
   });
});

describe('blocked process state changes', () => {
   it('preserves blocked traversal and its reason across state changes', async () => {
      const { file, run } = await createRun();
      const state = run.states[0];
      if (!state) {
         throw new Error('Missing observed state.');
      }
      await registerAuditJourney({
         file,
         journey: {
            journeyId: 'process',
            label: 'Contact process',
            stateIds: [state.stateId],
            status: 'blocked',
            reason: 'Submission not authorized.',
         },
      });
      const changed = await registerAuditState({
         file,
         state: { ...state, fingerprint: 'changed' },
      });

      expect(changed.journeys[0]?.status).toStrictEqual('blocked');
      expect(changed.journeys[0]?.reason).toStrictEqual('Submission not authorized.');
   });
});

describe('process assessment totals', () => {
   it('includes every constituent state and site obligation in journey progress', async () => {
      const { file, run } = await createRun();
      const state = run.states[0];
      if (!state) {
         throw new Error('Missing observed state.');
      }
      const observed = await registerAuditState({
         file,
         state: { ...state, stateId: 'dialog', fingerprint: 'dialog' },
      });
      const journey = await registerAuditJourney({
         file,
         journey: {
            journeyId: 'process',
            label: 'Process',
            stateIds: observed.states.map((entry) => entry.stateId),
            status: 'completed',
         },
      });
      const status = await getAuditAssessmentStatus(file);
      const processOnly = listAssessmentObligations(journey).filter(
         (check) => check.scope === 'journey',
      ).length;

      expect(status.progress.journeys[0]?.total).toStrictEqual(status.coverage.total);
      expect(status.progress.journeys[0]?.total).toBeGreaterThan(processOnly);
      expect(status.progress.journeys[0]?.complete).toStrictEqual(false);
   });
});

describe('behavior-changing hash routes', () => {
   it.each([
      'https://createdbyfireside.com/welcome/#contact',
      'https://createdbyfireside.com/welcome/',
   ])(
      'keeps the requested route requirement on a discovery redirect: %s',
      async (observedUrl) => {
         const { file, run } = await createRun({
            url: 'https://createdbyfireside.com/#contact',
            observedUrl,
         });
         await attachObservedAuditInventory({ file, run });
         const status = await getAuditAssessmentStatus(file);

         expect(
            status.issues.some((issue) => issue.code === 'audit-inventory-mismatch'),
         ).toStrictEqual(false);
         expect(
            status.issues.some((issue) => issue.code === 'audit-target-unobserved'),
         ).toStrictEqual(!observedUrl.endsWith('#contact'));
      },
   );
});

describe('requested hash route observations', () => {
   it('matches discovery identity while requiring the exact requested route observation', async () => {
      const { file, run } = await createRun({
         url: 'https://createdbyfireside.com/#contact',
         observedUrl: 'https://createdbyfireside.com/',
      });
      await attachObservedAuditInventory({ file, run });
      const before = await getAuditAssessmentStatus(file);
      const state = run.states[0];
      if (!state) {
         throw new Error('Missing observed state.');
      }
      await registerAuditState({
         file,
         state: {
            ...state,
            stateId: 'contact-route',
            fingerprint: 'contact-route',
            target: run.target,
         },
      });
      const after = await getAuditAssessmentStatus(file);

      expect(
         before.issues.some((issue) => issue.code === 'audit-inventory-mismatch'),
      ).toStrictEqual(false);
      expect(
         before.issues.some((issue) => issue.code === 'audit-target-unobserved'),
      ).toStrictEqual(true);
      expect(
         after.issues.some((issue) => issue.code === 'audit-target-unobserved'),
      ).toStrictEqual(false);
      expect(after.progress.pages[0]?.total).toStrictEqual(after.coverage.total);
   });
});

import { dirname } from 'node:path';
import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createObservedAuditRun } from './test-fixtures.js';
import { nextAuditAssessment, resumeAuditAssessment } from './run-lifecycle.js';
import { transitionAssessmentCheck } from './run-state.js';
import type { AssessmentCheck } from '@a11ied/contracts';

afterEach(() => {
   vi.useRealTimers();
});

async function refineUnderBackwardClock(file: string, checkId: string): Promise<void> {
   vi.setSystemTime(new Date('2030-01-01T00:00:10Z'));
   await transitionAssessmentCheck({
      file,
      checkId,
      status: 'blocked',
      reason: 'Window lost.',
   });
   vi.setSystemTime(new Date('2029-01-01T00:00:00Z'));
   await transitionAssessmentCheck({
      file,
      checkId,
      status: 'blocked',
      reason: 'Restore the window.',
   });
   await resumeAuditAssessment({ file, retryCheckIds: [checkId] });
}

async function getRetriedCheck(
   file: string,
   checkId: string,
   direct: boolean,
): Promise<AssessmentCheck | undefined> {
   if (direct) {
      const run = await transitionAssessmentCheck({ file, checkId, status: 'running' });
      return run.checks.find((check) => check.checkId === checkId);
   }
   const next = await nextAuditAssessment(file);
   return next.check;
}

async function assertBackwardClock(direct: boolean): Promise<void> {
   const fixture = await createObservedAuditRun({});
   try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
      const claimed = await nextAuditAssessment(fixture.file);
      if (!claimed.check) {
         throw new Error('The fixture must claim a check.');
      }
      await refineUnderBackwardClock(fixture.file, claimed.check.checkId);
      const retried = await getRetriedCheck(fixture.file, claimed.check.checkId, direct);

      expect(retried?.checkId).toStrictEqual(claimed.check.checkId);
      expect(retried?.attempts).toStrictEqual(claimed.check.attempts + 1);
      expect(Date.parse(retried?.attemptStartedAt ?? '')).toBeGreaterThan(
         Date.parse('2030-01-01T00:00:10Z'),
      );
   } finally {
      await rm(dirname(fixture.file), { recursive: true, force: true });
   }
}

describe('recovered assessment blockers', () => {
   it.each([false, true])(
      'keeps the prior proof boundary with direct transition=%s across clock rollback',
      assertBackwardClock,
   );
   it('refines the reason without replaying an interrupted attempt', async () => {
      const fixture = await createObservedAuditRun({});
      try {
         const claimed = await nextAuditAssessment(fixture.file),
            recovered = await resumeAuditAssessment({ file: fixture.file });
         const before = recovered.run.checks.find(
            (check) => check.checkId === claimed.check?.checkId,
         );
         if (!before) {
            throw new Error('The fixture must claim a check before interruption.');
         }
         const updated = await transitionAssessmentCheck({
            file: fixture.file,
            checkId: before.checkId,
            status: 'blocked',
            reason: 'The target window is unavailable; restore it before retrying.',
         });
         const after = updated.checks.find((check) => check.checkId === before.checkId);

         expect(after).toMatchObject({
            ...before,
            reason: 'The target window is unavailable; restore it before retrying.',
            updatedAt: expect.any(String),
         });
         expect(updated.activeCheckId).toBeUndefined();
         expect(updated.status).toStrictEqual('active');
      } finally {
         await rm(dirname(fixture.file), { recursive: true, force: true });
      }
   });
});

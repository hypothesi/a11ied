import { dirname, join } from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assessmentArtifactEnvelopeSchema } from '@a11ied/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEvidenceTestAssessment } from '../evidence/test-fixtures.js';
import { recordEvidence } from '../evidence/store.js';
import { resumeAuditAssessment } from './run-lifecycle.js';
import { transitionAssessmentCheck } from './run-state.js';

const CLOCK_ROLLBACK_MS = 60_000;

afterEach(() => {
   vi.restoreAllMocks();
   vi.useRealTimers();
});

async function retryAfterClockRollback(file: string, checkId: string): Promise<void> {
   vi.useFakeTimers({ toFake: ['Date'] });
   vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
   await transitionAssessmentCheck({
      file,
      checkId,
      status: 'blocked',
      reason: 'Target lost after capture.',
   });
   await resumeAuditAssessment({ file, retryCheckIds: [checkId] });
   await transitionAssessmentCheck({ file, checkId, status: 'running' });
   vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
}

async function assertOldAttemptRejected(): Promise<void> {
   vi.spyOn(Date, 'now').mockReturnValue(Date.now() - CLOCK_ROLLBACK_MS);
   const fixture = await createEvidenceTestAssessment();
   try {
      vi.restoreAllMocks();
      const checkId = fixture.run.activeCheckId,
         saved = await recordEvidence(fixture.record, fixture);
      if (!checkId || !saved.record.evidenceId) {
         throw new Error('The fixture needs a claimed check and saved evidence.');
      }
      await retryAfterClockRollback(fixture.runFile, checkId);

      await expect(
         transitionAssessmentCheck({
            file: fixture.runFile,
            checkId,
            status: 'evaluated',
            outcome: saved.record.outcome,
            evidenceIds: [saved.record.evidenceId],
         }),
      ).rejects.toThrow('current attempt');
   } finally {
      await rm(dirname(fixture.runFile), { recursive: true, force: true });
   }
}

async function assertArtifactAttemptRejected(): Promise<void> {
   const fixture = await createEvidenceTestAssessment();
   try {
      const artifact = fixture.record.provenance?.artifacts[0];
      if (!artifact) {
         throw new Error('The fixture needs an artifact.');
      }
      const path = join(dirname(fixture.runFile), artifact.path);
      const envelope = assessmentArtifactEnvelopeSchema.parse(
         JSON.parse(await readFile(path, 'utf8')),
      );
      const body = JSON.stringify({ ...envelope, attempt: envelope.attempt + 1 });
      await writeFile(path, body);
      artifact.sha256 = createHash('sha256').update(body).digest('hex');

      await expect(recordEvidence(fixture.record, fixture)).rejects.toThrow(
         'different run, attempt',
      );
   } finally {
      await rm(dirname(fixture.runFile), { recursive: true, force: true });
   }
}

describe('assessment attempt evidence', () => {
   it(
      'rejects a non-image envelope from a different attempt even with a matching content hash',
      assertArtifactAttemptRejected,
   );
   it(
      'rejects old captured proof after rollback before blocking and clock recovery',
      assertOldAttemptRejected,
   );
});

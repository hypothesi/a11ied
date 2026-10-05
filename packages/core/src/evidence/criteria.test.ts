import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getTestMethod } from '@a11ied/wcag-engine';
import { describe, expect, it } from 'vitest';
import { getCriterionEvidence } from './criteria.js';
import { appendEvidence, readEvidence } from './store.js';
import { createEvidenceTestAssessment } from './test-fixtures.js';
import { updateAuditRun } from '../audit/run-store.js';
import { listAssessmentObligations } from '../audit/run-obligations.js';
import { listEvidenceObligations } from './validation.js';

async function assertCurrentJourneyScope(): Promise<void> {
   const fixture = await createEvidenceTestAssessment();
   try {
      const run = await updateAuditRun({
         file: fixture.runFile,
         change(current) {
            const initial = current.states[0];
            if (!initial) {
               throw new Error('Missing initial state.');
            }
            current.states.push({
               ...initial,
               stateId: 'obsolete',
               target: { kind: 'url', value: 'https://createdbyfireside.com/old' },
               fingerprint: 'obsolete-tree',
            });
            current.journeys.push({
               journeyId: 'process',
               label: 'Current process',
               stateIds: ['initial'],
               status: 'discovered',
            });
            const required = listAssessmentObligations(current).find(
               (check) => check.criterionId === '2.2.1' && check.scope === 'journey',
            );
            if (!required) {
               throw new Error('Missing journey obligation.');
            }
            current.checks.push({ ...required, status: 'stale', stateIds: ['obsolete'] });
            return current;
         },
      });
      await appendEvidence(fixture.record, fixture);
      const [record] = await readEvidence(fixture);
      if (!record) {
         throw new Error('Missing evidence record.');
      }
      const required = listEvidenceObligations(record).find(
         (check) => check.criterionId === '2.2.1' && check.scope === 'journey',
      );

      expect(record.verification?.status).toStrictEqual('verified');
      expect(run.checks.at(-1)?.stateIds).to.eql(['obsolete']);
      expect(required?.stateIds).to.eql(['initial']);
   } finally {
      await rm(dirname(fixture.runFile), { recursive: true, force: true });
   }
}

describe('criterion obligation coverage', () => {
   it(
      'keeps current derived journey scope authoritative over an obsolete saved check',
      assertCurrentJourneyScope,
   );
   it('requires unsaved catalog state obligations before a widget can pass a criterion', async () => {
      const fixture = await createEvidenceTestAssessment([], {
         scope: 'element',
         pointer: '#control',
      });
      try {
         await appendEvidence(fixture.record, fixture);
         const records = await readEvidence(fixture);
         const coverage = getCriterionEvidence({
            criterionId: '4.1.1',
            records,
            strategy: getTestMethod('4.1.1', { version: '2.1' }).strategy,
         });

         expect(records[0]?.verification?.status).toStrictEqual('verified');
         expect(fixture.run.checks).toHaveLength(1);
         expect(fixture.run.checks[0]?.scope).toStrictEqual('element');
         expect(coverage.pendingProcedureIds).toContain(
            fixture.run.checks[0]?.procedureId,
         );
         expect(coverage.recordedOutcome).toBeUndefined();
      } finally {
         await rm(dirname(fixture.runFile), { recursive: true, force: true });
      }
   });
});

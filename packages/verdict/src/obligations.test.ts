import { describe, expect, it } from 'vitest';
import type { Verdict } from '@a11ied/contracts';
import { isProcedureAssessmentComplete, listReviewObligations } from './obligations.js';
import { resolveEvidenceProcedure } from './procedure.js';

function createVerdict(overrides: Partial<Verdict> = {}): Verdict {
   const procedure = resolveEvidenceProcedure({ criterionId: '1.3.2' });
   return {
      procedureId: procedure.procedureId,
      assessment: {
         version: procedure.version,
         actions: procedure.actions.map((_action, index) => ({
            index,
            outcome: 'passed' as const,
            observation: 'Compared the corresponding visual and reading sequence.',
            evidence: [{ fingerprint: 'fp', path: 'bundle.json#tree' }],
         })),
      },
      id: 'v-test',
      stateId: 'page',
      criterionId: '1.3.2',
      tier: 2,
      outcome: 'passed',
      confidence: 0.9,
      method: 'agent-judgment',
      rationale: 'Fixture result',
      evidence: [],
      repro: [],
      recordedAt: '2026-11-10',
      ...overrides,
   };
}

function listChecks(verdicts: Verdict[]): ReturnType<typeof listReviewObligations> {
   return listReviewObligations({
      states: [
         { stateId: 'page' },
         { stateId: 'other' },
         { stateId: 'excluded', excluded: true },
      ],
      criterionIds: ['1.3.2'],
      verdicts,
   });
}

describe('Expected review obligations', () => {
   it('keeps missing checks and exclusions visible and ignores unknown states', () => {
      const checks = listChecks([createVerdict({ stateId: 'unknown' })]);

      expect(checks.map((check) => check.outcome)).to.eql([
         'unassessed',
         'unassessed',
         'excluded',
      ]);
   });

   it('collapses repeated procedure results without creating extra checks', () => {
      const checks = listChecks([
         createVerdict({ outcome: 'needsReview' }),
         createVerdict(),
         createVerdict(),
      ]);

      expect(checks).toHaveLength(listChecks([]).length);
      expect(checks[0]?.outcome).toStrictEqual('passed');
   });

   it('preserves uncertainty and failures across distinct procedure results', () => {
      const failing = listChecks([
            createVerdict(),
            createVerdict({ procedureId: 'visual', outcome: 'failed' }),
         ]),
         pending = listChecks([
            createVerdict(),
            createVerdict({ procedureId: 'visual', outcome: 'cantTell' }),
         ]);

      expect(pending[0]?.outcome).toStrictEqual('cantTell');
      expect(failing[0]?.outcome).toStrictEqual('failed');
      const unfinishedFailure = listChecks([
         createVerdict({ outcome: 'needsReview' }),
         createVerdict({ procedureId: 'visual', outcome: 'failed' }),
      ]);

      expect(unfinishedFailure[0]?.outcome).toStrictEqual('failed');
      expect(unfinishedFailure[0]?.complete).toStrictEqual(false);
   });
   it('requires every action of a recognized version without demanding all alternative procedures', () => {
      const complete = listChecks([createVerdict()]),
         missing = listChecks([
            createVerdict({ assessment: { version: '1', actions: [] } }),
         ]),
         unknown = listChecks([createVerdict({ procedureId: 'invented' })]);

      expect(isProcedureAssessmentComplete(createVerdict())).toStrictEqual(true);
      expect(complete[0]?.complete).toStrictEqual(false);
      expect(missing[0]?.complete).toStrictEqual(false);
      expect(unknown[0]?.complete).toStrictEqual(false);
   });
});

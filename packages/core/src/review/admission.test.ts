import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verdictSchema, type ObservationBundle, type Verdict } from '@a11ied/contracts';
import { writeCachedObservationBundle } from '@a11ied/observe';
import {
   admitReviewVerdict,
   createBundleRef,
   isAcceptedVerdict,
   listReviewObligations,
   readReviewVerdicts,
   recordVerdict,
   type ReviewEvidenceScope,
} from '@a11ied/verdict';
import {
   createCompletedAssessment,
   createMockBundle,
   seedObservationFixture,
} from './review-test-fixtures.js';

const AGENT_TIER = 2;

function createProposal(bundle: ObservationBundle): Verdict {
   return verdictSchema.parse({
      ...createCompletedAssessment('1.3.2', bundle),
      id: 'proposal',
      criterionId: '1.3.2',
      stateId: bundle.stateId,
      tier: AGENT_TIER,
      outcome: 'passed',
      confidence: 0.9,
      method: 'agent-judgment',
      rationale: 'Compared the fixture sequence with its virtual-reader order.',
      repro: ['Read fixture content'],
      recordedAt: '2026-11-10T12:00:00.000Z',
   });
}

let runDir = '';
let bundle: ObservationBundle = createMockBundle();
let scope: ReviewEvidenceScope = { states: [], criterionIds: [], exclusions: [] };

beforeEach(async () => {
   runDir = await mkdtemp(join(tmpdir(), 'review-admission-'));
   bundle = createMockBundle();
   scope = {
      states: [
         {
            stateId: bundle.stateId,
            targetUrl: bundle.targetUrl,
            fingerprint: bundle.fingerprint,
         },
      ],
      criterionIds: ['1.3.2'],
      exclusions: [],
   };
   await seedObservationFixture(runDir, bundle);
});

afterEach(async () => {
   await rm(runDir, { recursive: true, force: true });
});

describe('Review evidence admission', () => {
   it('accepts a complete supported procedure bound to current collector receipts', async () => {
      const verdict = await admitReviewVerdict({
         runDir,
         scope,
         verdict: createProposal(bundle),
      });
      const obligations = listReviewObligations({ ...scope, verdicts: [verdict] });

      expect(isAcceptedVerdict(verdict)).toStrictEqual(true);
      expect(obligations[0]?.complete).toStrictEqual(true);
      verdict.rationale = 'Modified after admission';

      expect(isAcceptedVerdict(verdict)).toStrictEqual(false);
   });

   it('rejects empty evidence, unknown states and unsupported native provenance', async () => {
      const empty = createProposal(bundle),
         native = createProposal(bundle),
         unknown = createProposal(bundle);
      empty.evidence = [];
      native.method = 'native-sr';
      unknown.stateId = 'not-registered';

      await expect(admitReviewVerdict({ runDir, scope, verdict: empty })).rejects.toThrow(
         'requires evidence',
      );
      await expect(
         admitReviewVerdict({ runDir, scope, verdict: unknown }),
      ).rejects.toThrow('registered obligation');
      await expect(
         admitReviewVerdict({ runDir, scope, verdict: native }),
      ).rejects.toThrow('native receipts are unavailable');
   });

   it('requires every action and the evidence kinds named by the procedure', async () => {
      const incomplete = createProposal(bundle),
         missingTrace = createProposal(bundle);
      if (!incomplete.assessment || !missingTrace.assessment) {
         throw new Error('Expected assessment fixture');
      }
      incomplete.assessment.actions.pop();
      missingTrace.evidence = missingTrace.evidence.filter(
         (ref) => !ref.path.endsWith('#collectionTrace'),
      );
      for (const action of missingTrace.assessment.actions) {
         action.evidence = missingTrace.evidence;
      }

      await expect(
         admitReviewVerdict({ runDir, scope, verdict: incomplete }),
      ).rejects.toThrow('every required action');
      await expect(
         admitReviewVerdict({ runDir, scope, verdict: missingTrace }),
      ).rejects.toThrow('evidence kinds are missing');
   });
});

describe('Review evidence freshness and reassessment', () => {
   it('revalidates stored proposals and invalidates changed observations even when the DOM key is unchanged', async () => {
      const proposal = createProposal(bundle);
      await recordVerdict(runDir, proposal);
      bundle.facts.title = 'Changed observation';
      await writeCachedObservationBundle(runDir, bundle);
      const verdicts = await readReviewVerdicts(runDir, scope);

      expect(verdicts[0]?.outcome).toStrictEqual('needsReview');
      expect(verdicts[0]?.rationale).toContain('stale');
   });

   it('rejects fabricated paths and measurements', async () => {
      const measurement = createProposal(bundle),
         path = createProposal(bundle);
      path.evidence[0] = {
         fingerprint: bundle.fingerprint,
         path: '../unrelated.json',
         digest: path.evidence[0]?.digest,
      };
      measurement.measurements = [{ metric: 'invented', value: 0, unit: 'px' }];

      await expect(admitReviewVerdict({ runDir, scope, verdict: path })).rejects.toThrow(
         'registered screenshot',
      );
      await expect(
         admitReviewVerdict({ runDir, scope, verdict: measurement }),
      ).rejects.toThrow('unsupported');
   });
   it('rejects contradictory action outcomes and preserves a partial failure as unfinished work', async () => {
      const contradictory = createProposal(bundle),
         partial = createProposal(bundle);
      if (!contradictory.assessment || !partial.assessment) {
         throw new Error('Expected assessment fixture');
      }
      const first = contradictory.assessment.actions[0];
      if (!first) {
         throw new Error('Expected first action');
      }
      first.outcome = 'failed';
      partial.outcome = 'failed';
      partial.assessment.actions = [first];
      const accepted = await admitReviewVerdict({ runDir, scope, verdict: partial });
      const checks = listReviewObligations({ ...scope, verdicts: [accepted] });

      expect(checks[0]?.outcome).toStrictEqual('failed');
      expect(checks[0]?.complete).toStrictEqual(false);
      await expect(
         admitReviewVerdict({ runDir, scope, verdict: contradictory }),
      ).rejects.toThrow('contradict');
   });

   it('resolves provisional uncertainty with valid reassessment and reopens after a newer blocker', async () => {
      const proposal = createProposal(bundle);
      await recordVerdict(runDir, {
         ...proposal,
         procedureId: undefined,
         assessment: undefined,
         outcome: 'needsReview',
         nextAction: { kind: 'run-procedure', summary: 'Assess the sequence.' },
      });
      await recordVerdict(runDir, proposal);
      const completed = listReviewObligations({
         ...scope,
         verdicts: await readReviewVerdicts(runDir, scope),
      });
      await recordVerdict(runDir, {
         ...proposal,
         outcome: 'cantTell',
         blockerCode: 'capability-unsupported',
         nextAction: {
            kind: 'run-procedure',
            summary: 'Required observation unavailable.',
         },
      });
      const blocked = listReviewObligations({
         ...scope,
         verdicts: await readReviewVerdicts(runDir, scope),
      });

      expect(completed[0]?.complete).toStrictEqual(true);
      expect(blocked[0]?.complete).toStrictEqual(false);
      expect(blocked[0]?.blocked).toStrictEqual(true);
   });
});

describe('Evidence scope and applicability', () => {
   it('refuses to certify a site procedure from a single observed state', async () => {
      const proposal = verdictSchema.parse({
         ...createProposal(bundle),
         ...createCompletedAssessment('3.2.3', bundle),
         criterionId: '3.2.3',
      });

      await expect(
         admitReviewVerdict({
            runDir,
            scope: { ...scope, criterionIds: ['3.2.3'] },
            verdict: proposal,
         }),
      ).rejects.toThrow('broader-scope evidence');
   });

   it('rejects an inapplicability judgment when matching controls were observed', async () => {
      const proposal = verdictSchema.parse({
         ...createProposal(bundle),
         ...createCompletedAssessment('3.3.2', bundle),
         criterionId: '3.3.2',
         outcome: 'inapplicable',
      });
      for (const action of proposal.assessment?.actions ?? []) {
         action.outcome = 'inapplicable';
      }

      await expect(
         admitReviewVerdict({
            runDir,
            scope: { ...scope, criterionIds: ['3.3.2'] },
            verdict: proposal,
         }),
      ).rejects.toThrow('Matching content is observed');
   });
});

describe('Operation completeness', () => {
   it('rejects unsupported operation records as execution evidence', async () => {
      for (const entry of bundle.collectionTrace ?? []) {
         entry.status = 'unsupported';
      }
      await seedObservationFixture(runDir, bundle);

      await expect(
         admitReviewVerdict({ runDir, scope, verdict: createProposal(bundle) }),
      ).rejects.toThrow('No usable evidence');
   });
});

describe('Resolved target evidence', () => {
   it.each(['https://example.com/login', 'https://other.example/test'])(
      'rejects evidence collected at %s for the registered target',
      async (observedURL) => {
         bundle.navigation = {
            requestedURL: bundle.targetUrl,
            loadedURL: observedURL,
            observedURL,
            status: 200,
            frameURLs: [observedURL],
         };
         await seedObservationFixture(runDir, bundle);

         await expect(
            admitReviewVerdict({ runDir, scope, verdict: createProposal(bundle) }),
         ).rejects.toThrow('resolved target separately');
      },
   );
});

describe('Excluded content binding', () => {
   it('rejects a capture with a different exclusion scope', async () => {
      bundle.excludedSelectors = ['chat-widget'];
      await seedObservationFixture(runDir, bundle);

      await expect(
         admitReviewVerdict({ runDir, scope, verdict: createProposal(bundle) }),
      ).rejects.toThrow('excluded-content scope');
      scope.exclusions = [
         { ruleId: 'chat', reason: 'User exclusion', selectors: ['chat-widget'] },
      ];
      const accepted = await admitReviewVerdict({
         runDir,
         scope,
         verdict: createProposal(bundle),
      });

      expect(isAcceptedVerdict(accepted)).toBe(true);
   });
});

describe('Media absence completeness', () => {
   it.each([undefined, 1])(
      'rejects missing or uninspected media inventory %s',
      async (uninspectedTrees) => {
         bundle.facts.mediaInventory =
            uninspectedTrees === undefined
               ? undefined
               : {
                    url: bundle.targetUrl,
                    video: 0,
                    audio: 0,
                    embeds: 0,
                    mediaPlays: 0,
                    audioContexts: 0,
                    uninspectedTrees,
                    method: 'Fixture inventory',
                 };
         await seedObservationFixture(runDir, bundle);
         const proof = createCompletedAssessment('1.2.1', bundle);
         const evidence = [
            ...proof.evidence,
            {
               ...createBundleRef(bundle, 'facts'),
               path: 'bundle.json#facts.mediaInventory',
            },
         ];
         const proposal = verdictSchema.parse({
            ...createProposal(bundle),
            ...proof,
            criterionId: '1.2.1',
            outcome: 'inapplicable',
            evidence,
         });
         for (const action of proposal.assessment?.actions ?? []) {
            action.outcome = 'inapplicable';
            action.evidence = evidence;
         }

         await expect(
            admitReviewVerdict({
               runDir,
               scope: { ...scope, criterionIds: ['1.2.1'] },
               verdict: proposal,
            }),
         ).rejects.toThrow();
      },
   );
});

describe('Layout condition evidence', () => {
   it.each(['1.4.4', '1.4.10', '1.4.12'] as const)(
      'rejects a %s pass backed only by the default root capture',
      async (criterionId) => {
         const proposal = verdictSchema.parse({
            ...createProposal(bundle),
            ...createCompletedAssessment(criterionId, bundle),
            criterionId,
         });

         await expect(
            admitReviewVerdict({
               runDir,
               scope: { ...scope, criterionIds: [criterionId] },
               verdict: proposal,
            }),
         ).rejects.toThrow('verified condition capture');
      },
   );
});

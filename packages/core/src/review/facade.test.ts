/* oxlint-disable max-lines, max-lines-per-function, max-statements, complexity/complexity, no-magic-numbers, unicorn/no-null */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ScopeExclusionRule } from '@a11ied/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
   type ReviewTargetStateInput,
   judge,
   next,
   observe,
   readReviewRunState,
   writeReviewRunState,
   report,
   review,
   run,
   status,
} from '@a11ied/review';
import {
   createCompletedAssessment,
   createMockBundle,
   createPassedJudgment,
   startFixture as start,
} from './review-test-fixtures.js';

describe('Review Facade', () => {
   let testDir = '';

   beforeEach(async () => {
      testDir = await mkdtemp(join(tmpdir(), 'a11ied-review-facade-'));
   });

   afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
   });

   it('rejects another agent and recovers an expired state lease', async () => {
      const bundle = createMockBundle();
      await start({
         runDir: testDir,
         criterionIds: ['1.3.2'],
         states: [{ stateId: bundle.stateId, targetUrl: bundle.targetUrl, bundle }],
      });
      const claimed = await next({ runDir: testDir, agentId: 'owner' });
      const check = claimed.packet?.checks[0];
      if (!check) {
         throw new Error('Expected a claimed check');
      }
      await expect(
         judge({
            runDir: testDir,
            agentId: 'other',
            verdicts: [createPassedJudgment(check, bundle)],
         }),
      ).rejects.toThrow('owns the current state lease');
      const runState = await readReviewRunState(testDir);
      const lease = runState.activeStateLeases[bundle.stateId];
      if (!lease) {
         throw new Error('Expected state lease');
      }
      lease.expiresAt = '2000-01-01T00:00:00.000Z';
      await writeReviewRunState(testDir, runState);

      await expect(
         judge({
            runDir: testDir,
            agentId: 'owner',
            verdicts: [createPassedJudgment(check, bundle)],
         }),
      ).rejects.toThrow('Claim the state again');
      const recovered = await next({ runDir: testDir, agentId: 'replacement' });

      expect(recovered.packet?.lease.agentId).toBe('replacement');
      expect(recovered.packet?.lease.expiresAt).toBeDefined();
      await judge({
         runDir: testDir,
         agentId: 'replacement',
         verdicts: [createPassedJudgment(check, bundle)],
      });
      const complete = await status({ runDir: testDir });

      expect(complete.coverage.unresolved).toBe(0);
   });

   it('rejects a mixed valid and invalid batch without committing its valid prefix', async () => {
      const bundle = createMockBundle();
      await start({
         runDir: testDir,
         criterionIds: ['1.3.2'],
         states: [{ stateId: bundle.stateId, targetUrl: bundle.targetUrl, bundle }],
      });
      const claimed = await next({ runDir: testDir });
      const check = claimed.packet?.checks[0];
      if (!check) {
         throw new Error('Expected check');
      }
      const proposal = createPassedJudgment(check, bundle);

      await expect(
         judge({
            runDir: testDir,
            verdicts: [proposal, { ...proposal, stateId: 'unknown' }],
         }),
      ).rejects.toThrow('registered obligation');
      await expect(
         judge({ runDir: testDir, verdicts: [proposal, proposal] }),
      ).rejects.toThrow('only once per batch');
      const current = await status({ runDir: testDir });

      expect(current.coverage.passed).toBe(0);
      await judge({ runDir: testDir, verdicts: [proposal] });
      const recovered = await status({ runDir: testDir });

      expect(recovered.coverage.unresolved).toBe(0);
   });

   it('observes template members independently and keeps their judgments separate', async () => {
      const observedStates: string[] = [];
      await start({
         runDir: testDir,
         criterionIds: ['1.3.2'],
         states: ['representative', 'member'].map((stateId) => ({
            stateId,
            targetUrl: `https://example.com/${stateId}`,
            templateGroup: {
               templateGroupId: 'shared-layout',
               representativeStateId: 'representative',
               memberRole: stateId === 'representative' ? 'representative' : 'member',
            },
         })),
         observeTarget: async (target) => {
            observedStates.push(target.stateId);
            return createMockBundle({
               stateId: target.stateId,
               targetUrl: target.targetUrl,
               fingerprint: `fp-${target.stateId}`,
            });
         },
      });
      const observation = await observe({ runDir: testDir, stateId: 'representative' });
      if (!observation.bundle) {
         throw new Error('Expected fixture bundle');
      }
      await judge({
         runDir: testDir,
         verdicts: [
            {
               ...createCompletedAssessment('1.3.2', observation.bundle),
               stateId: 'representative',
               criterionId: '1.3.2',
               outcome: 'passed',
               rationale: 'Representative reading sequence assessed.',
            },
         ],
      });
      const result = await status({ runDir: testDir, full: true });

      expect(observedStates.toSorted()).to.eql(['member', 'representative']);
      expect(
         result.verdicts?.some(
            (verdict) => verdict.stateId === 'member' && verdict.outcome === 'passed',
         ),
      ).toStrictEqual(false);
      expect(result.actionable.some((item) => item.stateId === 'member')).toStrictEqual(
         true,
      );
   });

   it('counts expected checks and distinguishes leased work from completion', async () => {
      await start({
         runDir: testDir,
         criterionIds: ['1.3.2'],
         states: [{ stateId: 'page', targetUrl: 'https://example.com' }],
      });
      await next({ runDir: testDir, agentId: 'first' });
      const unavailable = await next({ runDir: testDir, agentId: 'second' });

      expect(unavailable.done).toStrictEqual(false);
      expect(unavailable.reason).toStrictEqual('leased');
      const judgment = await judge({
         runDir: testDir,
         agentId: 'first',
         verdicts: [
            {
               stateId: 'page',
               criterionId: '1.3.2',
               outcome: 'cantTell',
               blockerCode: 'capability-unsupported',
               rationale: 'Required observation unavailable.',
            },
         ],
      });
      const blocked = await next({ runDir: testDir }),
         coverage = await status({ runDir: testDir }),
         retry = await next({ runDir: testDir, stateId: 'page' });

      expect(judgment.closedCount).toStrictEqual(0);
      expect(judgment.remainingCount).toStrictEqual(1);
      expect(blocked.done).toStrictEqual(false);
      expect(blocked.reason).toStrictEqual('blocked');
      expect(coverage.coverage.unresolved).toStrictEqual(1);
      expect(retry.packet?.checks[0]?.criterionId).toStrictEqual('1.3.2');
   });

   it('refuses forced finalization and keeps draft headlines consistent with coverage', async () => {
      const bundle = createMockBundle();
      await start({
         runDir: testDir,
         criterionIds: ['1.3.2'],
         states: [{ stateId: bundle.stateId, targetUrl: bundle.targetUrl, bundle }],
      });

      await expect(report({ runDir: testDir, draft: false })).rejects.toThrow(
         'Final report refused',
      );
      const packet = await next({ runDir: testDir });
      await judge({
         runDir: testDir,
         verdicts: (packet.packet?.checks ?? []).map((check) =>
            createPassedJudgment(check, bundle),
         ),
      });
      const draft = await report({ runDir: testDir, draft: true }),
         final = await report({ runDir: testDir, draft: false });

      expect(draft.report.executiveSummary.overallConformance).toStrictEqual(
         'Draft / Incomplete',
      );
      expect(final.report.isDraft).toStrictEqual(false);
      expect(final.report.snapshot.unresolvedChecks).toStrictEqual(0);
   });

   it('keeps known process gaps visible after all declared page checks are assessed', async () => {
      const bundle = createMockBundle();
      await start({
         runDir: testDir,
         criterionIds: ['1.3.2'],
         scopeGaps: ['Checkout not assessed'],
         states: [{ stateId: bundle.stateId, targetUrl: bundle.targetUrl, bundle }],
      });
      const packet = await next({ runDir: testDir });
      await judge({
         runDir: testDir,
         verdicts: (packet.packet?.checks ?? []).map((check) =>
            createPassedJudgment(check, bundle),
         ),
      });
      const current = await status({ runDir: testDir });
      const remaining = await next({ runDir: testDir });

      expect(current.coverage.unresolved).toBe(0);
      expect(current.scopeGaps).toEqual(['Checkout not assessed']);
      expect(remaining.done).toBe(false);
      await expect(report({ runDir: testDir, draft: false })).rejects.toThrow(
         'Final report refused',
      );
   });

   describe('Test 1: Batch Claim + Batch Judge Turn Count', () => {
      it('admits a batch of complete reader procedures and closes only those checks', async () => {
         const bundle = createMockBundle();
         const startResult = await start({
            runDir: testDir,
            criterionIds: ['1.3.2', '3.1.1'],
            target: 'https://example.com/test',
            states: [
               {
                  stateId: 'root',
                  targetUrl: 'https://example.com/test',
                  bundle,
               },
            ],
         });

         expect(startResult.runId).toBeDefined();
         expect(startResult.openTier2Count).toBe(2);

         // Call 1: Claim available checks in one batch
         const nextResult = await review.next({
            runDir: testDir,
            agentId: 'test-agent',
            count: 12,
         });

         expect(nextResult.done).toBe(false);
         expect(nextResult.packet).toBeDefined();
         expect(nextResult.packet?.bundleSummary.digest).toBeDefined();
         expect(nextResult.packet?.checks[0]?.procedureVersion).toBeDefined();
         expect(nextResult.packet?.checks[0]?.actions.length).toBeGreaterThan(0);
         const packetChecks = nextResult.packet?.checks ?? [];
         expect(packetChecks).toHaveLength(2);
         expect(nextResult.packet?.stateId).toBe('root');
         expect(nextResult.packet?.lease.agentId).toBe('test-agent');
         expect(nextResult.packet?.lease.claimedCheckIds).toHaveLength(2);

         // Verify lease is saved
         const runState = await readReviewRunState(testDir);
         expect(runState.activeStateLeases.root).toBeDefined();
         expect(runState.activeStateLeases.root?.claimedCheckIds).toHaveLength(2);

         // Call 2: Judge the claimed checks in one batch
         const verdictsToJudge = packetChecks.map((check) =>
            createPassedJudgment(check, bundle),
         );

         const judgeResult = await review.judge({
            runDir: testDir,
            agentId: 'test-agent',
            verdicts: verdictsToJudge,
         });

         expect(judgeResult.recordedCount).toBe(2);
         expect(judgeResult.closedCount).toBe(2);

         // Lease should be cleared once all claimed checks are judged
         const updatedState = await readReviewRunState(testDir);
         expect(updatedState.activeStateLeases.root).toBeUndefined();

         // Calling next again should return the remaining checks
         const followUpNext = await review.next({
            runDir: testDir,
            agentId: 'test-agent',
            count: 12,
         });
         expect(followUpNext.done).toBe(true);
         const followUpChecks = followUpNext.packet?.checks ?? [];
         // The previously judged checks are not among the new batch
         const newCheckIds = new Set(
            followUpChecks.map((checkItem) => checkItem.criterionId),
         );
         for (const judged of verdictsToJudge) {
            expect(newCheckIds.has(judged.criterionId)).toBe(false);
         }
      });
   });

   describe('Test 2: Disjoint-State Multi-Agent Parallelism', () => {
      it('allows two agents to concurrently claim disjoint states and judge them without conflict', async () => {
         const bundleA = createMockBundle({
            fingerprint: 'fp-state-a',
            stateId: 'state-a',
            targetUrl: 'https://example.com/page-a',
         });
         const bundleB = createMockBundle({
            fingerprint: 'fp-state-b',
            stateId: 'state-b',
            targetUrl: 'https://example.com/page-b',
         });

         await start({
            runDir: testDir,
            criterionIds: ['1.3.2', '3.1.1'],
            states: [
               {
                  stateId: 'state-a',
                  targetUrl: 'https://example.com/page-a',
                  bundle: bundleA,
               },
               {
                  stateId: 'state-b',
                  targetUrl: 'https://example.com/page-b',
                  bundle: bundleB,
               },
            ],
         });

         // Agent A claims State A, Agent B claims State B concurrently
         const [nextA, nextB] = await Promise.all([
            next({ runDir: testDir, stateId: 'state-a', agentId: 'agent-a', count: 5 }),
            next({ runDir: testDir, stateId: 'state-b', agentId: 'agent-b', count: 5 }),
         ]);

         expect(nextA.packet?.stateId).toBe('state-a');
         expect(nextA.packet?.lease.agentId).toBe('agent-a');
         expect(nextB.packet?.stateId).toBe('state-b');
         expect(nextB.packet?.lease.agentId).toBe('agent-b');

         // Verify that Agent B cannot claim State A while leased to Agent A
         await expect(
            next({ runDir: testDir, stateId: 'state-a', agentId: 'agent-b', count: 5 }),
         ).rejects.toThrow('state-already-leased');

         // Both agents commit verdicts concurrently
         const checksA = nextA.packet?.checks ?? [];
         const verdictsA = checksA.map((check) => createPassedJudgment(check, bundleA));

         const checksB = nextB.packet?.checks ?? [];
         const verdictsB = checksB.map((check) => createPassedJudgment(check, bundleB));

         const [judgeA, judgeB] = await Promise.all([
            judge({ runDir: testDir, agentId: 'agent-a', verdicts: verdictsA }),
            judge({ runDir: testDir, agentId: 'agent-b', verdicts: verdictsB }),
         ]);

         expect(judgeA.recordedCount).toBe(2);
         expect(judgeB.recordedCount).toBe(2);

         const finalRunState = await readReviewRunState(testDir);
         expect(finalRunState.activeStateLeases['state-a']).toBeUndefined();
         expect(finalRunState.activeStateLeases['state-b']).toBeUndefined();
      });
   });

   describe('Test 3: Actionable Status Payload Size (P1-9)', () => {
      it('returns <= 20 items and < 8 KB payload for a large run, but returns all when full: true', async () => {
         // Create 50 states x 40 criteria = 2,000 checks
         const largeStates: ReviewTargetStateInput[] = [];
         for (let index = 0; index < 50; index += 1) {
            largeStates.push({
               stateId: `state-${index}`,
               targetUrl: `https://example.com/page-${index}`,
               bundle: createMockBundle({
                  fingerprint: `fp-large-${index}`,
                  stateId: `state-${index}`,
                  targetUrl: `https://example.com/page-${index}`,
               }),
            });
         }

         await start({
            runDir: testDir,
            states: largeStates,
         });

         // Default status: bounded actionable view
         const compactStatus = await status({ runDir: testDir });
         expect(compactStatus.actionable.length).toBeLessThanOrEqual(20);

         const serialized = JSON.stringify(compactStatus);
         const byteLength = Buffer.byteLength(serialized, 'utf8');
         // Assert under 8 KB budget
         expect(byteLength).toBeLessThan(8192);

         // Full status: contains all items
         const fullStatus = await status({ runDir: testDir, full: true });
         expect(fullStatus.actionable.length).toBeGreaterThan(20);
         expect(fullStatus.pageVerdicts).toBeDefined();
         expect(fullStatus.states).toHaveLength(50);
      });
   });

   describe('Test 4: Done Validation & End-to-End Flow', () => {
      it('rejects cantTell with invalid blockerCode', async () => {
         const bundle = createMockBundle();
         await start({
            runDir: testDir,
            states: [{ stateId: 'root', targetUrl: 'https://example.com', bundle }],
         });

         await expect(
            judge({
               runDir: testDir,
               verdicts: [
                  {
                     criterionId: '2.1.1',
                     stateId: 'root',
                     outcome: 'cantTell',
                     rationale: 'Could not test',
                     blockerCode: 'non-existent-blocker-code' as unknown as never,
                  },
               ],
            }),
         ).rejects.toThrow('blockerCode');
      });

      it('rejects inapplicable verdict when matching elements are observed', async () => {
         // Bundle with forms present (facts.forms = 2)
         const bundle = createMockBundle({
            facts: {
               forms: 2,
               media: { video: 0, audio: 0, autoplay: 0, embeds: [] },
            },
         });

         await start({
            runDir: testDir,
            states: [{ stateId: 'root', targetUrl: 'https://example.com', bundle }],
         });

         // 3.3.2 Labels or Instructions has inapplicabilityKind: 'no-form'
         // Because facts.forms > 0, marking 3.3.2 as inapplicable must be rejected!
         await expect(
            judge({
               runDir: testDir,
               verdicts: [
                  {
                     criterionId: '3.3.2',
                     stateId: 'root',
                     outcome: 'inapplicable',
                     rationale: 'Marking as inapplicable falsely',
                  },
               ],
            }),
         ).rejects.toThrow();
      });

      it('completes end-to-end review flow: start -> next -> observe -> judge -> report', async () => {
         const bundleRoot = createMockBundle({
            fingerprint: 'fp-e2e-root',
            stateId: 'root',
            targetUrl: 'https://example.com/',
         });

         const bundleMenu = createMockBundle({
            fingerprint: 'fp-e2e-menu',
            stateId: 'interactive-menu',
            targetUrl: 'https://example.com/menu',
         });

         const exclusions: ScopeExclusionRule[] = [
            {
               ruleId: 'exclude-third-party-widget',
               reason: 'Third-party chat widget out of audit scope',
               stateIds: ['third-party-widget'],
            },
         ];

         // 1. review.start
         const startRes = await start({
            runDir: testDir,
            target: 'https://example.com',
            criterionIds: ['1.3.2', '3.1.1'],
            exclusions,
            states: [
               {
                  stateId: 'root',
                  targetUrl: 'https://example.com/',
                  bundle: bundleRoot,
                  templateGroup: {
                     templateGroupId: 'group-main',
                     representativeStateId: 'root',
                     memberRole: 'representative',
                  },
               },
               {
                  stateId: 'interactive-menu',
                  targetUrl: 'https://example.com/menu',
                  bundle: bundleMenu,
                  setup: [{ action: 'click', selector: '#menu-btn' }],
               },
               {
                  stateId: 'third-party-widget',
                  targetUrl: 'https://example.com/widget',
                  excluded: true,
                  exclusionReason: 'Third-party chat widget out of audit scope',
               },
            ],
         });

         expect(startRes.runId).toBeDefined();
         expect(startRes.statesCount).toBe(3);

         // 2. review.next
         const nextRes = await next({
            runDir: testDir,
            count: 5,
         });
         expect(nextRes.packet).toBeDefined();
         expect(nextRes.packet?.checks.length).toBeGreaterThan(0);

         // 3. review.observe slice
         const observedAxe = await observe({
            runDir: testDir,
            stateId: 'root',
            slice: 'axe',
         });
         expect(observedAxe.stateId).toBe('root');
         expect(observedAxe.slice).toBe('axe');
         expect(observedAxe.data).toBeDefined();

         // 4. review.judge: judge the claimed checks
         const nextChecks = nextRes.packet?.checks ?? [];
         const judgedBatch = nextChecks.map((check) =>
            createPassedJudgment(check, bundleRoot),
         );

         const judgeRes = await judge({
            runDir: testDir,
            verdicts: judgedBatch,
         });
         expect(judgeRes.closedCount).toBe(judgedBatch.length);

         // 5. review.report
         const reportDir = join(testDir, 'draft-report');
         const reportRes = await report({
            runDir: testDir,
            outDir: reportDir,
            draft: true,
         });

         expect(reportRes.report).toBeDefined();
         expect(reportRes.paths.jsonPath).toContain('verdict-report.json');
         expect(reportRes.paths.htmlPath).toContain('verdict-report.html');
         expect(reportRes.paths.markdownPath).toContain('verdict-report.md');
      });

      it('review.run convenience wrapper produces start, draft report, and first packet', async () => {
         const bundle = createMockBundle();
         const runRes = await run({
            runDir: testDir,
            target: 'https://example.com',
            states: [
               {
                  stateId: 'root',
                  targetUrl: 'https://example.com',
                  bundle,
               },
            ],
         });

         expect(runRes.runId).toBeDefined();
         expect(runRes.startResult).toBeDefined();
         expect(runRes.draftReport).toBeDefined();
         expect(runRes.firstPacket).toBeDefined();
         expect(runRes.firstPacket?.checks.length).toBeGreaterThan(0);
      });
   });
});

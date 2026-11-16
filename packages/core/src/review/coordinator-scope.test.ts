import { z } from 'zod';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
   createAuditRun,
   getAssessmentCatalog,
   nextAuditAssessment,
   registerAuditState,
   registerAuditJourney,
   transitionAssessmentCheck,
   updateAuditRun,
} from '@a11ied/core';
import { getObservationDigest, writeCachedObservationBundle } from '@a11ied/observe';
import {
   evidenceRecordSchema,
   type AuditRun,
   type EvidenceRecord,
   type ObservationBundle,
} from '@a11ied/contracts';
import {
   createMockBundle,
   seedObservationFixture,
   startFixture,
} from './review-test-fixtures.js';
import {
   createBroaderEvidenceTestAssessment,
   type EvidenceTestFixture,
} from '../evidence/test-fixtures.js';
import { attachObservedAuditInventory } from '../audit/test-fixtures.js';
import { DEFAULT_WCAG_22_AA_CRITERIA } from '@a11ied/report';
import {
   listBroaderReviewObligations,
   listStateReviewCriteria,
   next,
   readCoordinatedReviewScope,
   readReviewRunState,
   report,
   resume,
   status,
   writeReviewRunState,
   type ReviewRunState,
   type ReviewCoordinatorLink,
} from '@a11ied/review';

import { EXIT_USAGE, runCli } from '../../../cli/src/testing/setup.js';
import { withHarness } from '../../../mcp-server/src/testing/harness.js';

const DIGEST_HEX_LENGTH = 64;

async function assertPublicFinalization(input: {
   runDir: string;
   root: string;
   runId: string;
   coordinator: ReviewCoordinatorLink;
}): Promise<void> {
   const resumed = await runCli([
      'review',
      'resume',
      '--run-dir',
      input.runDir,
      '--run-id',
      input.runId,
      '--coordinator',
      input.coordinator.file,
      '--coordinator-run-id',
      input.coordinator.runId,
      '--json',
   ]);
   const final = await runCli(['review', 'report', '--run-dir', input.runDir, '--json']);

   expect(resumed.status, resumed.stdout).toStrictEqual(0);
   expect(final.status, final.stdout).toStrictEqual(0);
   const cliReport: unknown = JSON.parse(final.stdout);

   expect(cliReport).toMatchObject({
      report: { executiveSummary: { seriousFindingsCount: 1 } },
   });
   await withHarness(async ({ client }) => {
      const attached = await client.callTool({
         name: 'review.resume',
         arguments: {
            runDir: input.runDir,
            runId: input.runId,
            coordinator: input.coordinator,
         },
      });
      const rendered = await client.callTool({
         name: 'review.report',
         arguments: { runDir: input.runDir, draft: false },
      });

      expect(attached.isError).toBeFalsy();
      expect(rendered.isError).toBeFalsy();
      expect(rendered.structuredContent).toMatchObject({
         report: { isDraft: false, snapshot: { completeChecks: 1 } },
      });
      await writeFile(join(input.root, 'observation.json'), 'tampered');
      const refused = await client.callTool({
         name: 'review.report',
         arguments: { runDir: input.runDir, draft: false },
      });

      expect(refused.isError).toStrictEqual(true);
   });
   const refused = await runCli([
      'review',
      'report',
      '--run-dir',
      input.runDir,
      '--json',
   ]);

   expect(refused.status).toStrictEqual(EXIT_USAGE);
   expect(refused.stdout).toContain('Final report refused');
}

let directory = '';
let fixture: { run?: ReviewRunState; link?: ReviewCoordinatorLink } = {};
let bundles: ObservationBundle[] = [];

function getFixture(): { run: ReviewRunState; link: ReviewCoordinatorLink } {
   if (!fixture.run || !fixture.link) {
      throw new Error('Fixture not initialized');
   }
   return { run: fixture.run, link: fixture.link };
}

beforeEach(async () => {
   directory = await mkdtemp(join(tmpdir(), 'review-coordinator-scope-'));
   bundles = ['first', 'second'].map((stateId) =>
      createMockBundle({
         stateId,
         fingerprint: `snapshot-${stateId}`,
         targetUrl: `https://example.com/${stateId}`,
         setup: stateId === 'second' ? [{ action: 'press', key: 'Escape' }] : [],
      }),
   );
   await startFixture({
      runDir: directory,
      targetOrigin: 'https://example.com',
      criterionIds: ['2.4.5'],
      states: bundles.map((bundle) => ({
         stateId: bundle.stateId,
         targetUrl: bundle.targetUrl,
         setup: bundle.setup,
         bundle,
      })),
   });
   const run = await readReviewRunState(directory);
   const environment = bundles[0]?.environment;
   if (!environment) {
      throw new Error('Missing fixture environment');
   }
   const created = await createAuditRun({
      file: join(directory, 'coordinator', 'run.json'),
      target: { kind: 'url', value: 'https://example.com/first' },
      scope: 'site',
      profile: { wcagVersion: '2.2', level: 'AA' },
      environment,
   });
   const link = { file: created.file, runId: created.run.runId };
   await Promise.all(
      bundles.map(async (bundle) =>
         registerAuditState({
            file: link.file,
            state: {
               stateId: bundle.stateId,
               target: { kind: 'url', value: bundle.targetUrl },
               label: bundle.stateId,
               fingerprint: bundle.fingerprint,
               observationDigest: getObservationDigest(bundle),
               environmentId: environment.environmentId,
               artifacts: [],
               setup: bundle.setup.length > 0 ? ['Press Escape'] : [],
            },
         }),
      ),
   );
   fixture = { run, link };
});

afterEach(async () => {
   await rm(directory, { recursive: true, force: true });
});

describe('Coordinator scope binding', () => {
   it('binds the complete current roots without treating an unevaluated coordinator as complete', async () => {
      const { run, link } = getFixture();
      const result = await readCoordinatedReviewScope({ run, link });

      expect(result.roots.map((root) => root.stateId)).toEqual(['first', 'second']);
      expect(result.roots.every((root) => root.digest.length > 0)).toStrictEqual(true);
      expect(result.snapshot.records).toEqual([]);
      expect(result.snapshot.status.complete).toStrictEqual(false);
   });

   it.each([
      'run',
      'target',
      'fingerprint',
      'environment',
      'missing-state',
      'observation-digest',
   ] as const)('rejects coordinator %s mismatches', async (mismatch) => {
      const { run, link } = getFixture();
      if (mismatch === 'environment') {
         const first = bundles[0];
         if (!first?.environment) {
            throw new Error('Missing fixture environment');
         }
         first.environment.limitations.push('Different observation environment');
         await seedObservationFixture(directory, first);
      }
      if (mismatch === 'run') {
         link.runId = 'another-run';
      } else {
         await updateAuditRun({
            file: link.file,
            change(current) {
               const first = current.states[0];
               if (!first) {
                  throw new Error('Missing fixture state');
               }
               if (mismatch === 'target') {
                  first.target.value = 'https://example.com/different';
               }
               if (mismatch === 'fingerprint') {
                  first.fingerprint = 'stale-snapshot';
               }
               if (mismatch === 'observation-digest') {
                  first.observationDigest = '0'.repeat(DIGEST_HEX_LENGTH);
               }
               if (mismatch === 'missing-state') {
                  current.states.pop();
               }
               return current;
            },
         });
      }

      await expect(readCoordinatedReviewScope({ run, link })).rejects.toThrow(
         /coordinator/iu,
      );
   });
});

describe('Review root freshness', () => {
   it.each(['setup', 'exclusions', 'bundle-bytes'] as const)(
      'rejects changed %s before admitting broader scope',
      async (mismatch) => {
         const { run, link } = getFixture();
         const first = bundles[0];
         if (!first) {
            throw new Error('Missing fixture root');
         }
         if (mismatch === 'bundle-bytes') {
            first.facts.changed = true;
            await writeCachedObservationBundle(directory, first);
         }
         if (mismatch === 'setup') {
            const state = run.states[0];
            if (state) {
               state.setup = [{ action: 'press', key: 'Tab' }];
            }
         }
         if (mismatch === 'exclusions') {
            run.exclusions = [
               { ruleId: 'chat', selectors: ['chat-widget'], reason: 'Changed scope' },
            ];
         }

         await expect(readCoordinatedReviewScope({ run, link })).rejects.toThrow();
      },
   );
});

describe('Coordinated coverage units', () => {
   it('creates one site unit across multiple roots and keeps queued proof unresolved', async () => {
      const { run, link } = getFixture();
      const scope = await readCoordinatedReviewScope({ run, link });
      const obligations = listBroaderReviewObligations({ run, scope });

      expect(listStateReviewCriteria(run)).to.eql([]);
      expect(obligations).toHaveLength(1);
      expect(obligations[0]?.stateIds).to.eql(['first', 'second']);
      expect(obligations[0]?.complete).toStrictEqual(false);
   });

   it('retains a missing journey obligation instead of removing its coverage', async () => {
      const { run, link } = getFixture();
      const scope = await readCoordinatedReviewScope({ run, link });
      const procedure = getAssessmentCatalog(scope.snapshot.status.run).procedures.find(
         (entry) => entry.scope === 'journey',
      );
      if (!procedure) {
         throw new Error('The catalog must contain journey procedures.');
      }
      const obligations = listBroaderReviewObligations({
         run: { ...run, criterionIds: DEFAULT_WCAG_22_AA_CRITERIA },
         scope,
      });
      const missing = obligations.find(
         (entry) => entry.procedureId === procedure.procedureId,
      );

      expect(missing?.scope).toStrictEqual('journey');
      expect(missing?.complete).toStrictEqual(false);
      expect(missing?.reasons.join(' ')).toContain('No valid ordered journey');
   });
});

describe('Coordinated review facade', () => {
   it('resumes existing roots, routes broader work and refuses an incomplete final report', async () => {
      const { run, link } = getFixture();
      const result = await resume({
         runDir: directory,
         runId: run.runId,
         coordinator: link,
      });
      const saved = await readReviewRunState(directory);
      const batch = await next({ runDir: directory });
      const draft = await report({ runDir: directory, draft: true });

      expect(saved.states).to.eql(run.states);
      expect(saved.activeStateLeases).to.eql(run.activeStateLeases);
      expect(result.coverage.totalObligations).toStrictEqual(1);
      expect(result.coverage.unresolved).toStrictEqual(1);
      expect(batch.reason).toStrictEqual('coordinator-work');
      expect(batch.done).toStrictEqual(false);
      expect(batch.coordinatorNextAction?.arguments).toMatchObject({
         action: 'next',
         scopes: ['site', 'journey'],
      });
      expect(draft.report.snapshot.expectedChecks).toStrictEqual(1);
      expect(draft.report.snapshot.unresolvedChecks).toStrictEqual(1);
      expect(draft.report.vpatTable[0]?.needsReviewStates).to.eql([]);
      expect(draft.report.coordinator?.obligations).toHaveLength(1);
      await expect(report({ runDir: directory, draft: false })).rejects.toThrow(
         'Final report refused',
      );
   });

   it('requeues only stale broader checks before dispatching another claim', async () => {
      const { run, link } = getFixture();
      await nextAuditAssessment(link.file, { scopes: ['journey'] });
      await updateAuditRun({
         file: link.file,
         change(current) {
            const site = current.checks.find(
               (check) => check.scope === 'site' && check.criterionId === '2.4.5',
            );
            if (!site) {
               throw new Error('Missing site obligation.');
            }
            site.status = 'stale';
            site.reason = 'The observed state changed.';
            return current;
         },
      });
      await resume({ runDir: directory, runId: run.runId, coordinator: link });
      await withHarness(async ({ client }) => {
         const batch = await next({ runDir: directory });
         const action = batch.coordinatorNextAction;
         if (!action || action.arguments.action !== 'resume') {
            throw new Error('Expected explicit stale recovery action.');
         }
         const recovered = await client.callTool({
            name: action.tool,
            arguments: action.arguments,
         });

         expect(recovered.isError).toBeFalsy();
         expect(action.arguments.retryCheckIds).toHaveLength(1);
         const queued = await next({ runDir: directory });

         expect(queued.coordinatorNextAction?.arguments.action).toStrictEqual('next');
         const claimed = await nextAuditAssessment(link.file, {
            scopes: ['site', 'journey'],
         });

         expect(claimed.checks?.[0]?.scope).toStrictEqual('site');
         expect(claimed.checks?.[0]?.status).toStrictEqual('running');
         const racedRecovery = await client.callTool({
            name: action.tool,
            arguments: action.arguments,
         });
         const owned = await status({ runDir: directory });

         expect(racedRecovery.isError).toStrictEqual(true);
         expect(owned.execution.state).toStrictEqual('waiting');
      });
   });
});

describe('Selected coordinator claims', () => {
   it('claims the selected journey criterion while leaving earlier unrelated work queued', async () => {
      const { run, link } = getFixture();
      await writeReviewRunState(directory, { ...run, criterionIds: ['3.3.4'] });
      await registerAuditJourney({
         file: link.file,
         journey: {
            journeyId: 'help',
            label: 'Help journey',
            stateIds: ['first', 'second'],
            status: 'discovered',
         },
      });
      await resume({ runDir: directory, runId: run.runId, coordinator: link });
      const batch = await next({ runDir: directory });
      const action = batch.coordinatorNextAction;
      if (!action || action.arguments.action !== 'next') {
         throw new Error('Expected a selected journey claim.');
      }
      await withHarness(async ({ client }) => {
         const claimed = await client.callTool({
            name: action.tool,
            arguments: action.arguments,
         });

         expect(claimed.isError).toBeFalsy();
         expect(claimed.structuredContent).toMatchObject({
            result: { next: { checks: [{ criterionId: '3.3.4' }] } },
         });
      });
      const scoped = await readCoordinatedReviewScope({
         run: await readReviewRunState(directory),
         link,
      });
      const unrelated = scoped.snapshot.status.run.checks.find(
         (check) => check.criterionId === '2.2.1',
      );

      expect(unrelated?.status).toStrictEqual('queued');
      expect(unrelated?.attempts).toStrictEqual(0);
   });
});

describe('Coordinator continuation', () => {
   it('keeps missing journey collection runnable instead of repeating an empty coordinator claim', async () => {
      const { run, link } = getFixture();
      await writeReviewRunState(directory, { ...run, criterionIds: ['3.3.4'] });
      await resume({ runDir: directory, runId: run.runId, coordinator: link });
      const progress = await status({ runDir: directory });
      const batch = await next({ runDir: directory });

      expect(progress.execution.state).toStrictEqual('runnable');
      expect(batch.reason).toStrictEqual('scope-required');
      expect(batch.done).toStrictEqual(false);
      expect(batch.execution?.nextAction).toMatchObject({ kind: 'collect-scope' });
      expect(batch.coordinatorNextAction).toBeUndefined();
   });

   it('waits for active coordinator work without reclaiming it through another scope', async () => {
      const { run, link } = getFixture();
      const owned = await nextAuditAssessment(link.file, { scopes: ['state'] });
      if (!owned.checks?.length) {
         throw new Error('The fixture needs an active coordinator claim.');
      }
      await resume({ runDir: directory, runId: run.runId, coordinator: link });
      const progress = await status({ runDir: directory });
      const batch = await next({ runDir: directory });

      expect(progress.execution.state).toStrictEqual('waiting');
      expect(batch.reason).toStrictEqual('leased');
      expect(batch.done).toStrictEqual(false);
      expect(batch.coordinatorNextAction).toBeUndefined();
   });

   it('rejects a different review identity without writing a coordinator link', async () => {
      const { link } = getFixture();

      await expect(
         resume({ runDir: directory, runId: 'wrong-review', coordinator: link }),
      ).rejects.toThrow('current review run ID');
      const saved = await readReviewRunState(directory);

      expect(saved.coordinator).toBeUndefined();
   });
});

async function prepareReviewedEvidenceScope(input: {
   file: string;
   run: AuditRun;
}): Promise<void> {
   const environment = input.run.environments[0],
      state = input.run.states[0];
   if (!state || !environment) {
      throw new Error('Missing site fixture scope.');
   }
   const runDir = join(dirname(input.file), 'review');
   const bundle = createMockBundle({
      stateId: state.stateId,
      targetUrl: state.target.value,
      fingerprint: state.fingerprint,
      environment,
   });
   await startFixture({
      runDir,
      targetOrigin: new URL(state.target.value).origin,
      criterionIds: ['2.4.5'],
      states: [{ stateId: state.stateId, targetUrl: state.target.value, bundle }],
   });
   await registerAuditState({
      file: input.file,
      state: {
         ...state,
         observationDigest: getObservationDigest(bundle),
      },
   });
}

function failSiteFixture(record: EvidenceRecord): void {
   const action = record.assessment?.actions[0];
   if (!action) {
      throw new Error('Missing explicit fixture action.');
   }
   record.outcome = 'failed';
   action.outcome = 'failed';
   record.finding = {
      title: 'Fixture navigation failure',
      userImpact: 'Fixture users cannot find the alternate route.',
      remediation: 'Provide a second navigation route.',
      impact: 'serious',
   };
}

async function recordSiteFixture(evidence: EvidenceTestFixture): Promise<EvidenceRecord> {
   let accepted: EvidenceRecord | undefined = undefined;
   await withHarness(async ({ client }) => {
      const recorded = await client.callTool({
         name: 'record_result',
         arguments: {
            target: evidence.record.subject,
            runFile: evidence.runFile,
            wcagVersion: '2.2',
            criterionId: '2.4.5',
            procedureId: 'wcag_2_4_5',
            outcome: evidence.record.outcome,
            provenance: evidence.record.provenance,
            assessment: evidence.record.assessment,
            finding: evidence.record.finding,
         },
      });

      expect(recorded.isError).toBeFalsy();
      expect(recorded.structuredContent).toMatchObject({
         result: { file: evidence.file },
      });
      accepted = z
         .object({ result: z.object({ record: evidenceRecordSchema }) })
         .parse(recorded.structuredContent).result.record;
   });
   if (!accepted) {
      throw new Error('Missing accepted public evidence result.');
   }
   return accepted;
}

describe('Broader final report evidence', () => {
   it('finalizes current site proof once and refuses finalization after artifact tampering', async () => {
      const evidence = await createBroaderEvidenceTestAssessment(
         '2.2',
         prepareReviewedEvidenceScope,
      );
      const root = dirname(evidence.runFile);
      try {
         failSiteFixture(evidence.record);
         const runDir = join(root, 'review');
         await attachObservedAuditInventory({
            file: evidence.runFile,
            run: evidence.run,
         });
         const accepted = await recordSiteFixture(evidence);
         await transitionAssessmentCheck({
            file: evidence.runFile,
            checkId: evidence.record.provenance?.checkId ?? '',
            status: 'evaluated',
            outcome: 'failed',
            evidenceIds: [accepted.evidenceId ?? ''],
         });
         const reviewRun = await readReviewRunState(runDir);
         await resume({
            runDir,
            runId: reviewRun.runId,
            coordinator: { file: evidence.runFile, runId: evidence.run.runId },
         });
         const final = await report({ runDir, draft: false });
         const batch = await next({ runDir });
         const html = await readFile(final.paths.htmlPath, 'utf8');

         expect(final.report.isDraft).toStrictEqual(false);
         expect(final.report.executiveSummary.seriousFindingsCount).toStrictEqual(1);
         expect(final.report.methodologyDisclosure.tierCounts.tier2).toStrictEqual(1);
         expect(final.report.snapshot.expectedChecks).toStrictEqual(1);
         expect(final.report.snapshot.completeChecks).toStrictEqual(1);
         expect(final.report.vpatTable[0]?.conformance).toStrictEqual('Does Not Support');
         expect(final.report.vpatTable[0]?.passedStates).to.eql([]);
         expect(batch.done).toStrictEqual(true);
         expect(html).toContain('Site and journey assessments');
         expect(html).toContain('Fixture observation');
         expect(html).toContain('Fixture users cannot find the alternate route.');
         expect(html).toContain('Provide a second navigation route.');
         await assertPublicFinalization({
            runDir,
            root,
            runId: reviewRun.runId,
            coordinator: { file: evidence.runFile, runId: evidence.run.runId },
         });

         await expect(report({ runDir, draft: false })).rejects.toThrow(
            'Final report refused',
         );
         const reopened = await next({ runDir });

         expect(reopened.done).toStrictEqual(false);
      } finally {
         await rm(root, { recursive: true, force: true });
      }
   });
});

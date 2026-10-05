import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditRun } from '@a11ied/contracts';
import { createAuditRun, readAuditRun, updateAuditRun } from './run-store.js';
import {
   registerAuditJourney,
   registerAuditState,
   transitionAssessmentCheck,
} from './run-state.js';
import {
   startAuditAssessment,
   nextAuditAssessment,
   getAuditAssessmentStatus,
   resumeAuditAssessment,
   finalizeAuditAssessment,
} from './run-lifecycle.js';
import { listAssessmentObligations } from './run-obligations.js';
import { buildState, environment, target } from './test-fixtures.js';
import {
   createEvidenceTestAssessment,
   type EvidenceTestFixture,
} from '../evidence/test-fixtures.js';
import { recordEvidence } from '../evidence/store.js';
import { buildInitialInventory, writeInventoryAtomic } from '../discovery/inventory.js';

const roots: string[] = [];

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function buildAssessment(): Promise<EvidenceTestFixture> {
   const fixture = await createEvidenceTestAssessment(['keyboard', 'screenshot']);
   roots.push(dirname(fixture.runFile));
   return fixture;
}

async function buildRun(): Promise<{ file: string; run: AuditRun }> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11ied-lifecycle-'));
   roots.push(root);
   const created = await createAuditRun({
      file: resolve(root, 'run.json'),
      target,
      environment: {
         ...environment,
         capabilities: ['rendered-ui', 'dom', 'keyboard', 'screenshot'],
      },
      profile: { wcagVersion: '2.2', level: 'AA' },
      scope: 'site',
   });
   const run = await registerAuditState({ file: created.file, state: buildState() });
   return { file: created.file, run };
}

async function completeFixture(fixture: EvidenceTestFixture): Promise<AuditRun> {
   const saved = await recordEvidence(fixture.record, fixture);
   return transitionAssessmentCheck({
      file: fixture.runFile,
      checkId: saved.record.provenance?.checkId ?? '',
      status: 'evaluated',
      outcome: saved.record.outcome,
      evidenceIds: [saved.record.evidenceId ?? ''],
   });
}

describe('saved assessment evidence', () => {
   it('completes a genuine saved assessment and rejects duplicate completion', async () => {
      const fixture = await buildAssessment();
      await completeFixture(fixture);
      const status = await getAuditAssessmentStatus(fixture.runFile);

      expect(status.coverage.assessed).toStrictEqual(1);
      expect(status.complete).toStrictEqual(false);
      await expect(completeFixture(fixture)).rejects.toThrow('Cannot transition');
   });

   it('keeps identical observations valid and revokes coverage when an artifact disappears', async () => {
      const fixture = await buildAssessment();
      await completeFixture(fixture);
      const state = fixture.run.states[0];
      if (!state) {
         throw new Error('Missing observed fixture state.');
      }
      await registerAuditState({ file: fixture.runFile, state });
      const beforeRemoval = await getAuditAssessmentStatus(fixture.runFile),
         refreshed = await readAuditRun(fixture.runFile);

      expect(refreshed.states[0]?.observedAt).toStrictEqual(state.observedAt);
      expect(beforeRemoval.coverage.assessed).toStrictEqual(1);
      await rm(resolve(dirname(fixture.runFile), 'observation.json'), { force: true });
      const checkId = fixture.record.provenance?.checkId ?? '',
         status = await getAuditAssessmentStatus(fixture.runFile);

      expect(status.coverage.assessed).toStrictEqual(0);
      expect(
         status.issues.some((issue) => issue.code === 'audit-check-evidence-invalid'),
      ).toStrictEqual(true);
      const resumed = await resumeAuditAssessment({
         file: fixture.runFile,
         retryCheckIds: [checkId],
      });

      expect(
         resumed.run.checks.find((check) => check.checkId === checkId)?.status,
      ).toStrictEqual('queued');
   });
});

describe('current assessment attempts', () => {
   it('rejects mismatched outcomes and evidence from an earlier attempt', async () => {
      const fixture = await buildAssessment();
      const saved = await recordEvidence(fixture.record, fixture);
      const checkId = saved.record.provenance?.checkId ?? '';
      const completion = {
         file: fixture.runFile,
         checkId,
         status: 'evaluated' as const,
         evidenceIds: [saved.record.evidenceId ?? ''],
      };

      await expect(
         transitionAssessmentCheck({ ...completion, outcome: 'failed' }),
      ).rejects.toThrow('verified evidence');
      await transitionAssessmentCheck({
         file: fixture.runFile,
         checkId,
         status: 'blocked',
         reason: 'Interrupted during evaluation.',
      });
      await resumeAuditAssessment({ file: fixture.runFile, retryCheckIds: [checkId] });
      await nextAuditAssessment(fixture.runFile);

      await expect(
         transitionAssessmentCheck({ ...completion, outcome: 'passed' }),
      ).rejects.toThrow('verified evidence');
   });

   it('keeps uncertain results unresolved after an attempted evaluation', async () => {
      const fixture = await buildAssessment();
      fixture.record.outcome = 'cantTell';
      await completeFixture(fixture);
      const status = await getAuditAssessmentStatus(fixture.runFile);

      expect(status.coverage.assessed).toStrictEqual(0);
      expect(status.coverage.attempted).toStrictEqual(1);
      expect(
         status.issues.some((issue) => issue.code === 'audit-check-uncertain'),
      ).toStrictEqual(true);
      await expect(finalizeAuditAssessment({ file: fixture.runFile })).rejects.toThrow(
         'unresolved',
      );
      const partial = await finalizeAuditAssessment({
         file: fixture.runFile,
         allowPartial: true,
      });

      expect(partial.run.status).toStrictEqual('active');
   });
});

describe('atomic coordinator selection', () => {
   it('claims only one check across competing callers and keeps interrupted work blocked', async () => {
      const { file } = await buildRun();
      const results = await Promise.allSettled([
         nextAuditAssessment(file),
         nextAuditAssessment(file),
      ]);
      const claimed = await readAuditRun(file);
      const running = claimed.checks.find((check) => check.status === 'running');
      if (!running) {
         throw new Error('No obligation was claimed.');
      }

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(claimed.checks.filter((check) => check.status === 'running')).toHaveLength(
         1,
      );
      expect(running.attempts).toStrictEqual(1);
      const resumed = await resumeAuditAssessment({
         file,
         retryCheckIds: [running.checkId],
      });

      expect(
         resumed.run.checks.find((check) => check.checkId === running.checkId)?.status,
      ).toStrictEqual('blocked');
      const next = await nextAuditAssessment(file);

      expect(next.check?.checkId).not.toStrictEqual(running.checkId);
      expect(next.procedure?.actions.length).toBeGreaterThan(0);
   });

   it('starts a durable run and exposes missing scope without inventing state observations', async () => {
      const root = await mkdtemp(resolve(tmpdir(), 'a11ied-start-'));
      roots.push(root);
      const started = await startAuditAssessment({
         file: resolve(root, 'run.json'),
         target,
         environment,
         profile: { wcagVersion: '2.2', level: 'AA' },
         scope: 'page',
      });
      const stored = await readAuditRun(started.file);

      expect(started.status.run.states).to.eql([]);
      expect(started.status.complete).toStrictEqual(false);
      expect(
         started.status.issues.some((issue) => issue.code === 'audit-states-missing'),
      ).toStrictEqual(true);
      expect(stored.runId).toStrictEqual(started.status.run.runId);
   });
});

describe('catalog and scoped inventory obligations', () => {
   it('includes every requested level and preserves ordered cross-page journey work', async () => {
      const { file, run } = await buildRun();
      const observed = await registerAuditState({
         file,
         state: {
            ...buildState('Contact', 'contact'),
            target: {
               kind: 'url',
               value: 'https://createdbyfireside.com/contact/',
            },
         },
      });
      const journey = await registerAuditJourney({
         file,
         journey: {
            journeyId: 'contact',
            label: 'Contact process',
            stateIds: observed.states.map((state) => state.stateId),
            status: 'discovered',
         },
      });
      const obligations = listAssessmentObligations(journey);
      const stateChecks = obligations.filter((check) => check.scope === 'state');
      const status = await getAuditAssessmentStatus(file);

      expect(obligations.some((check) => check.criterionId === '2.1.1')).toStrictEqual(
         true,
      );
      expect(obligations.some((check) => check.criterionId === '1.4.3')).toStrictEqual(
         true,
      );
      expect(stateChecks.filter((check) => check.criterionId === '2.1.1')).toHaveLength(
         observed.states.length,
      );
      expect(obligations.find((check) => check.scope === 'journey')?.stateIds).to.eql(
         observed.states.map((state) => state.stateId),
      );
      expect(run.checks).to.eql([]);
      expect(
         status.issues.some((issue) => issue.code === 'audit-obligation-missing'),
      ).toStrictEqual(true);
   });
});

describe('discovery coverage', () => {
   it('ignores audited page flags and rejects incomplete discovery and unobserved pages', async () => {
      const { file, run } = await buildRun();
      const inventoryPath = resolve(dirname(file), 'inventory.json');
      const inventory = buildInitialInventory(target.value, { scope: 'site' });
      inventory.run.runId = run.runId;
      inventory.run.assessmentFile = file;
      inventory.pages.push({
         pageId: 'contact',
         url: 'https://createdbyfireside.com/contact/',
         finalUrl: 'https://createdbyfireside.com/contact/',
         status: 200,
         discoveredVia: 'crawl',
         requiresAuth: false,
         hasDestructiveActions: false,
         discoveryStatus: 'resolved',
         auditStatus: 'audited',
      });
      await writeInventoryAtomic(inventory, inventoryPath);
      await updateAuditRun({
         file,
         change(current) {
            current.inventoryPath = inventoryPath;
            return current;
         },
      });
      const status = await getAuditAssessmentStatus(file);

      expect(
         status.issues.some((issue) => issue.code === 'audit-page-unobserved'),
      ).toStrictEqual(true);
      expect(
         status.issues.some((issue) => issue.code === 'audit-discovery-incomplete'),
      ).toStrictEqual(true);
      await expect(finalizeAuditAssessment({ file })).rejects.toThrow('coverage issues');
      const partial = await finalizeAuditAssessment({ file, allowPartial: true });

      expect(partial.complete).toStrictEqual(false);
   });
});

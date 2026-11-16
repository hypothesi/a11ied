import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuditRun } from '@a11ied/contracts';

import {
   createAuditRun,
   readAuditRun,
   updateAuditRun,
   withRunTransaction,
} from './run-store.js';
import { createEvidenceTestAssessment } from '../evidence/test-fixtures.js';
import { migrateInventoryAuditRun } from './run-inventory.js';
import { buildReportTestInventory } from '../report/test-fixtures.js';
import { readInventory, writeInventoryAtomic } from '../discovery/inventory.js';
import {
   queueAssessmentCheck,
   registerAuditJourney,
   registerAuditState,
   transitionAssessmentCheck,
} from './run-state.js';
import { getAuditAssessmentStatus } from './run-lifecycle.js';

import { buildState, environment, target } from './test-fixtures.js';

const CONCURRENT_STATE_COUNT = 2;
let directory = '',
   file = '';

beforeEach(async () => {
   directory = await mkdtemp(resolve(tmpdir(), 'a11ied-audit-run-'));
   file = resolve(directory, 'run.json');
   await createAuditRun({
      file,
      target,
      profile: { wcagVersion: '2.2', level: 'AA' },
      scope: 'site',
      environment,
   });
});

afterEach(async () => {
   await rm(directory, { recursive: true, force: true });
});

async function queueCheck(stateIds: string[]): Promise<AuditRun> {
   return queueAssessmentCheck({
      file,
      check: {
         criterionId: '2.1.1',
         procedureId: 'wcag_2_1_1',
         procedureVersion: '1',
         scope: 'state',
         stateIds,
         environmentId: environment.environmentId,
      },
   });
}

describe('durable observed states and journeys', () => {
   it('preserves different same-URL states and multi-page journey order across reloads', async () => {
      await registerAuditState({ file, state: buildState() });
      await registerAuditState({ file, state: buildState('Menu open', 'menu-open') });
      const observed = await readAuditRun(file),
         states = observed.states;
      await registerAuditState({
         file,
         state: {
            ...buildState('Contact', 'contact'),
            target: { kind: 'url', value: `${target.value}contact-us/` },
         },
      });
      const run = await readAuditRun(file);
      await registerAuditJourney({
         file,
         journey: {
            journeyId: 'contact-journey',
            label: 'Contact the business',
            stateIds: run.states.map((state) => state.stateId),
            status: 'discovered',
         },
      });
      const resumed = await readAuditRun(file);

      expect(new Set(states.map((state) => state.stateId)).size).toStrictEqual(
         states.length,
      );
      expect(resumed.journeys[0]?.stateIds).to.eql(
         run.states.map((state) => state.stateId),
      );
      expect(resumed.profile).to.eql({ wcagVersion: '2.2', level: 'AA' });
      expect(resumed.environments).to.eql([environment]);
   });
});

describe('legacy inventory migration', () => {
   it('keeps unverified legacy page flags out of assessed coverage', async () => {
      const inventory = buildReportTestInventory(),
         inventoryPath = resolve(directory, 'legacy', 'inventory.json');
      await writeInventoryAtomic(inventory, inventoryPath);
      const imported = await migrateInventoryAuditRun({
            inventoryPath,
            profile: { wcagVersion: '2.2', level: 'AA' },
            environment,
         }),
         migrated = await readInventory(inventoryPath),
         run = imported.run;

      const status = await getAuditAssessmentStatus(imported.file);

      expect(status.coverage.assessed).toStrictEqual(0);
      expect(status.coverage.attempted).toStrictEqual(0);
      expect(status.complete).toStrictEqual(false);
      expect(run.status).toStrictEqual('active');
      expect(migrated.run.assessmentFile).toStrictEqual(imported.file);
      expect(migrated.pages[0]?.auditStatus).toStrictEqual('audited');
      expect(
         await migrateInventoryAuditRun({
            inventoryPath,
            profile: run.profile,
            environment,
         }),
      ).to.eql(imported);
   });
});

describe('atomic audit updates', () => {
   it('serializes competing updates and rejects stale or incompatible writers', async () => {
      await Promise.all([
         registerAuditState({ file, state: buildState() }),
         registerAuditState({ file, state: buildState('Dialog', 'dialog') }),
      ]);
      const run = await readAuditRun(file);

      expect(run.states).toHaveLength(CONCURRENT_STATE_COUNT);
      await expect(
         updateAuditRun({ file, expectedRevision: 0, change: (current) => current }),
      ).rejects.toThrow('audit changed');
      await expect(
         updateAuditRun({
            file,
            change(current) {
               return { ...current, profile: { ...current.profile, level: 'AAA' } };
            },
         }),
      ).rejects.toThrow('cannot change');
      await expect(
         updateAuditRun({
            file,
            change(current) {
               return {
                  ...current,
                  environments: [{ ...environment, platform: 'virtual' }],
               };
            },
         }),
      ).rejects.toThrow('cannot be replaced');
      expect(await readAuditRun(file)).to.eql(run);
      expect(await readdir(directory)).to.eql(['run.json']);
   });

   it('never replaces an existing run during creation', async () => {
      const before = await readAuditRun(file);

      await expect(
         createAuditRun({
            file,
            target,
            profile: before.profile,
            scope: 'site',
            environment,
         }),
      ).rejects.toThrow();
      expect(await readAuditRun(file)).to.eql(before);
      expect(await readdir(directory)).to.eql(['run.json']);
   });
});

describe('check transitions and observed-state changes', () => {
   it('requires evidence for an evaluated result and makes changed-state evidence stale', async () => {
      const observed = await registerAuditState({ file, state: buildState() }),
         state = observed.states[0];
      if (!state) {
         throw new Error('Missing observed state.');
      }
      const queued = await queueCheck([state.stateId]);
      const checkId = queued.checks[0]?.checkId ?? '';
      await transitionAssessmentCheck({
         file,
         checkId,
         status: 'running',
      });

      await expect(
         transitionAssessmentCheck({
            file,
            checkId,
            status: 'evaluated',
            outcome: 'passed',
         }),
      ).rejects.toThrow('evidence references');
      await expect(
         transitionAssessmentCheck({
            file,
            checkId,
            status: 'evaluated',
            outcome: 'passed',
            evidenceIds: ['evidence-1'],
         }),
      ).rejects.toThrow('verified evidence');
      const attempted = await getAuditAssessmentStatus(file);

      expect(attempted.coverage.assessed).toStrictEqual(0);
      await registerAuditState({
         file,
         state: { ...buildState('Initial', 'updated'), stateId: state.stateId },
      });
      const unresolved = await getAuditAssessmentStatus(file);

      expect(unresolved.coverage.unresolved).toBeGreaterThan(0);
      const stale = await readAuditRun(file);

      expect(stale.checks[0]?.status).toStrictEqual('stale');
   });
});

describe('scope reference validation', () => {
   it('rejects foreign state and environment references', async () => {
      await expect(queueCheck(['unknown-state'])).rejects.toThrow('Unknown scope');
      await expect(
         registerAuditState({
            file,
            state: { ...buildState(), environmentId: 'foreign-environment' },
         }),
      ).rejects.toThrow('Unknown environment');
      const run = await readAuditRun(file);

      expect(run.checks).to.eql([]);
   });
});

async function assertTransactionalCommit(): Promise<void> {
   const fixture = await createEvidenceTestAssessment();
   try {
      const initial = await readAuditRun(fixture.runFile);
      const state = initial.states[0];
      const checkId = fixture.record.provenance?.checkId ?? '';
      expect(state).toBeDefined();

      const result = await withRunTransaction(fixture.runFile, async (tx) => {
         await tx.registerStateArtifacts(
            [
               {
                  stateId: state?.stateId ?? '',
                  revision: state?.revision ?? 0,
                  fingerprint: state?.fingerprint ?? '',
               },
            ],
            ['custom-artifact.json'],
         );
         const recorded = await tx.recordEvidence(fixture.record);
         return tx.evaluateCheck({
            checkId,
            outcome: 'passed',
            evidenceIds: [recorded.record.evidenceId ?? ''],
            reason: 'Validated successfully.',
         });
      });

      const evaluatedCheck = result.checks.find((item) => item.checkId === checkId);
      expect(evaluatedCheck?.status).toBe('evaluated');
      expect(evaluatedCheck?.outcome).toBe('passed');
      expect(result.states[0]?.artifacts).toContain('custom-artifact.json');
      expect(await readAuditRun(fixture.runFile)).toEqual(result);
   } finally {
      await rm(dirname(fixture.runFile), { recursive: true, force: true });
   }
}

async function assertStateConflictDetection(): Promise<void> {
   const fixture = await createEvidenceTestAssessment();
   try {
      const initial = await readAuditRun(fixture.runFile);
      const state = initial.states[0];
      expect(state).toBeDefined();

      await expect(
         withRunTransaction(fixture.runFile, async (tx) => {
            await tx.registerStateArtifacts(
               [
                  {
                     stateId: state?.stateId ?? '',
                     revision: state?.revision ?? 0,
                     fingerprint: 'stale-tree',
                  },
               ],
               ['stale-artifact.json'],
            );
         }),
      ).rejects.toThrowError(
         expect.objectContaining({
            code: 'audit-revision-conflict',
            message: 'The observed state changed during check execution.',
         }),
      );

      expect(await readAuditRun(fixture.runFile)).toEqual(initial);
   } finally {
      await rm(dirname(fixture.runFile), { recursive: true, force: true });
   }
}

describe('withRunTransaction', () => {
   it(
      'commits state artifacts, recorded evidence, and check evaluation atomically',
      assertTransactionalCommit,
   );

   it(
      'rejects state artifact registration when observed state fingerprint changed',
      assertStateConflictDetection,
   );
});

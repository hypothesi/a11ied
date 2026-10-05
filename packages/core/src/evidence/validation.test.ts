import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assessmentArtifactEnvelopeSchema, type EvidenceRecord } from '@a11ied/contracts';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { queueAssessmentCheck, registerAuditState } from '../audit/run-state.js';
import { getCriterionEvidence } from './criteria.js';
import { getTestMethod } from '@a11ied/wcag-engine';
import { appendEvidence, clearEvidence, readEvidence } from './store.js';
import { isVerifiedEvidence, validateEvidenceRecord } from './validation.js';
import { getArtifactError } from './artifacts.js';
import {
   createEvidenceTestAssessment,
   type EvidenceTestFixture,
} from './test-fixtures.js';

const roots: string[] = [];
const CAPTURE_AGE_MS = 2,
   FIRST_ACTION_AGE_MS = 4,
   OUT_OF_ORDER_ACTION_AGE_MS = 5,
   STATE_AGE_MS = 10;
afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function buildAssessment(): Promise<EvidenceTestFixture> {
   const fixture = await createEvidenceTestAssessment();
   roots.push(dirname(fixture.runFile));
   return fixture;
}

async function assertCurrentEvidence(): Promise<void> {
   const fixture = await buildAssessment();
   await appendEvidence(fixture.record, fixture);
   const [record] = await readEvidence(fixture);

   expect(record && isVerifiedEvidence(record)).toStrictEqual(true);
   expect(record?.verification?.status).toStrictEqual('verified');
   const legacy = { ...fixture.record };
   delete legacy.provenance;
   legacy.verification = { status: 'verified', reasons: [] };
   await appendEvidence(legacy, { ...fixture, wcagVersion: '2.1' });
   const records = await readEvidence(fixture);

   expect(records.find((entry) => !entry.provenance)?.verification?.status).toStrictEqual(
      'unverified',
   );
}

async function assertInvalidScope(): Promise<void> {
   const fixture = await buildAssessment();
   const mutations = [
      (record: EvidenceRecord): void => {
         if (record.provenance) {
            record.provenance.runId = 'another-run';
         }
      },
      (record: EvidenceRecord): void => {
         if (record.provenance) {
            const state = record.provenance.states[0];
            if (state) {
               state.fingerprint = 'changed';
            }
         }
      },
      (record: EvidenceRecord): void => {
         if (record.provenance) {
            record.provenance.procedureVersion = 'old';
         }
      },
      (record: EvidenceRecord): void => {
         if (record.test.kind === 'criterion') {
            record.test.procedureId = 'invented';
         }
      },
      (record: EvidenceRecord): void => {
         record.pointer = '#another-widget';
      },
      (record: EvidenceRecord): void => {
         record.mode = 'manual';
      },
      (record: EvidenceRecord): void => {
         if (record.provenance) {
            record.provenance.source = 'virtual';
         }
      },
      (record: EvidenceRecord): void => {
         if (record.provenance) {
            record.provenance.actions = { start: 0, end: 1 };
         }
      },
      (record: EvidenceRecord): void => {
         if (record.provenance) {
            record.provenance.rationale = ' ';
            record.outcome = 'inapplicable';
         }
      },
   ];
   await Promise.all(
      mutations.map(async (mutate) => {
         const record = structuredClone(fixture.record);
         mutate(record);

         await expect(appendEvidence(record, fixture)).rejects.toThrow();
      }),
   );
}

async function assertArtifactFreshness(): Promise<void> {
   const fixture = await buildAssessment();
   await appendEvidence(fixture.record, fixture);
   await writeFile(join(fixture.runFile, '..', 'observation.json'), 'altered');
   const [altered] = await readEvidence(fixture);

   expect(altered?.verification?.status).toStrictEqual('unverified');
   expect(altered?.verification?.reasons.join(' ')).toContain('hash changed');
   await rm(join(fixture.runFile, '..', 'observation.json'));
   const [missing] = await readEvidence(fixture);

   expect(missing?.verification?.reasons.join(' ')).toContain('ENOENT');
}

async function assertStateCoverage(): Promise<void> {
   const fixture = await buildAssessment();
   await appendEvidence(fixture.record, fixture);
   const firstCheck = fixture.run.checks[0],
      initial = fixture.run.states[0];
   if (!initial || !firstCheck) {
      throw new Error('Missing scope fixture.');
   }
   await registerAuditState({
      file: fixture.runFile,
      state: {
         ...initial,
         stateId: 'dialog',
         label: 'Dialog',
         fingerprint: 'dialog-tree',
      },
   });
   await queueAssessmentCheck({
      file: fixture.runFile,
      check: { ...firstCheck, stateIds: ['dialog'] },
   });
   const records = await readEvidence(fixture);
   const coverage = getCriterionEvidence({
      criterionId: '4.1.1',
      records,
      strategy: getTestMethod('4.1.1', { version: '2.1' }).strategy,
   });

   expect(coverage.pendingProcedureIds).toContain(firstCheck.procedureId);
   expect(coverage.recordedOutcome).toBeUndefined();
   await registerAuditState({
      file: fixture.runFile,
      state: { ...initial, fingerprint: 'new-tree' },
   });
   const [stale] = await readEvidence(fixture);

   expect(stale?.verification?.status).toStrictEqual('stale');
}

async function assertConcurrentStorage(): Promise<void> {
   const external = await mkdtemp(join(tmpdir(), 'a11ied-external-')),
      fixture = await buildAssessment();
   roots.push(external);
   const path = join(fixture.runFile, '..', 'observation.json');
   await writeFile(join(external, 'observation.json'), await readFile(path));
   await rm(path);
   await symlink(join(external, 'observation.json'), path);

   await expect(appendEvidence(fixture.record, fixture)).rejects.toThrow(
      'not registered',
   );
   const legacy = { ...fixture.record };
   delete legacy.provenance;
   await Promise.all([
      appendEvidence(legacy, { ...fixture, wcagVersion: '2.1' }),
      clearEvidence(undefined, fixture),
      appendEvidence(
         { ...legacy, subject: 'https://createdbyfireside.com/contact/' },
         { ...fixture, wcagVersion: '2.1' },
      ),
   ]);

   const records = await readEvidence(fixture);

   expect(
      records.every((record) => record.verification?.status === 'unverified'),
   ).toStrictEqual(true);
}

describe('artifact content integrity', () => {
   it('rejects a removed run and invalidates verification after a record is mutated', async () => {
      const fixture = await buildAssessment();
      await appendEvidence(fixture.record, fixture);
      const [record] = await readEvidence(fixture);
      if (!record) {
         throw new Error('Missing recorded fixture.');
      }
      record.outcome = 'inapplicable';

      expect(isVerifiedEvidence(record)).toStrictEqual(false);
      await rm(fixture.runFile);
      const removed = await validateEvidenceRecord(record, fixture);

      expect(isVerifiedEvidence(removed)).toStrictEqual(false);
      expect(removed.verification?.reasons.join(' ')).toContain('ENOENT');
   });
   it('rejects empty structured observations rather than counting their envelope', async () => {
      const fixture = await buildAssessment();
      const provenance = fixture.record.provenance;
      if (!provenance) {
         throw new Error('Missing provenance fixture.');
      }
      const envelope = {
         ...provenance,
         capturedAt: fixture.record.recordedAt,
         kind: 'observation',
      };

      expect(
         assessmentArtifactEnvelopeSchema.safeParse({ ...envelope, content: {} }).success,
      ).toStrictEqual(false);
      expect(
         assessmentArtifactEnvelopeSchema.safeParse({
            ...envelope,
            content: { text: ' ' },
         }).success,
      ).toStrictEqual(false);
   });
});

describe('screenshot artifact integrity', () => {
   it('decodes complete PNG content and rejects truncation even with a current hash', async () => {
      const fixture = await buildAssessment(),
         provenance = fixture.record.provenance,
         state = fixture.run.states[0];
      if (!provenance || !state) {
         throw new Error('Missing screenshot scope fixture.');
      }
      const body = PNG.sync.write(new PNG({ width: 1, height: 1 }));
      const artifact = {
         kind: 'screenshot' as const,
         path: 'screenshot.png',
         capturedAt: fixture.record.recordedAt,
         sha256: createHash('sha256').update(body).digest('hex'),
      };
      const path = join(dirname(fixture.runFile), artifact.path);
      state.artifacts.push(artifact.path);
      await writeFile(path, body);
      const context = { ...fixture, record: fixture.record, provenance };

      expect(await getArtifactError(artifact, context)).to.eql([]);
      const truncated = body.subarray(0, -1);
      await writeFile(path, truncated);
      artifact.sha256 = createHash('sha256').update(truncated).digest('hex');

      expect(await getArtifactError(artifact, context)).not.to.eql([]);
   });
});

describe('assessment provenance', () => {
   it(
      'accepts current artifacts and rejects a forged verification label on a legacy note',
      assertCurrentEvidence,
   );
   it(
      'rejects mismatched scope, invented procedures, unqualified inapplicability, and action ranges',
      assertInvalidScope,
   );
   it(
      'revalidates artifact content and state freshness on every read',
      assertArtifactFreshness,
   );
   it(
      'preserves same-URL states and leaves an unassessed state obligation pending',
      assertStateCoverage,
   );
   it(
      'rejects symlinks escaping the run and serializes append with clear',
      assertConcurrentStorage,
   );
});

describe('action artifact chronology', () => {
   it.each(['capture', 'order'])(
      'rejects actions outside their %s chronology',
      async (kind) => {
         const fixture = await buildAssessment(),
            provenance = fixture.record.provenance,
            state = fixture.run.states[0];
         const artifact = provenance?.artifacts.find(
            (entry) => entry.kind === 'action-trace',
         );
         if (!provenance || !state || !artifact) {
            throw new Error('Missing action trace fixture.');
         }

         expect(await getArtifactError(artifact, { ...fixture, provenance })).to.eql([]);
         const now = Date.now();
         artifact.capturedAt = new Date(now - CAPTURE_AGE_MS).toISOString();
         fixture.record.recordedAt = new Date(now).toISOString();
         state.observedAt = new Date(now - STATE_AGE_MS).toISOString();
         provenance.actions = { start: 0, end: 1, checkpoint: 'checked' };
         const body = JSON.stringify({
            version: '1',
            runId: fixture.run.runId,
            attempt: provenance.attempt,
            environmentId: 'browser',
            states: provenance.states,
            source: 'browser',
            capturedAt: artifact.capturedAt,
            kind: artifact.kind,
            content: [
               {
                  index: 0,
                  action: 'First action',
                  at: new Date(now - FIRST_ACTION_AGE_MS).toISOString(),
                  stateId: 'initial',
               },
               {
                  index: 1,
                  action: 'Second action',
                  at: new Date(
                     now - (kind === 'capture' ? 1 : OUT_OF_ORDER_ACTION_AGE_MS),
                  ).toISOString(),
                  stateId: 'initial',
                  checkpoint: 'checked',
               },
            ],
         });
         artifact.sha256 = createHash('sha256').update(body).digest('hex');
         await writeFile(join(dirname(fixture.runFile), artifact.path), body);
         const errors = await getArtifactError(artifact, { ...fixture, provenance });

         expect(errors.join(' ')).toContain('action range');
      },
   );
});

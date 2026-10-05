import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
   AssessmentCapability,
   AssessmentEvidenceKind,
   AuditRun,
   EvidenceRecord,
} from '@a11ied/contracts';
import { createAuditRun } from '../audit/run-store.js';
import {
   queueAssessmentCheck,
   registerAuditState,
   transitionAssessmentCheck,
} from '../audit/run-state.js';
import { resolveEvidenceProcedure } from './validation.js';

export interface EvidenceTestFixture {
   file: string;
   runFile: string;
   run: AuditRun;
   record: EvidenceRecord;
}

interface FixtureOptions {
   scope?: 'element' | 'component';
   pointer?: string;
   extraArtifacts?: AssessmentEvidenceKind[] | undefined;
}

const FIXTURE_PROCEDURE = { criterionId: '4.1.1', wcagVersion: '2.1' };

async function createFixtureArtifacts(input: {
   run: AuditRun;
   root: string;
   states: NonNullable<EvidenceRecord['provenance']>['states'];
   capturedAt: string;
   extraArtifacts?: AssessmentEvidenceKind[] | undefined;
}): Promise<NonNullable<EvidenceRecord['provenance']>['artifacts']> {
   const { run, root, states, capturedAt } = input;
   return Promise.all(
      [
         ...resolveEvidenceProcedure(FIXTURE_PROCEDURE).requiredEvidence,
         ...(input.extraArtifacts ?? []),
      ].map(async (kind) => {
         const content =
               kind === 'action-trace'
                  ? [
                       {
                          index: 0,
                          action: 'Validate rendered markup',
                          at: capturedAt,
                          stateId: states[0]?.stateId ?? 'initial',
                          checkpoint: 'checked',
                       },
                    ]
                  : 'Markup validator found no parsing errors in the observed document.',
            path = `${kind}.json`;
         const body = JSON.stringify({
            version: '1',
            runId: run.runId,
            attempt: run.checks[0]?.attempts ?? 0,
            environmentId: 'browser',
            states,
            source: 'browser',
            capturedAt,
            kind,
            content,
         });
         await writeFile(join(root, path), body);
         return {
            kind,
            path,
            capturedAt,
            sha256: createHash('sha256').update(body).digest('hex'),
         };
      }),
   );
}

function buildFixtureRecord(input: {
   run: AuditRun;
   states: NonNullable<EvidenceRecord['provenance']>['states'];
   artifacts: NonNullable<EvidenceRecord['provenance']>['artifacts'];
}): EvidenceRecord {
   const { run, states, artifacts } = input;
   const check = run.checks[0];
   if (!check) {
      throw new Error('The fixture needs an assessment check.');
   }
   const procedure = resolveEvidenceProcedure({
      criterionId: check.criterionId,
      procedureId: check.procedureId,
      wcagVersion: '2.1',
   });
   return {
      subject: run.target.value,
      test: {
         kind: 'criterion',
         criterionId: procedure.criterionId,
         procedureId: procedure.procedureId,
      },
      outcome: 'passed',
      mode: 'semiAutomatic',
      ...(check.pointer ? { pointer: check.pointer } : {}),
      recordedAt: new Date().toISOString(),
      provenance: {
         version: '1',
         runId: run.runId,
         checkId: check.checkId,
         attempt: check.attempts,
         wcagVersion: '2.1',
         procedureVersion: procedure.version,
         environmentId: 'browser',
         states,
         source: 'browser',
         actor: { kind: 'agent', name: 'Assessment agent' },
         actions: { start: 0, end: 0, checkpoint: 'checked' },
         artifacts,
         rationale:
            'The validator covered complete tags, nesting, duplicate attributes, and unique IDs.',
      },
   };
}

/** Build a complete run and artifact set for evidence integrity regressions. */
async function startFixtureCheck(file: string, queued: AuditRun): Promise<AuditRun> {
   const check = queued.checks[0];
   if (!check) {
      throw new Error('Missing fixture assessment check.');
   }
   return transitionAssessmentCheck({ file, checkId: check.checkId, status: 'running' });
}

async function registerFixtureState(input: {
   file: string;
   run: AuditRun;
   extraArtifacts?: AssessmentEvidenceKind[] | undefined;
}): Promise<void> {
   await registerAuditState({
      file: input.file,
      state: {
         stateId: 'initial',
         target: input.run.target,
         label: 'Initial page',
         fingerprint: 'initial-tree',
         environmentId: 'browser',
         setup: [],
         artifacts: [
            'action-trace.json',
            'observation.json',
            ...(input.extraArtifacts ?? []).map((kind) => `${kind}.json`),
         ],
      },
   });
}

/** Build a complete run and artifact set for evidence integrity regressions. */
export async function createEvidenceTestAssessment(
   extraCapabilities: AssessmentCapability[] = [],
   options: FixtureOptions = {},
): Promise<EvidenceTestFixture> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-provenance-'));
   const procedure = resolveEvidenceProcedure(FIXTURE_PROCEDURE);
   const created = await createAuditRun({
      file: join(root, 'run.json'),
      runId: 'provenance-run',
      target: { kind: 'url', value: 'https://createdbyfireside.com/' },
      scope: 'site',
      profile: { wcagVersion: '2.1', level: 'AA' },
      environment: {
         environmentId: 'browser',
         platform: 'voiceover',
         os: 'macOS',
         capabilities: [...procedure.requiredCapabilities, ...extraCapabilities],
         limitations: [],
      },
   });
   await registerFixtureState({
      file: created.file,
      run: created.run,
      extraArtifacts: options.extraArtifacts,
   });
   const queued = await queueAssessmentCheck({
      file: created.file,
      check: {
         criterionId: procedure.criterionId,
         procedureId: procedure.procedureId,
         procedureVersion: procedure.version,
         scope: options.scope ?? procedure.scope,
         ...(options.pointer ? { pointer: options.pointer } : {}),
         stateIds: ['initial'],
         environmentId: 'browser',
      },
   });
   const run = await startFixtureCheck(created.file, queued);
   const states = run.states.map((state) => ({
      stateId: state.stateId,
      fingerprint: state.fingerprint,
      revision: state.revision,
   }));
   const capturedAt = new Date().toISOString();
   const artifacts = await createFixtureArtifacts({
      run,
      root,
      states,
      capturedAt,
      extraArtifacts: options.extraArtifacts,
   });
   return {
      file: created.evidenceFile,
      runFile: created.file,
      run,
      record: buildFixtureRecord({ run, states, artifacts }),
   };
}

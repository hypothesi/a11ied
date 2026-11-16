import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
   auditRunSchema,
   auditRunIdSchema,
   type AuditEnvironment,
   type AssessmentCheck,
   type AuditRun,
   type EvidenceRecord,
   type TargetReference,
} from '@a11ied/contracts';

import { getCanonicalPath, withPathLock, writeAtomic } from '../files/store.js';
import { CliUsageError } from '../errors/cli-errors.js';
import { getAuditRunPaths } from '../evidence/paths.js';
export { getAuditRunPaths } from '../evidence/paths.js';
import { recordEvidence, type EvidenceStoreOptions } from '../evidence/store.js';
import { assertCheckEvidence, readRunEvidence } from './check-evidence.js';

const ID_HASH_LENGTH = 16;

/** Stable identities include the observed state, so a URL alone cannot merge states. */
export function getAssessmentId(kind: string, parts: string[]): string {
   return `${kind}-${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, ID_HASH_LENGTH)}`;
}

/** Catalog and explicit widget obligations share the same identity tuple. */
export function getAssessmentCheckId(
   check: Pick<
      AssessmentCheck,
      | 'criterionId'
      | 'procedureId'
      | 'procedureVersion'
      | 'scope'
      | 'pointer'
      | 'stateIds'
      | 'journeyId'
      | 'environmentId'
      | 'patternRow'
   >,
): string {
   return getAssessmentId('check', [
      check.criterionId,
      check.procedureId,
      check.procedureVersion,
      check.scope,
      check.pointer ?? '',
      ...(check.scope === 'journey' ? [] : check.stateIds),
      check.journeyId ?? '',
      check.environmentId,
      check.patternRow?.exampleId ?? '',
      check.patternRow?.rowKey ?? '',
   ]);
}

/** Shared scope calculations select environments from observed states, not caller labels. */
export function listStateEnvironmentIds(run: AuditRun, stateIds: string[]): Set<string> {
   return new Set(
      run.states
         .filter((state) => stateIds.includes(state.stateId))
         .map((state) => state.environmentId),
   );
}

function assertAssessmentCheckIdentities(run: AuditRun): void {
   const invalid = run.checks.find(
      (check) => getAssessmentCheckId(check) !== check.checkId,
   );
   if (invalid) {
      throw new CliUsageError(
         'audit-check-identity-mismatch',
         'A saved assessment check identity does not match its procedure, scope, or environment.',
         { checkId: invalid.checkId },
      );
   }
}

/** Invalid or inaccessible run files stop execution instead of silently starting over. */
export async function readAuditRun(file: string): Promise<AuditRun> {
   const raw: unknown = JSON.parse(await readFile(resolve(file), 'utf8'));
   if (
      typeof raw === 'object' &&
      raw !== null &&
      'activeCheckId' in raw &&
      !('activeCheckIds' in raw)
   ) {
      const legacy = (raw as Record<string, unknown>).activeCheckId;
      (raw as Record<string, unknown>).activeCheckIds =
         typeof legacy === 'string' ? [legacy] : [];
   }
   const run = auditRunSchema.parse(raw);
   assertAssessmentCheckIdentities(run);
   return run;
}

export interface CreateAuditRunOptions {
   target: TargetReference;
   profile: AuditRun['profile'];
   scope: AuditRun['scope'];
   environment: AuditEnvironment;
   file?: string | undefined;
   runId?: string | undefined;
   inventoryPath?: string | undefined;
   actionPolicy?: AuditRun['actionPolicy'] | undefined;
}

/** Create a validated run without replacing a previous run at the requested path. */
export async function createAuditRun(options: CreateAuditRunOptions): Promise<{
   run: AuditRun;
   file: string;
   evidenceFile: string;
   artifactsDir: string;
}> {
   const now = new Date().toISOString(),
      runId = auditRunIdSchema.parse(options.runId ?? randomUUID());
   const paths = getAuditRunPaths(
         options.file ?? resolve('.a11ied', 'audits', runId, 'run.json'),
      ),
      run = auditRunSchema.parse({
         version: '1',
         runId,
         revision: 0,
         target: options.target,
         profile: options.profile,
         scope: options.scope,
         startedAt: now,
         updatedAt: now,
         status: 'active',
         environments: [options.environment],
         states: [],
         journeys: [],
         checks: [],
         inventoryPath: options.inventoryPath,
         actionPolicy: options.actionPolicy ?? {
            allowFormSubmission: false,
            allowDestructiveActions: false,
            allowedOrigins:
               options.target.kind === 'url'
                  ? [new URL(options.target.value).origin]
                  : [],
         },
      });
   await writeAtomic(paths.file, run, { overwrite: false });
   return { run, ...paths };
}

function assertRunIdentity(current: AuditRun, next: AuditRun): void {
   if (
      current.runId !== next.runId ||
      JSON.stringify(current.target) !== JSON.stringify(next.target) ||
      JSON.stringify(current.profile) !== JSON.stringify(next.profile) ||
      current.scope !== next.scope
   ) {
      throw new CliUsageError(
         'audit-run-mismatch',
         'Run identity, target, version, level, and scope cannot change during an audit.',
      );
   }
   for (const environment of current.environments) {
      if (
         JSON.stringify(environment) !==
         JSON.stringify(
            next.environments.find(
               (item) => item.environmentId === environment.environmentId,
            ),
         )
      ) {
         throw new CliUsageError(
            'audit-environment-mismatch',
            'An existing assessment environment cannot be replaced.',
         );
      }
   }
}

export interface RunTransaction {
   readRun(): AuditRun;
   updateRun(
      change: (run: AuditRun) => AuditRun | Promise<AuditRun>,
      expectedRevision?: number | undefined,
   ): Promise<AuditRun>;
   registerStateArtifacts(
      states: ReadonlyArray<{ stateId: string; revision: number; fingerprint: string }>,
      artifactPaths: string[],
   ): Promise<AuditRun>;
   recordEvidence(
      record: EvidenceRecord,
      options?: Omit<EvidenceStoreOptions, 'file' | 'runFile' | 'run'>,
   ): Promise<{ record: EvidenceRecord; file: string }>;
   evaluateCheck(input: {
      checkId: string;
      outcome: NonNullable<AssessmentCheck['outcome']>;
      evidenceIds: string[];
      reason?: string | undefined;
   }): Promise<AuditRun>;
}

function prepareNextRun(current: AuditRun, candidate: AuditRun): AuditRun {
   const next = auditRunSchema.parse(candidate);
   const previousChecks = new Map(current.checks.map((check) => [check.checkId, check]));
   assertAssessmentCheckIdentities(next);
   assertRunIdentity(current, next);
   for (const check of next.checks) {
      const previous = previousChecks.get(check.checkId);
      if (previous && Date.parse(check.updatedAt) < Date.parse(previous.updatedAt)) {
         check.updatedAt = previous.updatedAt;
      }
   }
   next.revision = current.revision + 1;
   next.updatedAt = new Date().toISOString();
   return next;
}

function applyStateArtifacts(
   run: AuditRun,
   states: ReadonlyArray<{ stateId: string; revision: number; fingerprint: string }>,
   artifactPaths: string[],
): AuditRun {
   for (const ref of states) {
      const state = run.states.find((item) => item.stateId === ref.stateId);
      if (
         !state ||
         state.revision !== ref.revision ||
         state.fingerprint !== ref.fingerprint
      ) {
         throw new CliUsageError(
            'audit-revision-conflict',
            'The observed state changed during check execution.',
         );
      }
      state.artifacts = [...new Set([...state.artifacts, ...artifactPaths])];
   }
   return run;
}

function createRunTransaction(
   canonicalFile: string,
   paths: { file: string; evidenceFile: string; artifactsDir: string },
   state: { current: AuditRun },
): RunTransaction {
   const tx: RunTransaction = {
      readRun: () => structuredClone(state.current),
      async updateRun(change, expectedRevision) {
         if (
            expectedRevision !== undefined &&
            expectedRevision !== state.current.revision
         ) {
            throw new CliUsageError(
               'audit-revision-conflict',
               'The audit changed. Read its current state before retrying this update.',
            );
         }
         state.current = prepareNextRun(
            state.current,
            await change(structuredClone(state.current)),
         );
         await writeAtomic(canonicalFile, state.current);
         return state.current;
      },
      async registerStateArtifacts(states, artifactPaths) {
         return tx.updateRun((run) => applyStateArtifacts(run, states, artifactPaths));
      },
      async recordEvidence(record, options) {
         return recordEvidence(record, {
            ...options,
            file: paths.evidenceFile,
            runFile: canonicalFile,
         });
      },
      async evaluateCheck(input) {
         return tx.updateRun(async (run) => {
            const check = run.checks.find((item) => item.checkId === input.checkId);
            if (!check || check.status !== 'running') {
               throw new CliUsageError(
                  'audit-transition-invalid',
                  `Cannot transition check ${input.checkId} to evaluated.`,
               );
            }
            assertCheckEvidence({
               check: {
                  ...check,
                  outcome: input.outcome,
                  evidenceIds: input.evidenceIds,
               },
               records: await readRunEvidence({ file: canonicalFile, run }),
            });
            check.status = 'evaluated';
            check.updatedAt = new Date().toISOString();
            check.outcome = input.outcome;
            check.evidenceIds = input.evidenceIds;
            check.reason = input.reason;
            run.activeCheckIds = run.activeCheckIds.filter((id) => id !== check.checkId);
            run.status = 'active';
            return run;
         });
      },
   };
   return tx;
}

export async function withRunTransaction<TResult>(
   file: string,
   fn: (tx: RunTransaction) => Promise<TResult>,
): Promise<TResult> {
   const canonicalFile = await getCanonicalPath(file);
   const paths = getAuditRunPaths(canonicalFile);

   return withPathLock(canonicalFile, async () => {
      const state = { current: await readAuditRun(canonicalFile) };
      const tx = createRunTransaction(canonicalFile, paths, state);
      return fn(tx);
   });
}

/** Lock the read-modify-write boundary and reject writes based on an obsolete revision. */
export async function updateAuditRun(input: {
   file: string;
   expectedRevision?: number | undefined;
   change: (run: AuditRun) => AuditRun | Promise<AuditRun>;
}): Promise<AuditRun> {
   return withRunTransaction(input.file, (tx) =>
      tx.updateRun(input.change, input.expectedRevision),
   );
}

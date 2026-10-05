import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
   auditRunSchema,
   auditRunIdSchema,
   type AuditEnvironment,
   type AssessmentCheck,
   type AuditRun,
   type TargetReference,
} from '@a11ied/contracts';

import { getCanonicalPath, withFileLock, writeJsonAtomic } from '../files/atomic-json.js';
import { CliUsageError } from '../errors/cli-errors.js';

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

/** Resolve run artifacts together; callers do not assemble evidence paths themselves. */
export function getAuditRunPaths(file: string): {
   file: string;
   evidenceFile: string;
   artifactsDir: string;
} {
   const resolvedFile = resolve(file);
   const directory = dirname(resolvedFile);
   return {
      file: resolvedFile,
      evidenceFile: resolve(directory, 'evidence.jsonl'),
      artifactsDir: resolve(directory, 'artifacts'),
   };
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
   const run = auditRunSchema.parse(JSON.parse(await readFile(resolve(file), 'utf8')));
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
   await writeJsonAtomic(run, paths.file, false);
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

/** Lock the read-modify-write boundary and reject writes based on an obsolete revision. */
export async function updateAuditRun(input: {
   file: string;
   expectedRevision?: number | undefined;
   change: (run: AuditRun) => AuditRun | Promise<AuditRun>;
}): Promise<AuditRun> {
   const file = await getCanonicalPath(input.file);
   return withFileLock(file, async () => {
      const current = await readAuditRun(file);
      if (
         input.expectedRevision !== undefined &&
         input.expectedRevision !== current.revision
      ) {
         throw new CliUsageError(
            'audit-revision-conflict',
            'The audit changed. Read its current state before retrying this update.',
         );
      }
      const next = auditRunSchema.parse(await input.change(structuredClone(current))),
         previousChecks = new Map(current.checks.map((check) => [check.checkId, check]));
      assertAssessmentCheckIdentities(next);
      assertRunIdentity(current, next);
      // Retry boundaries retain the latest saved check time across wall-clock rollback.
      for (const check of next.checks) {
         const previous = previousChecks.get(check.checkId);
         if (previous && Date.parse(check.updatedAt) < Date.parse(previous.updatedAt)) {
            check.updatedAt = previous.updatedAt;
         }
      }
      next.revision = current.revision + 1;
      next.updatedAt = new Date().toISOString();
      await writeJsonAtomic(next, file);
      return next;
   });
}

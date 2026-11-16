import { validateProcedureActionOutcomes } from '@a11ied/verdict';
import {
   type AssessmentCheck,
   type AssessmentProcedure,
   type AuditRun,
   type EvidenceRecord,
   evidenceRecordSchema,
} from '@a11ied/contracts';
import { readAuditRun } from '../audit/run-store.js';
import { listAssessmentObligations } from '../audit/run-obligations.js';
import { validatePatternRequirements } from '../apg/row-key.js';
import { getArtifactError, type EvidenceArtifactContext } from './artifacts.js';
import { stripFragment } from './subject.js';
import { resolveEvidenceProcedure, validateEvidenceTest } from './procedure-catalog.js';
export { resolveEvidenceProcedure, validateEvidenceTest } from './procedure-catalog.js';
import {
   getMissingCapabilities,
   getRequiredCapabilities,
   getRequiredEvidence,
} from './procedure-requirements.js';
import { validateNativeEvidence } from './native-evidence.js';

const verifiedRecords = new WeakMap<EvidenceRecord, string>();
const verifiedRuns = new WeakMap<EvidenceRecord, AuditRun>();
interface ValidationContext extends EvidenceArtifactContext {
   check: AssessmentCheck;
   procedure: AssessmentProcedure;
}

/** Only records validated in this process can affect coverage; stored labels are ignored. */
export function isVerifiedEvidence(record: EvidenceRecord): boolean {
   return verifiedRecords.get(record) === JSON.stringify(record);
}

/** Coverage must include every discovered obligation for this criterion and subject. */
export function listEvidenceObligations(record: EvidenceRecord): AuditRun['checks'] {
   const run = verifiedRuns.get(record);
   if (!run) {
      return [];
   }
   const checks = new Map(
      [...run.checks, ...listAssessmentObligations(run)].map(
         (check) => [check.checkId, check] as const,
      ),
   );
   return [...checks.values()].filter(
      (check) =>
         (record.test.kind === 'criterion'
            ? !check.patternRow
            : check.patternRow?.exampleId === record.test.exampleId &&
              check.patternRow.rowKey === record.test.rowKey &&
              check.pointer === record.pointer) &&
         (check.scope === 'site' ||
            check.stateIds.some((id) =>
               run.states.some(
                  (state) =>
                     state.stateId === id &&
                     stripFragment(state.target.value) === record.subject,
               ),
            )),
   );
}

function validateStates({ record, provenance, run, check }: ValidationContext): void {
   const states =
      check.scope === 'site'
         ? run.states.filter((state) => state.environmentId === check.environmentId)
         : check.stateIds.map((id) => run.states.find((state) => state.stateId === id));
   const changed = states.some((state, index) => {
      const reference = provenance.states[index];
      return (
         !state ||
         !reference ||
         state.stateId !== reference.stateId ||
         state.revision !== reference.revision ||
         state.fingerprint !== reference.fingerprint ||
         state.observationDigest !== reference.observationDigest ||
         state.environmentId !== provenance.environmentId
      );
   });
   if (
      states.length !== provenance.states.length ||
      changed ||
      check.status === 'stale'
   ) {
      throw new Error(
         'The evidence state order, revision, fingerprint, or observation digest is stale.',
      );
   }
   if (
      !states.some(
         (state) => state && stripFragment(state.target.value) === record.subject,
      )
   ) {
      throw new Error('The evidence subject does not match its observed states.');
   }
}

function isEvidenceTestMatched(record: EvidenceRecord, check: AssessmentCheck): boolean {
   if (record.test.kind === 'criterion') {
      return (
         !check.patternRow &&
         record.test.criterionId === check.criterionId &&
         record.test.procedureId === check.procedureId
      );
   }
   return (
      record.test.exampleId === check.patternRow?.exampleId &&
      record.test.rowKey === check.patternRow.rowKey
   );
}

/**
 * Widget checks add obligations; full-state procedures still require their own
 * assessments.
 */
export function isAssessmentScopeSupported(input: {
   scope: AssessmentCheck['scope'];
   procedureScope: AssessmentProcedure['scope'];
}): boolean {
   return (
      input.scope === input.procedureScope ||
      (input.procedureScope === 'state' &&
         (input.scope === 'element' || input.scope === 'component'))
   );
}

function validateScope(context: ValidationContext): void {
   const { record, provenance, run, check, procedure } = context;
   const mismatchedTest = !isEvidenceTestMatched(record, check);
   const mismatchedIdentity =
      provenance.runId !== run.runId ||
      provenance.attempt !== check.attempts ||
      provenance.wcagVersion !== run.profile.wcagVersion ||
      provenance.environmentId !== check.environmentId ||
      record.pointer !== check.pointer;
   const mismatchedProcedure =
      provenance.procedureVersion !== check.procedureVersion ||
      procedure.version !== provenance.procedureVersion ||
      !isAssessmentScopeSupported({
         scope: check.scope,
         procedureScope: procedure.scope,
      });
   if (mismatchedTest || mismatchedIdentity || mismatchedProcedure) {
      throw new Error(
         'The evidence does not match the run, check, attempt, procedure version, environment, scope, or pointer.',
      );
   }
   validateStates(context);
}

function validateRequirements({
   record,
   provenance,
   run,
   procedure,
}: ValidationContext): void {
   const environment = run.environments.find(
      (entry) => entry.environmentId === provenance.environmentId,
   );
   const missingCapability =
      getMissingCapabilities({
         procedure,
         capabilities: environment?.capabilities ?? [],
         isInapplicable: record.outcome === 'inapplicable',
      }).length > 0;
   const missingArtifact = getRequiredEvidence(
      procedure,
      record.outcome === 'inapplicable',
   ).some((kind) => !provenance.artifacts.some((artifact) => artifact.kind === kind));
   if (missingCapability || missingArtifact) {
      throw new Error('Required procedure capabilities or artifacts are missing.');
   }
   validatePatternRequirements({ record, provenance, run });
   if (provenance.actor.kind === 'agent' && record.mode === 'manual') {
      throw new Error('An agent judgment cannot be labeled as human manual review.');
   }
   validateNativeEvidence({
      run,
      provenance,
      requiresReader: getRequiredCapabilities(
         procedure,
         record.outcome === 'inapplicable',
      ).includes('real-reader'),
      requiresScreenReader: getRequiredCapabilities(
         procedure,
         record.outcome === 'inapplicable',
      ).includes('screen-reader'),
   });
}

export interface ValidateEvidenceOptions {
   runFile: string;
   expectedRunId?: string | undefined;
   subject?: string | undefined;
}

function validateBroaderActionCoverage({
   record,
   procedure,
   provenance,
}: ValidationContext): void {
   if (!['site', 'journey'].includes(procedure.scope) || record.outcome === 'cantTell') {
      return;
   }
   const assessment = record.assessment;
   if (!assessment || assessment.version !== procedure.version) {
      throw new Error(
         'Broader terminal results require explicit current procedure-action assessments.',
      );
   }
   const indices = new Set(assessment.actions.map((action) => action.index));
   if (
      indices.size !== procedure.actions.length ||
      indices.size !== assessment.actions.length ||
      assessment.actions.some((action) => action.index >= procedure.actions.length)
   ) {
      throw new Error('Assess every broader procedure action exactly once.');
   }
   if (
      assessment.actions.some((action) =>
         action.artifactIndices.some((index) => index >= provenance.artifacts.length),
      )
   ) {
      throw new Error('Procedure actions must reference captured provenance artifacts.');
   }
   validateProcedureActionOutcomes(record, assessment.actions);
   if (assessment.actions.some((action) => action.outcome === 'cantTell')) {
      throw new Error('A broader terminal result cannot leave an action unresolved.');
   }
}

async function getValidationReasons(
   record: EvidenceRecord,
   options: ValidateEvidenceOptions,
   run: AuditRun,
): Promise<{
   reasons: string[];
   run: AuditRun;
}> {
   const provenance = record.provenance;
   const check = run.checks.find((entry) => entry.checkId === provenance?.checkId);
   if (!provenance || !check || !record.evidenceId) {
      throw new Error('The assessment check or evidence identity does not exist.');
   }
   if (
      (options.expectedRunId && options.expectedRunId !== run.runId) ||
      (options.subject && options.subject !== record.subject)
   ) {
      throw new Error('The imported evidence belongs to another report run or subject.');
   }
   validateEvidenceTest(record, provenance.wcagVersion);
   const procedure = resolveEvidenceProcedure({
      ...check,
      wcagVersion: provenance.wcagVersion,
   });
   const context = {
      record,
      provenance,
      run,
      runFile: options.runFile,
      check,
      procedure,
      requiresMediaAbsence:
         record.outcome === 'inapplicable' &&
         procedure.inapplicability?.kind === 'media-absence' &&
         getMissingCapabilities({
            procedure,
            capabilities:
               run.environments.find(
                  (entry) => entry.environmentId === provenance.environmentId,
               )?.capabilities ?? [],
         }).length > 0,
   };
   validateScope(context);
   validateRequirements(context);
   validateBroaderActionCoverage(context);
   const errors = await Promise.all(
      provenance.artifacts.map((artifact) => getArtifactError(artifact, context)),
   );
   return { reasons: errors.flat(), run };
}

/** Revalidate scope and files on consumption, preserving rejected imports visibly. */
function markVerified(record: EvidenceRecord, run: AuditRun): EvidenceRecord {
   const result: EvidenceRecord = {
      ...record,
      verification: { status: 'verified', reasons: [] },
   };
   verifiedRecords.set(result, JSON.stringify(result));
   verifiedRuns.set(result, run);
   return result;
}

async function validateRecordAgainstRun(
   record: EvidenceRecord,
   options: ValidateEvidenceOptions,
   run: AuditRun | Error,
): Promise<EvidenceRecord> {
   verifiedRecords.delete(record);
   if (!record.provenance) {
      return {
         ...record,
         verification: {
            status: 'unverified',
            reasons: ['Legacy record: no traceable assessment provenance.'],
         },
      };
   }
   try {
      evidenceRecordSchema.parse(record);
      if (run instanceof Error) {
         throw run;
      }
      const { reasons } = await getValidationReasons(record, options, run);
      if (reasons.length === 0) {
         return markVerified(record, run);
      }
      return { ...record, verification: { status: 'unverified', reasons } };
   } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
         ...record,
         verification: {
            status: reason.includes('stale') ? 'stale' : 'unverified',
            reasons: [reason],
         },
      };
   }
}

/** Validate one consumption batch against a single current run snapshot from disk. */
export async function validateEvidenceRecords(
   records: EvidenceRecord[],
   options: ValidateEvidenceOptions,
): Promise<EvidenceRecord[]> {
   let run: AuditRun | Error = new Error('There are no scoped assessment records.');
   if (records.some((record) => record.provenance)) {
      try {
         run = await readAuditRun(options.runFile);
      } catch (error) {
         run = error instanceof Error ? error : new Error(String(error));
      }
   }
   return Promise.all(
      records.map((record) => validateRecordAgainstRun(record, options, run)),
   );
}

/** An imported record cannot override the current run snapshot or its verification label. */
export async function validateEvidenceRecord(
   record: EvidenceRecord,
   options: ValidateEvidenceOptions,
): Promise<EvidenceRecord> {
   const [result] = await validateEvidenceRecords([record], options);
   if (!result) {
      throw new Error('The evidence validation result is missing.');
   }
   return result;
}

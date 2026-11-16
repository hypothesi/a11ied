import { listEvidenceStateReferences } from '../../evidence/state-references.js';
import type {
   AssessmentCheck,
   AssessmentProcedure,
   AuditRun,
   EvidenceRecord,
} from '@a11ied/contracts';
import type { writeProbeArtifacts } from './probe-artifacts.js';
import type { Judgement } from './probe-types.js';

const ACTOR_NAME = 'a1 audit probe';
const NOTE_LIMIT = 900;

interface RecordInput {
   run: AuditRun;
   check: AssessmentCheck;
   procedure: AssessmentProcedure;
   folded: Judgement;
   states: AuditRun['states'];
   artifacts: Awaited<ReturnType<typeof writeProbeArtifacts>>;
}

export function buildRecord(input: RecordInput): EvidenceRecord {
   const { run, check, procedure, folded, states, artifacts } = input;
   return {
      subject: states[0]?.target.value ?? run.target.value,
      test: {
         kind: 'criterion',
         criterionId: check.criterionId,
         procedureId: check.procedureId,
      },
      outcome: folded.outcome,
      mode: 'semiAutomatic',
      recordedAt: new Date().toISOString(),
      note: folded.rationale.slice(0, NOTE_LIMIT),
      assertedBy: ACTOR_NAME,
      ...(folded.finding ? { finding: folded.finding } : {}),
      provenance: {
         version: '1',
         runId: run.runId,
         attempt: check.attempts,
         environmentId: check.environmentId,
         states: listEvidenceStateReferences(states),
         actor: { kind: 'agent', name: ACTOR_NAME },
         source: 'browser',
         checkId: check.checkId,
         wcagVersion: run.profile.wcagVersion,
         procedureVersion: procedure.version,
         actions: { start: 0, end: states.length, checkpoint: check.checkId },
         artifacts,
         rationale: folded.rationale,
      },
   };
}

import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
   assessmentArtifactEnvelopeSchema,
   driverActionRequestSchema,
   type AuditRun,
   type EvidenceProvenance,
   type EvidenceRecord,
} from '@a11ied/contracts';
import { z } from 'zod';
import { PNG } from 'pngjs';
import { getApgAssessmentRow } from '../apg/row-key.js';
import { toPlaywrightKeys } from '../apg/keys.js';
import { validateNativeSpeech } from './native-evidence.js';

const actionReceiptSchema = z.object({
   index: z.number().int().nonnegative(),
   action: z.string().trim().min(1),
   request: driverActionRequestSchema.optional(),
   at: z.string().datetime(),
   stateId: z.string().min(1),
   checkpoint: z.string().min(1).optional(),
});

export interface EvidenceArtifactContext {
   record: EvidenceRecord;
   provenance: EvidenceProvenance;
   run: AuditRun;
   runFile: string;
}

const patternObservationSchema = z.object({
   text: z.string().trim().min(1),
   pointer: z.string().min(1),
   role: z.string().nullable().optional(),
   attributes: z.record(z.string(), z.string().nullable()).optional(),
});

function validatePatternActions(
   selected: z.infer<typeof actionReceiptSchema>[],
   record: EvidenceRecord,
): void {
   if (record.test.kind === 'patternRow') {
      const row = getApgAssessmentRow(record.test.exampleId, record.test.rowKey);
      if (row?.kind === 'keyboard') {
         const chords = new Set(
            row.row.keyGroups
               .map(toPlaywrightKeys)
               .flatMap((keys) => ('chord' in keys ? [keys.chord] : [])),
         );
         const pressed = selected.some((action) => {
            const request = action.request;
            return (
               request?.action === 'press' &&
               request.payload.keys.some((keys) => {
                  const mapped = toPlaywrightKeys(keys.split('+'));
                  return 'chord' in mapped && chords.has(mapped.chord);
               })
            );
         });
         if (!pressed) {
            throw new Error(
               'The APG keyboard row has no typed keypress for a documented key alternative in its action range.',
            );
         }
      }
   }
}

function validateActions(
   content: unknown,
   context: EvidenceArtifactContext,
   capturedAt: string,
): void {
   const { provenance, record, run } = context;
   const actions = z.array(actionReceiptSchema).min(1).parse(content),
      range = provenance.actions;
   if (!range) {
      throw new Error('Action evidence requires a bounded action range.');
   }
   const selected = actions.filter(
      (action) => action.index >= range.start && action.index <= range.end,
   );
   const invalidAction = selected.some((action, index) => {
      const state = run.states.find((entry) => entry.stateId === action.stateId);
      return (
         !state ||
         action.index !== range.start + index ||
         !provenance.states.some((entry) => entry.stateId === action.stateId) ||
         Date.parse(action.at) > Date.parse(record.recordedAt) ||
         Date.parse(action.at) > Date.parse(capturedAt) ||
         Date.parse(action.at) <
            Date.parse(
               run.checks.find((check) => check.checkId === provenance.checkId)
                  ?.attemptStartedAt ?? run.startedAt,
            ) ||
         (index > 0 &&
            Date.parse(action.at) < Date.parse(selected[index - 1]?.at ?? '')) ||
         Date.parse(action.at) < Date.parse(state.observedAt)
      );
   });
   if (
      selected.length !== range.end - range.start + 1 ||
      invalidAction ||
      (range.checkpoint &&
         !selected.some((action) => action.checkpoint === range.checkpoint))
   ) {
      throw new Error('The action range or checkpoint does not match the artifact.');
   }
   validatePatternActions(selected, record);
}

function validatePatternObservation(content: unknown, record: EvidenceRecord): void {
   if (record.test.kind !== 'patternRow') {
      return;
   }
   const observation = patternObservationSchema.parse(content);
   const row = getApgAssessmentRow(record.test.exampleId, record.test.rowKey);
   const missingRole =
      row?.kind === 'attribute' && row.row.role && observation.role === undefined;
   const attribute = row?.kind === 'attribute' ? row.row.attribute : undefined;
   const missingAttribute =
      attribute &&
      (!observation.attributes || !(attribute.name in observation.attributes));
   if (observation.pointer !== record.pointer || missingRole || missingAttribute) {
      throw new Error(
         'The APG observation must identify its widget and the documented role or attribute.',
      );
   }
}

function validateCaptureTime(
   artifact: EvidenceProvenance['artifacts'][number],
   context: EvidenceArtifactContext,
): void {
   const { provenance, record, run } = context;
   const attemptStartedAt = run.checks.find(
         (check) => check.checkId === provenance.checkId,
      )?.attemptStartedAt,
      capturedAt = Date.parse(artifact.capturedAt),
      recordedAt = Date.parse(record.recordedAt);
   const predatesState = provenance.states.some((reference) => {
      const state = run.states.find((entry) => entry.stateId === reference.stateId);
      return !state || capturedAt < Date.parse(state.observedAt);
   });
   if (
      !Number.isFinite(recordedAt) ||
      capturedAt > recordedAt ||
      recordedAt > Date.now() ||
      (attemptStartedAt !== undefined && capturedAt < Date.parse(attemptStartedAt)) ||
      predatesState
   ) {
      throw new Error(
         'The artifact predates the observed state or current attempt, or has an invalid capture time.',
      );
   }
}

function validateObservedContent(
   envelope: z.infer<typeof assessmentArtifactEnvelopeSchema>,
   context: EvidenceArtifactContext,
): void {
   const { provenance, run } = context,
      artifact = envelope;
   if (artifact.kind === 'action-trace') {
      validateActions(envelope.content, context, envelope.capturedAt);
   }
   if (artifact.kind === 'speech' && provenance.source === 'real-reader') {
      validateNativeSpeech({
         content: envelope.content,
         run,
         provenance,
         capturedAt: envelope.capturedAt,
      });
   }
   if (artifact.kind === 'observation') {
      validatePatternObservation(envelope.content, context.record);
   }
   if (typeof envelope.content === 'string' && envelope.content.trim().length === 0) {
      throw new Error('The artifact observation is empty.');
   }
}

function validateArtifactContent(
   body: Buffer,
   artifact: EvidenceProvenance['artifacts'][number],
   context: EvidenceArtifactContext,
): void {
   const { provenance, run } = context;
   if (artifact.kind === 'screenshot') {
      PNG.sync.read(body, { checkCRC: true });
      return;
   }
   const envelope = assessmentArtifactEnvelopeSchema.parse(
      JSON.parse(body.toString('utf8')),
   );
   const mismatchedIdentity =
      envelope.runId !== run.runId ||
      envelope.attempt !== provenance.attempt ||
      envelope.environmentId !== provenance.environmentId ||
      envelope.source !== provenance.source ||
      envelope.sessionId !== provenance.sessionId;
   const mismatchedObservation =
      envelope.kind !== artifact.kind ||
      envelope.capturedAt !== artifact.capturedAt ||
      envelope.states.length !== provenance.states.length ||
      envelope.states.some((state, index) => {
         const expected = provenance.states[index];
         return (
            expected === undefined ||
            state.stateId !== expected.stateId ||
            state.revision !== expected.revision ||
            state.fingerprint !== expected.fingerprint
         );
      });
   if (mismatchedIdentity || mismatchedObservation) {
      throw new Error(
         'The artifact identifies a different run, attempt, state, session, or collection source.',
      );
   }
   validateObservedContent(envelope, context);
}

async function validateArtifact(
   artifact: EvidenceProvenance['artifacts'][number],
   context: EvidenceArtifactContext,
): Promise<void> {
   const { provenance, run, runFile } = context;
   const root = await realpath(dirname(runFile));
   const path = await realpath(resolve(root, artifact.path));
   const inside = relative(root, path);
   const registered = provenance.states.some((reference) =>
      run.states
         .find((state) => state.stateId === reference.stateId)
         ?.artifacts.some((entry) => resolve(root, entry) === path),
   );
   if (inside.startsWith('..') || isAbsolute(inside) || !registered) {
      throw new Error('The artifact is not registered to an observed state in this run.');
   }
   const body = await readFile(path);
   if (
      createHash('sha256').update(body).digest('hex') !== artifact.sha256 ||
      body.length === 0
   ) {
      throw new Error('The artifact is empty or its content hash changed.');
   }
   validateCaptureTime(artifact, context);
   validateArtifactContent(body, artifact, context);
}

/** Capture validation failures without discarding other artifact diagnostics. */
export async function getArtifactError(
   artifact: EvidenceProvenance['artifacts'][number],
   context: EvidenceArtifactContext,
): Promise<string[]> {
   try {
      await validateArtifact(artifact, context);
      return [];
   } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
   }
}

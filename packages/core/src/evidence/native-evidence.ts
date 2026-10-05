import {
   driverTranscriptSchema,
   type AuditRun,
   type EvidenceProvenance,
} from '@a11ied/contracts';
import { z } from 'zod';

/** Imported receipts are validated for correlation; collector honesty is a trust boundary. */
export function validateNativeSpeech(input: {
   content: unknown;
   run: AuditRun;
   provenance: EvidenceProvenance;
   capturedAt: string;
}): void {
   const { run, provenance, capturedAt } = input,
      receipt = z
         .object({ text: z.string().trim().min(1), transcript: driverTranscriptSchema })
         .parse(input.content),
      transcript = receipt.transcript;
   const check = run.checks.find((entry) => entry.checkId === provenance.checkId);
   const earliest = Math.max(
         Date.parse(check?.attemptStartedAt ?? run.startedAt),
         Date.parse(transcript.startedAt),
      ),
      environment = run.environments.find(
         (entry) => entry.environmentId === provenance.environmentId,
      ),
      exported = Date.parse(transcript.exportedAt),
      phrases = transcript.entries.filter((entry) => entry.checkpoint === undefined);
   if (
      transcript.sessionId !== provenance.sessionId ||
      transcript.target !== environment?.platform ||
      !['voiceover', 'nvda'].includes(transcript.target) ||
      (run.target.kind === 'url' &&
         !provenance.states.some((reference) => {
            const state = run.states.find((entry) => entry.stateId === reference.stateId);
            return state?.target.kind === 'url' && state.target.value === transcript.url;
         })) ||
      exported > Date.parse(capturedAt) ||
      phrases.length === 0 ||
      receipt.text !== phrases.map((entry) => entry.phrase).join('\n') ||
      transcript.entries.some(
         (entry, index) =>
            Date.parse(entry.at) < earliest ||
            Date.parse(entry.at) > exported ||
            (index > 0 &&
               (entry.index <= (transcript.entries[index - 1]?.index ?? -1) ||
                  Date.parse(entry.at) <
                     Date.parse(transcript.entries[index - 1]?.at ?? ''))),
      )
   ) {
      throw new Error(
         'Native speech must match the reader session, target, attempt time, and captured transcript.',
      );
   }
}

/** Native evidence needs observed session receipts, not an atomic OS input guarantee. */
export function validateNativeEvidence(input: {
   run: AuditRun;
   provenance: EvidenceProvenance;
   requiresReader: boolean;
}): void {
   const { run, provenance, requiresReader } = input,
      environment = run.environments.find(
         (entry) => entry.environmentId === provenance.environmentId,
      ),
      nativeSource = provenance.source === 'real-reader';
   if (requiresReader && !nativeSource) {
      throw new Error(
         'A real-reader procedure requires observations from a real screen reader.',
      );
   }
   if (
      nativeSource &&
      (environment?.platform === 'virtual' ||
         !environment?.capabilities.includes('real-reader') ||
         !provenance.sessionId ||
         !provenance.artifacts.some((artifact) => artifact.kind === 'speech'))
   ) {
      throw new Error(
         'Real-reader evidence requires a real-reader environment, session ID, and captured speech.',
      );
   }
   if (provenance.source === 'virtual' && environment?.platform !== 'virtual') {
      throw new Error('Virtual observations cannot be substituted for this environment.');
   }
}

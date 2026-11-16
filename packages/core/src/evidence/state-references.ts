import type { AuditState, EvidenceProvenance } from '@a11ied/contracts';

export function listEvidenceStateReferences(
   states: readonly AuditState[],
): EvidenceProvenance['states'] {
   return states.map((state) => ({
      stateId: state.stateId,
      revision: state.revision,
      fingerprint: state.fingerprint,
      observationDigest: state.observationDigest,
   }));
}

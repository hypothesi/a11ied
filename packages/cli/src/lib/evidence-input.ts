import { readFile } from 'node:fs/promises';
import {
   artifactProcedureAssessmentSchema,
   type ArtifactProcedureAssessment,
   evidenceFindingSchema,
   evidenceProvenanceSchema,
   type EvidenceFinding,
   type EvidenceProvenance,
} from '#contracts';

async function readOptionalJSON(file?: string): Promise<unknown> {
   if (!file) {
      return undefined;
   }
   return JSON.parse(await readFile(file, 'utf8'));
}

export async function readArtifactProcedureAssessment(
   file?: string,
): Promise<ArtifactProcedureAssessment | undefined> {
   const input = await readOptionalJSON(file);
   return input === undefined
      ? undefined
      : artifactProcedureAssessmentSchema.parse(input);
}

/** Keep criterion and pattern recording on the same provenance input boundary. */
export async function readEvidenceProvenance(
   file?: string,
): Promise<EvidenceProvenance | undefined> {
   const input = await readOptionalJSON(file);
   return input === undefined ? undefined : evidenceProvenanceSchema.parse(input);
}

/** Validate optional finding details before saving a recorded assessment. */
export async function readEvidenceFinding(
   file?: string,
): Promise<EvidenceFinding | undefined> {
   const input = await readOptionalJSON(file);
   return input === undefined ? undefined : evidenceFindingSchema.parse(input);
}

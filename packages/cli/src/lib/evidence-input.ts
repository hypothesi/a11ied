import { readFile } from 'node:fs/promises';
import {
   evidenceFindingSchema,
   evidenceProvenanceSchema,
   type EvidenceFinding,
   type EvidenceProvenance,
} from '#contracts';

/** Keep criterion and pattern recording on the same provenance input boundary. */
export async function readEvidenceProvenance(
   file?: string,
): Promise<EvidenceProvenance | undefined> {
   if (!file) {
      return undefined;
   }
   return evidenceProvenanceSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

/** Validate optional finding details before saving a recorded assessment. */
export async function readEvidenceFinding(
   file?: string,
): Promise<EvidenceFinding | undefined> {
   if (!file) {
      return undefined;
   }
   return evidenceFindingSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

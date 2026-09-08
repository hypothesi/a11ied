import { mobileGuidanceArtifactSchema } from '@a11ied/contracts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
   GeneratedArtifactWriteResult,
   WcagDataDirectories,
} from '../shared/types.js';
import { getWcagDataDirectories } from '../sources/definitions.js';

const MOBILE_GUIDANCE_FILE_NAME = 'mobile-guidance.json';

/**
 * Validates the WCAG2Mobile artifact: it parses against the schema, every entry is filed
 * under its own criterion id, and an entry the document says it has written carries the
 * guidance text to prove it.
 */
export async function validateMobileGuidanceArtifact(
   directories: WcagDataDirectories = getWcagDataDirectories(),
): Promise<GeneratedArtifactWriteResult> {
   const filePath = join(directories.generated, MOBILE_GUIDANCE_FILE_NAME);
   const raw = await readFile(filePath, 'utf8');
   const artifact = mobileGuidanceArtifactSchema.parse(JSON.parse(raw) as unknown);

   for (const [criterionId, entry] of Object.entries(artifact.criteria)) {
      if (entry.criterionId !== criterionId) {
         throw new Error(
            `mobile guidance entry ${criterionId} is filed under ${entry.criterionId}`,
         );
      }
      if (entry.state === 'guidance' && entry.guidance.length === 0) {
         throw new Error(`mobile guidance entry ${criterionId} has no guidance text`);
      }
   }

   return { fileName: MOBILE_GUIDANCE_FILE_NAME, filePath };
}

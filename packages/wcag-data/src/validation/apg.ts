import { apgPatternsArtifactSchema, type ApgPatternsArtifact } from '@a11ied/contracts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
   GeneratedArtifactWriteResult,
   WcagDataDirectories,
} from '../shared/types.js';
import { getWcagDataDirectories } from '../sources/definitions.js';

const APG_PATTERNS_FILE_NAME = 'apg-patterns.json';

/**
 * The counts a healthy sync produces. They exist so a run that fetched almost nothing
 * fails here rather than shipping an artifact that answers most lookups with "not
 * found".
 */
const MIN_EXAMPLE_COUNT = 50;
const MIN_PATTERN_COUNT = 20;

export interface ApgValidationResult extends GeneratedArtifactWriteResult {
   patternCount: number;
   exampleCount: number;
}

function assertExamplesFiledUnderTheirOwnId(artifact: ApgPatternsArtifact): void {
   for (const [exampleId, example] of Object.entries(artifact.examples)) {
      if (example.id !== exampleId) {
         throw new Error(`APG example ${exampleId} is filed under ${example.id}`);
      }
   }
}

function assertPatternsPointAtKnownExamples(artifact: ApgPatternsArtifact): void {
   for (const [patternId, pattern] of Object.entries(artifact.patterns)) {
      if (pattern.id !== patternId) {
         throw new Error(`APG pattern ${patternId} is filed under ${pattern.id}`);
      }
      for (const exampleId of pattern.exampleIds) {
         if (!artifact.examples[exampleId]) {
            throw new Error(
               `APG pattern ${patternId} lists example ${exampleId}, which is not in the artifact`,
            );
         }
      }
   }
}

function assertIndexPointsAtKnownExamples(
   artifact: ApgPatternsArtifact,
   label: string,
   index: Record<string, string[]>,
): void {
   for (const [key, exampleIds] of Object.entries(index)) {
      for (const exampleId of exampleIds) {
         if (!artifact.examples[exampleId]) {
            throw new Error(
               `APG ${label} index ${key} lists example ${exampleId}, which is not in the artifact`,
            );
         }
      }
   }
}

function assertCounts(patternCount: number, exampleCount: number): void {
   if (exampleCount < MIN_EXAMPLE_COUNT) {
      throw new Error(
         `APG artifact holds ${exampleCount} examples, expected at least ${MIN_EXAMPLE_COUNT}`,
      );
   }
   if (patternCount < MIN_PATTERN_COUNT) {
      throw new Error(
         `APG artifact holds ${patternCount} patterns, expected at least ${MIN_PATTERN_COUNT}`,
      );
   }
}

/**
 * Validates the APG artifact: it parses against the schema, every example is filed under
 * its own id, and every pattern and index entry points at an example the artifact holds.
 */
export async function validateApgPatternsArtifact(
   directories: WcagDataDirectories = getWcagDataDirectories(),
): Promise<ApgValidationResult> {
   const filePath = join(directories.generated, APG_PATTERNS_FILE_NAME);
   const raw = await readFile(filePath, 'utf8');
   const artifact = apgPatternsArtifactSchema.parse(JSON.parse(raw) as unknown);

   assertExamplesFiledUnderTheirOwnId(artifact);
   assertPatternsPointAtKnownExamples(artifact);
   assertIndexPointsAtKnownExamples(artifact, 'role', artifact.roleIndex);
   assertIndexPointsAtKnownExamples(artifact, 'attribute', artifact.attributeIndex);

   const exampleCount = Object.keys(artifact.examples).length,
      patternCount = Object.keys(artifact.patterns).length;
   assertCounts(patternCount, exampleCount);

   return { fileName: APG_PATTERNS_FILE_NAME, filePath, patternCount, exampleCount };
}

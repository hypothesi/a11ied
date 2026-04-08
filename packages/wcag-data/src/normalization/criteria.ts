import {
   criteriaByLevelArtifactSchema,
   failureIndexArtifactSchema,
   normalizedCriteriaArtifactSchema,
   slugIndexArtifactSchema,
   tagIndexArtifactSchema,
   techniqueIndexArtifactSchema,
   type CriteriaByLevelArtifact,
   type FailureIndexArtifact,
   type NormalizedCriteriaArtifact,
   type SlugIndexArtifact,
   type TagIndexArtifact,
   type TechniqueIndexArtifact,
   type WcagVersion,
} from '@a11lied/contracts';

import type { QuickrefTagsPayload, WcagPayload } from '../shared/types.js';
import { normalizeSingleCriterion } from './techniques.js';

type CriterionEntry = ReturnType<typeof normalizeSingleCriterion>[1];
type CriteriaMap = Record<string, CriterionEntry>;

const LEVEL_A = 'A' as const;

function buildLevels(criteria: CriteriaMap): Record<string, string[]> {
   return {
      [LEVEL_A]: Object.values(criteria)
         .filter((cr) => cr.level === 'A')
         .map((cr) => cr.id),
      AA: Object.values(criteria)
         .filter((cr) => cr.level === 'AA')
         .map((cr) => cr.id),
      AAA: Object.values(criteria)
         .filter((cr) => cr.level === 'AAA')
         .map((cr) => cr.id),
   };
}

function buildSlugs(criteria: CriteriaMap): Record<string, string> {
   return Object.fromEntries(
      Object.values(criteria)
         .map((cr) => [cr.slug, cr.id] as const)
         .toSorted(([left], [right]) => left.localeCompare(right)),
   );
}

function buildTechniqueIndex(
   criteria: CriteriaMap,
): Map<string, TechniqueIndexArtifact['techniques'][string]> {
   const index = new Map<string, TechniqueIndexArtifact['techniques'][string]>();
   for (const criterion of Object.values(criteria)) {
      for (const technique of [
         ...criterion.techniques,
         ...criterion.advisoryTechniques,
      ]) {
         const current = index.get(technique.key);
         index.set(technique.key, {
            key: technique.key,
            id: technique.id,
            title: technique.title,
            technology: technique.technology,
            kind: technique.kind,
            criterionIds: [
               ...new Set([...(current?.criterionIds ?? []), criterion.id]),
            ].toSorted((left, right) =>
               left.localeCompare(right, undefined, { numeric: true }),
            ),
         });
      }
   }
   return index;
}

function buildFailureIndex(
   criteria: CriteriaMap,
): Map<string, FailureIndexArtifact['failures'][string]> {
   const index = new Map<string, FailureIndexArtifact['failures'][string]>();
   for (const criterion of Object.values(criteria)) {
      for (const failure of criterion.failures) {
         const current = index.get(failure.key);
         index.set(failure.key, {
            key: failure.key,
            id: failure.id,
            title: failure.title,
            technology: failure.technology,
            kind: failure.kind,
            criterionIds: [
               ...new Set([...(current?.criterionIds ?? []), criterion.id]),
            ].toSorted((left, right) =>
               left.localeCompare(right, undefined, { numeric: true }),
            ),
         });
      }
   }
   return index;
}

function buildTagIndex(criteria: CriteriaMap): Map<string, string[]> {
   const index = new Map<string, string[]>();
   for (const criterion of Object.values(criteria)) {
      for (const tag of criterion.tags) {
         index.set(
            tag,
            [...new Set([...(index.get(tag) ?? []), criterion.id])].toSorted(
               (left, right) => left.localeCompare(right, undefined, { numeric: true }),
            ),
         );
      }
   }
   return index;
}

function mapToSortedObject<TVal>(entries: Map<string, TVal>): Record<string, TVal> {
   return Object.fromEntries(
      [...entries.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
   );
}

function assembleCriteriaArtifacts(input: {
   version: WcagVersion;
   criteria: CriteriaMap;
}): {
   criteriaArtifact: NormalizedCriteriaArtifact;
   criteriaByLevelArtifact: CriteriaByLevelArtifact;
   slugIndexArtifact: SlugIndexArtifact;
   techniqueIndexArtifact: TechniqueIndexArtifact;
   failureIndexArtifact: FailureIndexArtifact;
   tagIndexArtifact: TagIndexArtifact;
} {
   return {
      criteriaArtifact: normalizedCriteriaArtifactSchema.parse({
         version: input.version,
         criteria: input.criteria,
      }),
      criteriaByLevelArtifact: criteriaByLevelArtifactSchema.parse({
         version: input.version,
         levels: buildLevels(input.criteria),
      }),
      slugIndexArtifact: slugIndexArtifactSchema.parse({
         version: input.version,
         slugs: buildSlugs(input.criteria),
      }),
      techniqueIndexArtifact: techniqueIndexArtifactSchema.parse({
         version: input.version,
         techniques: mapToSortedObject(buildTechniqueIndex(input.criteria)),
      }),
      failureIndexArtifact: failureIndexArtifactSchema.parse({
         version: input.version,
         failures: mapToSortedObject(buildFailureIndex(input.criteria)),
      }),
      tagIndexArtifact: tagIndexArtifactSchema.parse({
         version: input.version,
         tags: mapToSortedObject(buildTagIndex(input.criteria)),
      }),
   };
}

export function normalizeCriteriaArtifacts(input: {
   version: WcagVersion;
   wcag: WcagPayload;
   quickrefTags: QuickrefTagsPayload;
}): {
   criteriaArtifact: NormalizedCriteriaArtifact;
   criteriaByLevelArtifact: CriteriaByLevelArtifact;
   slugIndexArtifact: SlugIndexArtifact;
   techniqueIndexArtifact: TechniqueIndexArtifact;
   failureIndexArtifact: FailureIndexArtifact;
   tagIndexArtifact: TagIndexArtifact;
} {
   const criteriaEntries = input.wcag.principles.flatMap((principle) =>
      principle.guidelines.flatMap((guideline) =>
         guideline.successcriteria
            .filter((cr) => cr.versions.includes(input.version))
            .map((criterion) =>
               normalizeSingleCriterion({
                  criterion,
                  version: input.version,
                  quickrefTags: input.quickrefTags,
                  principle,
                  guideline,
               }),
            ),
      ),
   );
   const criteria = Object.fromEntries(
      criteriaEntries.toSorted(([left], [right]) =>
         left.localeCompare(right, undefined, { numeric: true }),
      ),
   );
   return assembleCriteriaArtifacts({ version: input.version, criteria });
}

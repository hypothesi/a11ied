import type {
   FailureIndexArtifact,
   NormalizedCriteriaArtifact,
   TechniqueIndexArtifact,
   WcagVersion,
} from '@a11ied/contracts';

import type { DocumentRequest } from './types.js';

function understandingRequests(
   version: WcagVersion,
   criteriaArtifact: NormalizedCriteriaArtifact,
): DocumentRequest[] {
   return Object.values(criteriaArtifact.criteria).map((criterion) => ({
      kind: 'understanding',
      id: criterion.slug,
      title: criterion.title,
      version,
      url: criterion.understandingUrl,
      criterionId: criterion.id,
   }));
}

function techniqueRequests(
   version: WcagVersion,
   index: TechniqueIndexArtifact | FailureIndexArtifact,
): DocumentRequest[] {
   const entries =
      'techniques' in index
         ? Object.values(index.techniques)
         : Object.values(index.failures);
   return entries.flatMap((entry) => {
      if (!entry.id || !entry.url) {
         return [];
      }
      return [
         {
            kind: 'technique' as const,
            id: entry.id,
            title: entry.title,
            version,
            url: entry.url,
         },
      ];
   });
}

/**
 * Builds the list of Understanding and technique/failure pages to fetch for one WCAG
 * version, from the already-normalized criteria and technique indexes so the request URLs
 * match the ones the rest of the data carries.
 */
export function buildDocumentRequests(input: {
   version: WcagVersion;
   criteriaArtifact: NormalizedCriteriaArtifact;
   techniqueIndexArtifact: TechniqueIndexArtifact;
   failureIndexArtifact: FailureIndexArtifact;
}): DocumentRequest[] {
   return [
      ...understandingRequests(input.version, input.criteriaArtifact),
      ...techniqueRequests(input.version, input.techniqueIndexArtifact),
      ...techniqueRequests(input.version, input.failureIndexArtifact),
   ];
}

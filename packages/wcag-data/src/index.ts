export type {
   WcagDataDirectories,
   RawSourceProvenance,
   RawArtifactWriteResult,
   SyncRawSourcesResult,
   GeneratedArtifactWriteResult,
   NormalizedArtifactsResult,
   GeneratedArtifactProvenance,
   GeneratedProvenanceManifest,
   DerivedAxeRule,
} from './shared/types.js';

export { SyncValidationError } from './shared/types.js';

export {
   getWcagDataDirectories,
   ensureWcagDataDirectories,
   listApprovedUpstreamSourceUrls,
   listRawSourceDefinitions,
} from './sources/definitions.js';

export { deriveAxeRuleMetadata, syncRawSources } from './sources/sync.js';

export { normalizeCriteriaArtifacts } from './normalization/criteria.js';

export { generateNormalizedArtifacts, runWcagDataSync } from './generation/build.js';

export {
   syncDocumentArtifacts,
   type SyncDocumentArtifactsResult,
} from './generation/documents.js';

export {
   syncMobileGuidance,
   type SyncMobileGuidanceResult,
} from './generation/mobile.js';

export {
   syncApgPatterns,
   type ApgFetchFailure,
   type SyncApgPatternsResult,
} from './generation/apg.js';

export { validateRawSyncState } from './validation/raw.js';
export { validateGeneratedArtifacts } from './validation/generated.js';
export { validateDocumentArtifacts } from './validation/documents.js';
export { validateMobileGuidanceArtifact } from './validation/mobile.js';
export {
   validateApgPatternsArtifact,
   type ApgValidationResult,
} from './validation/apg.js';

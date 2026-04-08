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
} from './types.js';

export { SyncValidationError } from './types.js';

export {
   getWcagDataDirectories,
   ensureWcagDataDirectories,
   listApprovedUpstreamSourceUrls,
   listRawSourceDefinitions,
} from './source-definitions.js';

export { deriveAxeRuleMetadata, syncRawSources } from './sync.js';

export { normalizeCriteriaArtifacts } from './normalize-criteria.js';

export { generateNormalizedArtifacts, runWcagDataSync } from './generate.js';

export { validateRawSyncState } from './validate-raw.js';
export { validateGeneratedArtifacts } from './validate.js';

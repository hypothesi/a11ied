export { WcagEngineNotFoundError, WcagEngineValidationError } from './errors/index.js';

export {
   supportedRelevanceStates,
   supportedPageSignalCategories,
} from './shared/data.js';

export {
   getAxeRule,
   getTestMethod,
   getTestMethodSummary,
   getCriterion,
   getMobileGuidance,
   getQuickrefTags,
   getTechnique,
   getUnderstanding,
   listCriteriaByLevel,
   resetWcagEngineCache,
} from './artifacts/runtime.js';

export {
   findApgExamplesByAttribute,
   findApgExamplesByRole,
   getApgDocument,
   getApgExample,
   getApgPattern,
   listApgExamplesForPattern,
   listApgIndexKeys,
   listApgPatterns,
   resolveApgLookupKey,
} from './artifacts/apg.js';

export { searchCriteria } from './search/runtime.js';
export { searchApgEntries } from './search/apg.js';

export { getCriterionRelevance, listRelevantCriteria } from './relevance/runtime.js';

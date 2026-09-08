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
   getQuickrefTags,
   getTechnique,
   getUnderstanding,
   listCriteriaByLevel,
   resetWcagEngineCache,
} from './artifacts/runtime.js';

export { searchCriteria } from './search/runtime.js';

export { getCriterionRelevance, listRelevantCriteria } from './relevance/runtime.js';

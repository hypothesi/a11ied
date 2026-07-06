export { WcagEngineNotFoundError, WcagEngineValidationError } from './errors/index.js';

export {
   supportedApplicabilityStates,
   supportedApplicabilitySignalCategories,
} from './shared/data.js';

export {
   getCriterion,
   listCriteriaByLevel,
   getCoverage,
   getQuickrefTags,
   resetWcagEngineCache,
} from './artifacts/runtime.js';

export { searchCriteria } from './search/runtime.js';

export {
   getCriterionApplicability,
   listApplicableCriteria,
} from './applicability/runtime.js';

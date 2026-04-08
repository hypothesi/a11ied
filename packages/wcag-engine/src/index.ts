export { WcagEngineNotFoundError, WcagEngineValidationError } from './engine-errors.js';

export {
   supportedApplicabilityStates,
   supportedApplicabilitySignalCategories,
} from './engine-data.js';

export {
   getCriterion,
   listCriteriaByLevel,
   getCoverage,
   getQuickrefTags,
   getVerificationStrategy,
   resetWcagEngineCache,
} from './engine-artifacts.js';

export { searchCriteria } from './engine-search.js';

export {
   getCriterionApplicability,
   listApplicableCriteria,
} from './engine-applicability.js';

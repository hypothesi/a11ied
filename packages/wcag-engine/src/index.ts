export { WcagEngineNotFoundError, WcagEngineValidationError } from './errors/index.js';

export {
   supportedApplicabilityStates,
   supportedApplicabilitySignalCategories,
} from './shared/data.js';

export {
   getAxeRule,
   getCoverage,
   getCoverageSummary,
   getCriterion,
   getQuickrefTags,
   getTechnique,
   getUnderstanding,
   listCriteriaByLevel,
   resetWcagEngineCache,
} from './artifacts/runtime.js';

export { searchCriteria } from './search/runtime.js';

export {
   getCriterionApplicability,
   listApplicableCriteria,
} from './applicability/runtime.js';

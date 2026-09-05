import type { CliCommand } from '../../contracts/src/index.js';

export {
   CliEnvironmentError,
   CliUsageError,
   inspectApplicableTarget,
   inspectApplicableUrl,
   inspectCriterionTarget,
   inspectCriterionUrl,
   listWcagCriteria,
   searchWcagCriteria,
   showWcagCoverage,
   showWcagCriterion,
} from './wcag/runtime.js';
export {
   attachDocumentToDriverSession,
   cleanupStaleDriverSessions,
   getActiveSessionFile,
   getDriverSocketPath,
   getDriverSessionStatus,
   runDriverSessionAction,
   runEphemeralDriverAction,
   startDriverSession,
   stopDriverSession,
} from './driver/runtime.js';
export {
   resolveAvailableDefaultTarget,
   resolveDefaultTarget,
   resolveTargetType,
} from './driver/default-target.js';
export type { TargetType } from './driver/default-target.js';
export {
   DriverCommandError,
   driverCommandSets,
   isDriverCommandSet,
   listDriverCommands,
   parseDriverCommandSet,
   resolveDriverCommand,
   type ConcreteDriverCommandSet,
   type DriverCommandList,
   type DriverCommandSet,
   type ListDriverCommandsOptions,
   type SerializableDriverCommand,
} from '@a11ied/guidepup';
export { runAxe, type AxeRunOptions } from './axe/runtime.js';
export { openUrlInSystemAutomationBrowser } from './browser/helper.js';
export {
   resolveDocumentTarget,
   type ResolveDocumentTargetInput,
} from './targets/runtime.js';
export {
   createDefaultDoctorDeps,
   createDoctorReport,
   listSupportedTargets,
   type DoctorDeps,
} from './doctor/runtime.js';
export { renderDoctorText, type DoctorTextStyle } from './doctor/render.js';
export {
   listGuidepupSetupSteps,
   runGuidepupSetup,
   type GuidepupSetupHooks,
   type GuidepupSetupOptions,
   type GuidepupSetupStep,
   type GuidepupSetupStepResult,
} from './doctor/setup.js';

const cliCommands: CliCommand[] = [
   {
      name: 'wcag',
      summary: 'Query pinned WCAG criteria, coverage, and testing strategy data.',
      maturity: 'ready',
   },
   {
      name: 'inspect',
      summary: 'Explain which WCAG criteria are relevant for a specific target.',
      maturity: 'ready',
   },
   {
      name: 'sr',
      summary:
         'Control VoiceOver, NVDA, or the virtual screen reader through stable screen-reader sessions.',
      maturity: 'ready',
   },
   {
      name: 'doctor',
      summary: 'Check the host for browser and screen reader readiness.',
      maturity: 'ready',
   },
   {
      name: 'setup',
      summary: 'Run the Guidepup setup steps this host still needs.',
      maturity: 'ready',
   },
   {
      name: 'axe',
      summary: 'Run axe-core accessibility scans.',
      maturity: 'ready',
   },
   {
      name: 'mcp',
      summary: 'Expose the runtime over an MCP stdio server.',
      maturity: 'ready',
   },
];

/** Lists the shipped top-level CLI command families and their maturity labels. */
export function listCliCommands(): CliCommand[] {
   return cliCommands;
}

export {
   showWcagAxeRule,
   showWcagCoverageSummary,
   showWcagTechnique,
} from './wcag/runtime.js';
export {
   DEFAULT_IDLE_TIMEOUT_MINUTES,
   getActiveDriverSession,
   type DriverRequestOptions,
   type DriverSessionStart,
   type EphemeralDriverActionOptions,
   type StartDriverSessionOptions,
} from './driver/runtime.js';
export {
   DRIVER_MODE_ENV_VAR,
   resolveDriverMode,
   resolveStateRoot,
   STATE_DIR_ENV_VAR,
} from './driver/environment.js';
export {
   buildDriverTranscript,
   formatTranscript,
   resolveRecordingTranscriptPath,
   resolveTranscriptFormat,
   selectTranscriptEntries,
   writeDriverTranscript,
   type TranscriptSelection,
} from './driver/transcript.js';
export {
   getPortableCommand,
   portableCommandTable,
   type PortableCommandEntry,
} from '@a11ied/guidepup';
export {
   describeNavigation,
   getNavigationKindEntry,
   navigationKindTable,
   type NavigationKindEntry,
} from '@a11ied/guidepup';
export {
   describeMatcher,
   matchesText,
   parseTextMatcher,
   type TextMatcher,
} from './driver/matcher.js';
export {
   describeExpectationFailure,
   evaluateExpectation,
   type ExpectationOptions,
   type ExpectationResult,
} from './driver/expectation.js';
export {
   runDriverSessionBatch,
   type BatchRunOptions,
   type BatchRunResult,
   type BatchStepError,
   type BatchStepOutcome,
   type BatchStepResult,
} from './driver/batch.js';
export {
   isFrontmostMatch,
   waitForWindowFocus,
   WINDOW_FOCUS_TIMEOUT_MS,
   type FrontmostWindow,
   type WindowFocusResult,
} from '@a11ied/guidepup';
export {
   openUrlInBrowser,
   resolveBrowserChoice,
   type BrowserChoice,
} from './driver/browser-launch.js';

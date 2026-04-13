import {
   verificationReportSchema,
   type AccessibilityDriverSession,
   type CliMessage,
   type CriterionLookupKey,
   type Platform,
   type VerificationCriterionResult,
   type VerificationReport,
   type WcagLevel,
} from '@a11ied/contracts';
import { parseWcagLevel } from '../wcag/parsing.js';
import { createLevelVerificationMessage, createSummary } from './helpers.js';
import {
   verifyCriterionResult,
   type VerifyCriterionResultOutput,
} from './criterion-process.js';
import {
   expandCriteriaForConformanceLevel,
   resolveTarget,
   resolveVerificationTarget,
   resolveVersion,
   toWarningsList,
   withManagedVerificationSession,
   withVerificationSessionId,
} from './runtime-helpers.js';
import { runAxe } from '../axe/runtime.js';

interface VerifyCriterionOptions {
   criterion: CriterionLookupKey;
   url: string;
   target?: string;
   wcagVersion: string;
   reportTarget?: VerificationReport['target'];
   recordingPath?: string;
}
interface VerifyLevelOptions {
   level: string;
   url: string;
   target?: string;
   wcagVersion: string;
   reportTarget?: VerificationReport['target'];
   recordingPath?: string;
}
/** Verifies one criterion against a target and returns a structured report row. */
export async function verifyCriterion(
   options: VerifyCriterionOptions,
): Promise<VerificationReport> {
   const { parsedTarget, fallback } = resolveVerificationTarget(options.target);
   const sessionArgs: {
      parsedTarget: Platform;
      recordingPath?: string;
      run: (
         session: AccessibilityDriverSession | undefined,
      ) => Promise<VerifyCriterionResultOutput>;
   } = {
      parsedTarget,
      run: async (session) => {
         const verifyArgs = {
            criterion: options.criterion,
            url: options.url,
            parsedTarget,
            wcagVersion: options.wcagVersion,
         };
         return verifyCriterionResult(withVerificationSessionId(verifyArgs, session));
      },
   };
   if (typeof options.recordingPath === 'string') {
      sessionArgs.recordingPath = options.recordingPath;
   }

   const { result: verification, recording } =
      await withManagedVerificationSession<VerifyCriterionResultOutput>(sessionArgs);

   const warnings = toWarningsList(verification.warning);
   if (fallback) {
      warnings.push(fallback);
   }

   return verificationReportSchema.parse({
      target: options.reportTarget ?? verification.target,
      wcagVersion: verification.criterion.criterion.wcagVersion,
      requestedScope: {
         kind: 'criterion',
         criterion: options.criterion,
      },
      summary: createSummary([verification.criterion]),
      criteria: [verification.criterion],
      recording,
      warnings,
      errors: [],
   });
}

interface CriterionAccumulator {
   criteria: VerificationCriterionResult[];
   warnings: CliMessage[];
   target: VerificationReport['target'] | undefined;
}

async function processSingleCriterion(
   criterionId: string,
   args: {
      url: string;
      parsedTarget: Platform;
      wcagVersion: string;
      sessionId?: string;
   },
   accumulator: CriterionAccumulator,
): Promise<void> {
   const verifyArgs = {
      criterion: criterionId,
      url: args.url,
      parsedTarget: args.parsedTarget,
      wcagVersion: args.wcagVersion,
   };
   const verification = await verifyCriterionResult(
      withVerificationSessionId(verifyArgs, args.sessionId),
   );
   accumulator.criteria.push(verification.criterion);
   if (verification.warning) {
      accumulator.warnings.push(verification.warning);
   }
   accumulator.target = verification.target;
}

async function verifyNextCriterion(
   args: {
      criterionIds: string[];
      url: string;
      parsedTarget: Platform;
      wcagVersion: string;
      sessionId?: string;
   },
   index: number,
   accumulator: CriterionAccumulator,
): Promise<CriterionAccumulator> {
   if (index >= args.criterionIds.length) {
      return accumulator;
   }
   const criterionId = args.criterionIds[index];
   if (!criterionId) {
      return accumulator;
   }

   await processSingleCriterion(criterionId, args, accumulator);

   return verifyNextCriterion(args, index + 1, accumulator);
}

async function collectLevelVerifications(args: {
   criterionIds: string[];
   url: string;
   parsedTarget: Platform;
   wcagVersion: string;
   sessionId?: string;
}): Promise<CriterionAccumulator> {
   return verifyNextCriterion(args, 0, { criteria: [], warnings: [], target: undefined });
}

async function collectLevelResults(args: {
   options: VerifyLevelOptions;
   parsedTarget: Platform;
   criterionIds: string[];
}): Promise<{
   collected: CriterionAccumulator;
   recording: VerificationReport['recording'] | undefined;
}> {
   try {
      await runAxe(args.options.url, {
         url: args.options.url,
         level: parseWcagLevel(args.options.level),
         wcagVersion: args.options.wcagVersion,
      });
   } catch {
      // Best-effort cache priming so we do not fail level verification early.
   }
   const sessionArgs: {
      parsedTarget: Platform;
      recordingPath?: string;
      forceSession: true;
      run: (
         session: AccessibilityDriverSession | undefined,
      ) => Promise<CriterionAccumulator>;
   } = {
      parsedTarget: args.parsedTarget,
      forceSession: true,
      run: async (session) => {
         const verifyArgs = {
            criterionIds: args.criterionIds,
            url: args.options.url,
            parsedTarget: args.parsedTarget,
            wcagVersion: args.options.wcagVersion,
         };
         return collectLevelVerifications(withVerificationSessionId(verifyArgs, session));
      },
   };
   if (typeof args.options.recordingPath === 'string') {
      sessionArgs.recordingPath = args.options.recordingPath;
   }

   const { result, recording } =
      await withManagedVerificationSession<CriterionAccumulator>(sessionArgs);
   return { collected: result, recording };
}

function buildLevelReport(args: {
   options: VerifyLevelOptions;
   parsedTarget: Platform;
   parsedLevel: WcagLevel;
   collected: CriterionAccumulator;
   recording: VerificationReport['recording'] | undefined;
   fallback: CliMessage | undefined;
}): VerificationReport {
   const summary = createSummary(args.collected.criteria);
   const levelWarning = createLevelVerificationMessage(args.parsedLevel, summary);
   if (levelWarning) {
      args.collected.warnings.unshift(levelWarning);
   }

   const warnings = [...args.collected.warnings];
   if (args.fallback) {
      warnings.push(args.fallback);
   }

   return verificationReportSchema.parse({
      target:
         args.options.reportTarget ??
         resolveTarget(args.collected.target, args.options.url, args.parsedTarget),
      wcagVersion: resolveVersion(args.collected.criteria, args.options.wcagVersion),
      requestedScope: {
         kind: 'level',
         level: args.parsedLevel,
      },
      summary,
      criteria: args.collected.criteria,
      recording: args.recording,
      warnings,
      errors: [],
   });
}

/** Verifies all criteria required for one conformance level and returns a full matrix. */
export async function verifyLevel(
   options: VerifyLevelOptions,
): Promise<VerificationReport> {
   const { parsedTarget, fallback } = resolveVerificationTarget(options.target);
   const parsedLevel = parseWcagLevel(options.level);
   const criterionIds = expandCriteriaForConformanceLevel(
      parsedLevel,
      options.wcagVersion,
   );
   const { collected, recording } = await collectLevelResults({
      options,
      parsedTarget,
      criterionIds,
   });
   return buildLevelReport({
      options,
      parsedTarget,
      parsedLevel,
      collected,
      recording,
      fallback,
   });
}

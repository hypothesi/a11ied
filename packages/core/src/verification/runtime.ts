import {
   platformSchema,
   verificationReportSchema,
   type CliMessage,
   type CriterionLookupKey,
   type Platform,
   type AccessibilityDriverSession,
   type WcagLevel,
   type VerificationCriterionResult,
   type VerificationReport,
} from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';
import { startDriverSession, stopDriverSession } from '../driver/runtime.js';
import { parseWcagLevel } from '../wcag/parsing.js';
import { listWcagCriteria } from '../wcag/runtime.js';
import { buildTarget, createLevelVerificationMessage, createSummary } from './helpers.js';
import { verifyCriterionResult } from './criterion-process.js';

interface VerifyCriterionOptions {
   criterion: CriterionLookupKey;
   url: string;
   target: string;
   wcagVersion: string;
   reportTarget?: VerificationReport['target'];
   recordingPath?: string;
}

interface VerifyLevelOptions {
   level: string;
   url: string;
   target: string;
   wcagVersion: string;
   reportTarget?: VerificationReport['target'];
   recordingPath?: string;
}

function parsePlatform(target: string): Platform {
   const parsed = platformSchema.safeParse(target);
   if (!parsed.success) {
      throw new CliUsageError('validation-error', `Target "${target}" is unsupported.`, {
         field: 'target',
         value: target,
         supportedTargets: [...platformSchema.options],
      });
   }

   return parsed.data;
}

function expandCriteriaForConformanceLevel(level: WcagLevel, version: string): string[] {
   const levelOrder: WcagLevel[] = ['A', 'AA', 'AAA'];
   const selectedIndex = levelOrder.indexOf(level);
   const expanded = levelOrder
      .slice(0, selectedIndex + 1)
      .flatMap((entryLevel) =>
         listWcagCriteria(entryLevel, version).criteria.map((criterion) => criterion.id),
      );

   return [...new Set(expanded)];
}

function toWarningsList(warning: CliMessage | undefined): CliMessage[] {
   if (warning) {
      return [warning];
   }
   return [];
}

function resolveTarget(
   target: VerificationReport['target'] | undefined,
   url: string,
   parsedTarget: Platform,
): VerificationReport['target'] {
   if (target) {
      return target;
   }
   return buildTarget(url, parsedTarget);
}

function resolveVersion(
   criteria: VerificationCriterionResult[],
   fallback: string,
): '2.1' | '2.2' {
   if (criteria[0]?.criterion.wcagVersion) {
      return criteria[0].criterion.wcagVersion;
   }
   return fallback as '2.1' | '2.2';
}

async function withManagedVerificationSession<TResult>(
   parsedTarget: Platform,
   recordingPath: string | undefined,
   run: (session: AccessibilityDriverSession | undefined) => Promise<TResult>,
): Promise<{ result: TResult; recording: VerificationReport['recording'] | undefined }> {
   let session: AccessibilityDriverSession | undefined = undefined;
   let result: TResult | undefined = undefined;

   if (recordingPath) {
      session = await startDriverSession(parsedTarget, process.cwd(), recordingPath);
   }

   try {
      result = await run(session);
   } finally {
      if (session) {
         const stopped = await stopDriverSession(session.sessionId);
         session = stopped.session;
      }
   }

   return {
      result: result as TResult,
      recording: session?.recording,
   };
}

function resolveVerificationSessionId(
   session: AccessibilityDriverSession | string,
): string {
   if (typeof session === 'string') {
      return session;
   }

   return session.sessionId;
}

function withVerificationSessionId<TArgs extends Record<string, unknown>>(
   args: TArgs,
   session: AccessibilityDriverSession | string | undefined,
): TArgs & { sessionId?: string } {
   if (session) {
      const sessionId = resolveVerificationSessionId(session);
      return {
         ...args,
         sessionId,
      };
   }

   return args;
}

/** Verifies one criterion against a target and returns a structured report row. */
export async function verifyCriterion(
   options: VerifyCriterionOptions,
): Promise<VerificationReport> {
   const parsedTarget = parsePlatform(options.target);
   const { result: verification, recording } = await withManagedVerificationSession(
      parsedTarget,
      options.recordingPath,
      async (session) => {
         const verifyArgs = {
            criterion: options.criterion,
            url: options.url,
            parsedTarget,
            wcagVersion: options.wcagVersion,
         };
         return verifyCriterionResult(withVerificationSessionId(verifyArgs, session));
      },
   );

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
      warnings: toWarningsList(verification.warning),
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

/** Verifies all criteria required for one conformance level and returns a full matrix. */
export async function verifyLevel(
   options: VerifyLevelOptions,
): Promise<VerificationReport> {
   const parsedTarget = parsePlatform(options.target);
   const parsedLevel = parseWcagLevel(options.level);
   const criterionIds = expandCriteriaForConformanceLevel(
      parsedLevel,
      options.wcagVersion,
   );
   const { result: collected, recording } = await withManagedVerificationSession(
      parsedTarget,
      options.recordingPath,
      async (session) => {
         const verifyArgs = {
            criterionIds,
            url: options.url,
            parsedTarget,
            wcagVersion: options.wcagVersion,
         };
         return collectLevelVerifications(withVerificationSessionId(verifyArgs, session));
      },
   );

   const summary = createSummary(collected.criteria);
   const levelWarning = createLevelVerificationMessage(parsedLevel, summary);
   if (levelWarning) {
      collected.warnings.unshift(levelWarning);
   }

   return verificationReportSchema.parse({
      target:
         options.reportTarget ??
         resolveTarget(collected.target, options.url, parsedTarget),
      wcagVersion: resolveVersion(collected.criteria, options.wcagVersion),
      requestedScope: {
         kind: 'level',
         level: parsedLevel,
      },
      summary,
      criteria: collected.criteria,
      recording,
      warnings: collected.warnings,
      errors: [],
   });
}

import {
   platformSchema,
   verificationReportSchema,
   wcagLevelSchema,
   type CliMessage,
   type CriterionLookupKey,
   type Platform,
   type WcagLevel,
   type VerificationCriterionResult,
   type VerificationReport,
} from '@a11lied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';
import { listWcagCriteria } from '../wcag/runtime.js';
import { buildTarget, createLevelVerificationMessage, createSummary } from './helpers.js';
import { verifyCriterionResult } from './criterion-process.js';

interface VerifyCriterionOptions {
   criterion: CriterionLookupKey;
   url: string;
   target: string;
   wcagVersion: string;
   reportTarget?: VerificationReport['target'];
}

interface VerifyLevelOptions {
   level: string;
   url: string;
   target: string;
   wcagVersion: string;
   reportTarget?: VerificationReport['target'];
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

function parseLevel(level: string): WcagLevel {
   const parsed = wcagLevelSchema.safeParse(level);
   if (!parsed.success) {
      throw new CliUsageError(
         'validation-error',
         `WCAG level "${level}" is unsupported.`,
         {
            field: 'level',
            value: level,
            supportedLevels: [...wcagLevelSchema.options],
         },
      );
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

export async function verifyCriterion(
   options: VerifyCriterionOptions,
): Promise<VerificationReport> {
   const parsedTarget = parsePlatform(options.target);
   const verification = await verifyCriterionResult({
      criterion: options.criterion,
      url: options.url,
      parsedTarget,
      wcagVersion: options.wcagVersion,
   });

   return verificationReportSchema.parse({
      target: options.reportTarget ?? verification.target,
      wcagVersion: verification.criterion.criterion.wcagVersion,
      requestedScope: {
         kind: 'criterion',
         criterion: options.criterion,
      },
      summary: createSummary([verification.criterion]),
      criteria: [verification.criterion],
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
   },
   accumulator: CriterionAccumulator,
): Promise<void> {
   const verification = await verifyCriterionResult({
      criterion: criterionId,
      url: args.url,
      parsedTarget: args.parsedTarget,
      wcagVersion: args.wcagVersion,
   });
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
}): Promise<CriterionAccumulator> {
   return verifyNextCriterion(args, 0, { criteria: [], warnings: [], target: undefined });
}

export async function verifyLevel(
   options: VerifyLevelOptions,
): Promise<VerificationReport> {
   const parsedTarget = parsePlatform(options.target);
   const parsedLevel = parseLevel(options.level);
   const criterionIds = expandCriteriaForConformanceLevel(
      parsedLevel,
      options.wcagVersion,
   );
   const collected = await collectLevelVerifications({
      criterionIds,
      url: options.url,
      parsedTarget,
      wcagVersion: options.wcagVersion,
   });

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
      warnings: collected.warnings,
      errors: [],
   });
}

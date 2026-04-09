import {
   applicabilityMatrixSchema,
   applicabilitySignalSchema,
   criterionApplicabilityLookupResultSchema,
   targetReferenceSchema,
   wcagVersionSchema,
   type CriteriaByLevelResult,
   type NormalizedCriterion,
} from '@a11ied/contracts';
import { listWcagCriteria, resolveDocumentTarget, showWcagCoverage } from '@a11ied/core';
import { z } from 'zod';

export const JSON_INDENT = 2;
export const DEFAULT_WCAG_VERSION = '2.2' as const;
export const MAX_SEARCH_RESULTS = 50;
export const DEFAULT_SEARCH_RESULTS = 10;
export const SUPPORTED_WCAG_VERSIONS = ['2.1', '2.2'] as const;

export const readOnlyAnnotations = {
   readOnlyHint: true,
   destructiveHint: false,
   openWorldHint: false,
} as const;

export const activeAnnotations = {
   readOnlyHint: false,
   destructiveHint: false,
   openWorldHint: true,
} as const;

export const targetInputSchema = z
   .object({
      url: z.string().url().optional(),
      storybookUrl: z.string().url().optional(),
      storyId: z.string().min(1).optional(),
   })
   .superRefine((value, ctx) => {
      const hasUrl = value.url !== undefined;
      const hasStorybook =
         value.storybookUrl !== undefined || value.storyId !== undefined;

      if (hasUrl && hasStorybook) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Choose either url or storybookUrl + storyId, not both.',
            path: ['url'],
         });
      }

      if (!hasUrl && value.storybookUrl === undefined && value.storyId === undefined) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide url or storybookUrl + storyId.',
            path: ['url'],
         });
      }

      if (value.storybookUrl !== undefined && value.storyId === undefined) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'storyId is required when storybookUrl is provided.',
            path: ['storyId'],
         });
      }

      if (value.storybookUrl === undefined && value.storyId !== undefined) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'storybookUrl is required when storyId is provided.',
            path: ['storybookUrl'],
         });
      }
   });

export const inspectApplicableResultSchema = z.object({
   version: wcagVersionSchema,
   target: targetReferenceSchema,
   signals: z.array(applicabilitySignalSchema),
   matrix: applicabilityMatrixSchema,
});

export const inspectCriterionResultSchema =
   criterionApplicabilityLookupResultSchema.extend({
      signals: z.array(applicabilitySignalSchema),
   });

export type SupportedWcagVersion = (typeof SUPPORTED_WCAG_VERSIONS)[number];
export type TargetInput = z.infer<typeof targetInputSchema>;

export interface ToolResponse<TPayload> {
   [key: string]: unknown;
   structuredContent: TPayload;
   content: Array<{ type: 'text'; text: string }>;
}

export interface JsonResource {
   [key: string]: unknown;
   contents: Array<{ uri: string; mimeType: string; text: string }>;
}

export interface ResolvedExecutionTarget {
   resolvedUrl: string;
   reportTarget: {
      kind: 'url' | 'story';
      value: string;
      resolvedUrl: string;
      storybookBaseUrl?: string;
   };
   html: string;
}

export interface CriteriaResource {
   version: SupportedWcagVersion;
   criteria: CriteriaByLevelResult['criteria'];
}

export interface LevelsResource {
   version: SupportedWcagVersion;
   levels: Array<{
      level: 'A' | 'AA' | 'AAA';
      criteria: CriteriaByLevelResult['criteria'];
   }>;
}

export interface CoverageResource {
   version: SupportedWcagVersion;
   coverage: Array<ReturnType<typeof showWcagCoverage>>;
}

export interface StrategySummary {
   criterionId: string;
   title: string;
   level: string;
   preferredEvidenceMode: string;
   procedureIds: string[];
   requiresRealTarget: boolean;
   notes: string[];
}

export interface StrategyResource {
   version: SupportedWcagVersion;
   strategies: StrategySummary[];
}

export function toJsonText(value: unknown): string {
   return JSON.stringify(value, undefined, JSON_INDENT);
}

export function createToolResponse<TPayload>(payload: TPayload): ToolResponse<TPayload> {
   return {
      structuredContent: payload,
      content: [{ type: 'text', text: toJsonText(payload) }],
   };
}

export function createJsonResource(uri: string, payload: unknown): JsonResource {
   return {
      contents: [
         {
            uri,
            mimeType: 'application/json',
            text: toJsonText(payload),
         },
      ],
   };
}

export function buildTargetInput(input: TargetInput): {
   url?: string;
   storybookUrl?: string;
   storyId?: string;
} {
   if (input.url) {
      return { url: input.url };
   }

   const targetInput: { storybookUrl?: string; storyId?: string } = {};
   if (input.storybookUrl) {
      targetInput.storybookUrl = input.storybookUrl;
   }
   if (input.storyId) {
      targetInput.storyId = input.storyId;
   }
   return targetInput;
}

export async function resolveExecutionTarget(
   input: TargetInput,
): Promise<ResolvedExecutionTarget> {
   const targetInput = buildTargetInput(input);
   const resolved = await resolveDocumentTarget(targetInput);

   if (resolved.target.kind === 'story') {
      const reportTarget: ResolvedExecutionTarget['reportTarget'] = {
         kind: 'story',
         value: resolved.target.value,
         resolvedUrl: resolved.resolvedUrl,
      };
      if (input.storybookUrl) {
         reportTarget.storybookBaseUrl = input.storybookUrl;
      }
      return {
         resolvedUrl: resolved.resolvedUrl,
         reportTarget,
         html: resolved.html,
      };
   }

   return {
      resolvedUrl: resolved.resolvedUrl,
      reportTarget: {
         kind: 'url',
         value: resolved.target.value,
         resolvedUrl: resolved.resolvedUrl,
      },
      html: resolved.html,
   };
}

function dedupeCriteria(
   criteria: CriteriaByLevelResult['criteria'],
): CriteriaByLevelResult['criteria'] {
   const index = new Map<string, NormalizedCriterion>(
      criteria.map((criterion: NormalizedCriterion) => [criterion.id, criterion]),
   );
   return [...index.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

export function listAllCriteria(
   version: SupportedWcagVersion,
): CriteriaByLevelResult['criteria'] {
   return dedupeCriteria(
      (['A', 'AA', 'AAA'] as const).flatMap(
         (level) => listWcagCriteria(level, version).criteria,
      ),
   );
}

export function buildCriteriaResource(version: SupportedWcagVersion): CriteriaResource {
   return {
      version,
      criteria: listAllCriteria(version),
   };
}

export function buildLevelsResource(version: SupportedWcagVersion): LevelsResource {
   return {
      version,
      levels: (['A', 'AA', 'AAA'] as const).map((level) => ({
         level,
         criteria: listWcagCriteria(level, version).criteria,
      })),
   };
}

export function buildCoverageResource(version: SupportedWcagVersion): CoverageResource {
   return {
      version,
      coverage: listAllCriteria(version).map((criterion: NormalizedCriterion) =>
         showWcagCoverage(criterion.id, version),
      ),
   };
}

export function buildStrategyResource(version: SupportedWcagVersion): StrategyResource {
   return {
      version,
      strategies: listAllCriteria(version).map((criterion: NormalizedCriterion) => {
         const lookup = showWcagCoverage(criterion.id, version);
         return {
            criterionId: criterion.id,
            title: criterion.title,
            level: criterion.level,
            preferredEvidenceMode: lookup.strategy.preferredEvidenceMode,
            procedureIds: lookup.strategy.procedureIds,
            requiresRealTarget: lookup.strategy.requiresRealTarget,
            notes: lookup.strategy.notes,
         };
      }),
   };
}

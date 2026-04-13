import {
   applicabilityMatrixSchema,
   applicabilitySignalSchema,
   criterionApplicabilityLookupResultSchema,
   targetReferenceSchema,
   wcagVersionSchema,
   type Platform,
   type CriteriaByLevelResult,
   type NormalizedCriterion,
} from '@a11ied/contracts';
import {
   listWcagCriteria,
   resolveDefaultTarget,
   resolveDocumentTarget,
   showWcagCoverage,
} from '@a11ied/core';
import { z } from 'zod';
const JSON_INDENT = 2;
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
   })
   .superRefine((value, ctx) => {
      const hasUrl = value.url !== undefined;
      if (!hasUrl) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide url.',
            path: ['url'],
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
interface JsonResource {
   [key: string]: unknown;
   contents: Array<{ uri: string; mimeType: string; text: string }>;
}
interface ResolvedExecutionTarget {
   resolvedUrl: string;
   reportTarget: {
      kind: 'url';
      value: string;
      resolvedUrl: string;
   };
   html: string;
}
interface CriteriaResource {
   version: SupportedWcagVersion;
   criteria: CriteriaByLevelResult['criteria'];
}

interface LevelsResource {
   version: SupportedWcagVersion;
   levels: Array<{
      level: 'A' | 'AA' | 'AAA';
      criteria: CriteriaByLevelResult['criteria'];
   }>;
}

interface CoverageResource {
   version: SupportedWcagVersion;
   coverage: Array<ReturnType<typeof showWcagCoverage>>;
}

interface StrategySummary {
   criterionId: string;
   title: string;
   level: string;
   preferredEvidenceMode: string;
   procedureIds: string[];
   requiresRealTarget: boolean;
   notes: string[];
}

interface StrategyResource {
   version: SupportedWcagVersion;
   strategies: StrategySummary[];
}

function toJsonText(value: unknown): string {
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

export function ensureVirtualTargetAllowed(
   target: Platform,
   allowVirtual?: boolean,
): void {
   if (target !== 'virtual') {
      return;
   }

   const fallback = resolveDefaultTarget();
   if (fallback.target === 'virtual') {
      return;
   }

   if (allowVirtual) {
      return;
   }

   throw new Error(
      'The virtual target is a simulation. Omit target to use VoiceOver/NVDA, or set allowVirtual=true to proceed.',
   );
}

export function buildTargetInput(input: TargetInput): {
   url?: string;
} {
   if (input.url) {
      return { url: input.url };
   }
   return {};
}

export async function resolveExecutionTarget(
   input: TargetInput,
): Promise<ResolvedExecutionTarget> {
   const targetInput = buildTargetInput(input);
   const resolved = await resolveDocumentTarget(targetInput);

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

function listAllCriteria(
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

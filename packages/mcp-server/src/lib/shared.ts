import type {
   AxeBaseline,
   AxeFailOnImpact,
   CriteriaByLevelResult,
   NormalizedCriterion,
   Platform,
} from '@a11ied/contracts';
import {
   DEFAULT_FAIL_ON_IMPACT,
   describeResolvedTarget,
   listWcagCriteria,
   resolveDefaultTarget,
   resolveDocumentTarget,
   showWcagCoverage,
   type DocumentLoad,
   type ResolveDocumentTargetInput,
   type ResolvedDocumentTarget,
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

/** A URL a real screen reader can navigate to, used by every `sr_session` action. */
export const targetInputSchema = z
   .object({
      url: z.string().url().optional(),
   })
   .superRefine((value, ctx) => {
      if (value.url === undefined) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide url.',
            path: ['url'],
         });
      }
   });

/**
 * The page target every `axe`, `tree`, and `audit` tool call accepts: an http(s) URL, a
 * local file path, or inline HTML. Mirrors the CLI's positional `<target>` and `--html`.
 */
export const pageTargetInputSchema = z.object({
   target: z.string().min(1).optional().describe('An http(s) URL or a local file path.'),
   html: z.string().optional().describe('Inline HTML markup to load instead of target.'),
   timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Timeout for loading the target, in milliseconds. Defaults to 10000.'),
});
export type PageTargetInput = z.infer<typeof pageTargetInputSchema>;

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

/** The target a page-tool result reports: kind, the value given, and the resolved URL. */
export interface PageReportTarget {
   kind: string;
   value: string;
   resolvedUrl: string;
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

/** Resolves a session-lifecycle `url` input, the way `sr start` and `sr open` do. */
export async function resolveExecutionTarget(
   input: TargetInput,
): Promise<ResolvedExecutionTarget> {
   const targetInput = buildTargetInput(input);
   const resolved = await resolveDocumentTarget(targetInput);
   const resolvedUrl = describeResolvedTarget(resolved);

   return {
      resolvedUrl,
      reportTarget: {
         kind: 'url',
         value: resolved.target.value,
         resolvedUrl,
      },
      html: await resolved.readHtml(),
   };
}

/** Resolves an `axe`/`tree`/`audit` page target the way the CLI's positional target does. */
export async function resolvePageTarget(
   input: PageTargetInput,
   toolName: string,
): Promise<ResolvedDocumentTarget> {
   const request: ResolveDocumentTargetInput = { commandName: toolName };
   if (input.target !== undefined) {
      request.target = input.target;
   }
   if (input.html !== undefined) {
      request.html = input.html;
   }
   if (input.timeoutMs !== undefined) {
      request.timeoutMs = input.timeoutMs;
   }
   return resolveDocumentTarget(request);
}

/** A resolved page target always has a `load`; only `app` targets (unused here) lack one. */
export function requireLoad(resolved: ResolvedDocumentTarget): DocumentLoad {
   if (!resolved.load) {
      throw new Error('This target has no page to load.');
   }
   return resolved.load;
}

export function describePageReportTarget(
   resolved: ResolvedDocumentTarget,
): PageReportTarget {
   return {
      kind: resolved.target.kind,
      value: resolved.target.value,
      resolvedUrl: describeResolvedTarget(resolved),
   };
}

/** Fills in the `--fail-on` default the way `axe` and `audit` both do. */
export function buildAxeVerdictInput(args: {
   failOn: AxeFailOnImpact | undefined;
   baseline: AxeBaseline | undefined;
}): { failOn: AxeFailOnImpact; baseline?: AxeBaseline } {
   const input: { failOn: AxeFailOnImpact; baseline?: AxeBaseline } = {
      failOn: args.failOn ?? DEFAULT_FAIL_ON_IMPACT,
   };
   if (args.baseline) {
      input.baseline = args.baseline;
   }
   return input;
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

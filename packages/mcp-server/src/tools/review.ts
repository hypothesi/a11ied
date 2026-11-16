import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { review, browserReview } from '@a11ied/review';
import {
   observationBundleSliceSchema,
   conditionCaptureRequestSchema,
   reviewTargetStateSchema,
   stateSetupActionSchema,
   verdictProposalSchema,
   type WcagVersion,
} from '@a11ied/contracts';
import {
   showWcagCriterion,
   showWcagTechnique,
   showWcagUnderstanding,
} from '@a11ied/core';
import { createToolResponse } from '../lib/shared.js';

const activeAnnotations = {
   audience: ['assistant'],
   priority: 0.9,
   readOnlyHint: false,
} as const;

const readOnlyAnnotations = {
   audience: ['assistant'],
   priority: 0.9,
   readOnlyHint: true,
} as const;

const REVIEW_RESULT_SUMMARY =
   'Review result is in structuredContent. Evidence and report artifacts remain in the review run directory.';

const TECHNIQUE_ID_PATTERN = /^[A-Z]{1,4}\d+$/i;

// Zod schemas for review tools
const reviewStartInputSchema = z.object({
   scopeGaps: z
      .array(z.string().min(1))
      .optional()
      .describe('Known missing site/process coverage; blocks final reporting.'),
   runDir: z
      .string()
      .describe('Directory where review artifacts and run state are stored.'),
   runId: z.string().optional().describe('Unique identifier for this review run.'),
   target: z
      .string()
      .optional()
      .describe('Target URL to observe. Additional pages must be registered explicitly.'),
   targetOrigin: z.string().optional().describe('Origin header/authority of the target.'),
   states: z
      .array(reviewTargetStateSchema)
      .optional()
      .describe('Registered target states to assess.'),
   criterionIds: z
      .array(z.string())
      .optional()
      .describe('Subset of WCAG criteria to evaluate.'),
   concurrency: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Parallel observation concurrency.'),
});

const reviewNextInputSchema = z.object({
   runDir: z
      .string()
      .describe('Directory where review artifacts and run state are stored.'),
   runId: z.string().optional().describe('Run identifier.'),
   stateId: z.string().optional().describe('Claim checks specifically for this state.'),
   agentId: z.string().optional().describe('Agent identifier claiming the lease.'),
   count: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum number of checks to claim (default 10).'),
});

const reviewObserveInputSchema = z.object({
   capture: conditionCaptureRequestSchema.optional(),
   refresh: z
      .boolean()
      .optional()
      .describe('Collect a fresh browser observation instead of reading the cache.'),
   runDir: z
      .string()
      .describe('Directory where review artifacts and run state are stored.'),
   runId: z.string().optional().describe('Run identifier.'),
   stateId: z.string().describe('State identifier to retrieve or observe.'),
   targetUrl: z
      .string()
      .optional()
      .describe('Target URL when observing with setup actions.'),
   slice: observationBundleSliceSchema
      .optional()
      .describe('Cached observation section to retrieve.'),
   setup: z
      .array(stateSetupActionSchema)
      .optional()
      .describe('Setup actions to reach this interactive state.'),
});

const reviewJudgeInputSchema = z.object({
   runDir: z
      .string()
      .describe('Directory where review artifacts and run state are stored.'),
   runId: z.string().optional().describe('Run identifier.'),
   agentId: z.string().optional().describe('Agent committing the verdicts.'),
   verdicts: z.array(verdictProposalSchema).describe('Array of verdicts to record.'),
});

const reviewStatusInputSchema = z.object({
   runDir: z
      .string()
      .describe('Directory where review artifacts and run state are stored.'),
   runId: z.string().optional().describe('Run identifier.'),
   full: z
      .boolean()
      .optional()
      .describe('Whether to include full state and verdict arrays.'),
   agentId: z.string().optional().describe('Filter active leases by agent.'),
});

const reviewReportInputSchema = z.object({
   runDir: z
      .string()
      .describe('Directory where review artifacts and run state are stored.'),
   runId: z.string().optional().describe('Run identifier.'),
   outDir: z.string().optional().describe('Output directory for report files.'),
   formats: z
      .array(z.enum(['html', 'json', 'markdown']))
      .optional()
      .describe('Output formats.'),
   draft: z.boolean().optional().describe('Mark report as draft.'),
});

const reviewRunInputSchema = z.object({
   runDir: z
      .string()
      .describe('Directory where review artifacts and run state are stored.'),
   runId: z.string().optional().describe('Unique run identifier.'),
   target: z
      .string()
      .optional()
      .describe('Target URL to observe. Additional pages must be registered explicitly.'),
   concurrency: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Parallel observation concurrency.'),
   nextCount: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Checks to claim in first packet.'),
   draftReport: z.boolean().optional().describe('Generate an initial draft report.'),
});

const wcagShowInputSchema = z.object({
   criterion: z
      .string()
      .describe(
         'WCAG criterion ID (e.g. 1.1.1, non-text-content) or technique ID (e.g. G94).',
      ),
   version: z.enum(['2.1', '2.2']).default('2.2').describe('WCAG version.'),
   includeUnderstanding: z
      .boolean()
      .default(false)
      .describe('Include understanding document text.'),
});

interface RegisterPairOptions<TSchema extends z.ZodObject<z.ZodRawShape>> {
   canonicalName: string;
   underscoreName: string;
   config: {
      title: string;
      description: string;
      inputSchema: TSchema;
      annotations?: typeof activeAnnotations | typeof readOnlyAnnotations;
   };
   handler: (args: z.output<TSchema>) => Promise<ReturnType<typeof createToolResponse>>;
}

function registerPair<TSchema extends z.ZodObject<z.ZodRawShape>>(
   server: McpServer,
   options: RegisterPairOptions<TSchema>,
): void {
   const config = { ...options.config, inputSchema: options.config.inputSchema.shape };
   const handler = async (input: unknown): Promise<CallToolResult> => {
      const response = await options.handler(options.config.inputSchema.parse(input));
      return {
         content: response.content,
         structuredContent: z
            .record(z.string(), z.unknown())
            .parse(response.structuredContent),
      };
   };
   server.registerTool(options.canonicalName, config, handler);
   server.registerTool(options.underscoreName, config, handler);
}

function registerCoreReviewTools(server: McpServer): void {
   registerPair(server, {
      canonicalName: 'review.start',
      underscoreName: 'review_start',
      config: {
         title: 'Start review run',
         description:
            'Start a verdict-backed WCAG 2.2 AA review run: registers pages/states, runs Tier-0/1 automatic evaluations, and returns coverage summary and initial claimable checks.',
         inputSchema: reviewStartInputSchema,
         annotations: activeAnnotations,
      },
      handler: async (input) => {
         const result = await browserReview.start(input);
         return createToolResponse(result, REVIEW_RESULT_SUMMARY);
      },
   });

   registerPair(server, {
      canonicalName: 'review.resume',
      underscoreName: 'review_resume',
      config: {
         title: 'Resume saved review',
         description:
            'Resume saved work, recover expired claims and optionally attach a matching site/journey coordinator.',
         inputSchema: z.object({
            runDir: z.string().min(1),
            runId: z.string().min(1),
            coordinator: z
               .object({ file: z.string().min(1), runId: z.string().min(1) })
               .optional(),
            agentId: z.string().min(1).optional(),
         }),
         annotations: activeAnnotations,
      },
      handler: async (input) =>
         createToolResponse(await review.resume(input), REVIEW_RESULT_SUMMARY),
   });

   registerPair(server, {
      canonicalName: 'review.next',
      underscoreName: 'review_next',
      config: {
         title: 'Claim next review checks',
         description:
            'Claim the next batch of checks for a state. Returns a self-contained State Review Packet with DOM/transcript summaries and procedure instructions for agent evaluation.',
         inputSchema: reviewNextInputSchema,
         annotations: activeAnnotations,
      },
      handler: async (input) => {
         const result = await review.next(input);
         return createToolResponse(result, REVIEW_RESULT_SUMMARY);
      },
   });

   registerPair(server, {
      canonicalName: 'review.observe',
      underscoreName: 'review_observe',
      config: {
         title: 'Observe state or bundle slice',
         description:
            'Retrieve a cached observation bundle or named slice (axe, tree, facts, contrast, transcript, viewports), or observe a new interactive state with setup actions.',
         inputSchema: reviewObserveInputSchema,
         annotations: activeAnnotations,
      },
      handler: async (input) => {
         const result = await browserReview.observe({
            ...input,
            slice: input.slice,
         });
         return createToolResponse(result, REVIEW_RESULT_SUMMARY);
      },
   });

   registerPair(server, {
      canonicalName: 'review.judge',
      underscoreName: 'review_judge',
      config: {
         title: 'Judge review checks',
         description:
            'Validate evidence for a batch of proposed judgments before recording accepted results. Unsupported claims remain unresolved.',
         inputSchema: reviewJudgeInputSchema,
         annotations: activeAnnotations,
      },
      handler: async (input) => {
         const result = await review.judge(input);
         return createToolResponse(result, REVIEW_RESULT_SUMMARY);
      },
   });
}

function registerExtendedReviewTools(server: McpServer): void {
   registerPair(server, {
      canonicalName: 'review.status',
      underscoreName: 'review_status',
      config: {
         title: 'Review status and queue',
         description:
            'Inspect review run coverage and priority queue. Defaults to top 20 actionable items; set full to true to return complete state and verdict arrays.',
         inputSchema: reviewStatusInputSchema,
         annotations: readOnlyAnnotations,
      },
      handler: async (input) => {
         const result = await review.status(input);
         return createToolResponse(result, REVIEW_RESULT_SUMMARY);
      },
   });

   registerPair(server, {
      canonicalName: 'review.report',
      underscoreName: 'review_report',
      config: {
         title: 'Generate review report',
         description:
            'Generate final or draft review audit report files (HTML, JSON, Markdown) with VPAT and methodology disclosures.',
         inputSchema: reviewReportInputSchema,
         annotations: activeAnnotations,
      },
      handler: async (input) => {
         const result = await review.report(input);
         return createToolResponse(result, REVIEW_RESULT_SUMMARY);
      },
   });

   registerPair(server, {
      canonicalName: 'review.run',
      underscoreName: 'review_run',
      config: {
         title: 'Run review initiation',
         description:
            'Run an end-to-end review initiation: starts the review, optionally builds an initial draft report, and claims the first batch of checks.',
         inputSchema: reviewRunInputSchema,
         annotations: activeAnnotations,
      },
      handler: async (input) => {
         const result = await browserReview.run(input);
         return createToolResponse(result, REVIEW_RESULT_SUMMARY);
      },
   });

   server.registerTool(
      'wcag.show',
      {
         title: 'WCAG show',
         description:
            'Show one WCAG criterion by id or slug, or a technique by ID. Forwarding alias to showWcagCriterion.',
         inputSchema: wcagShowInputSchema,
         annotations: readOnlyAnnotations,
      },
      async ({
         criterion,
         version,
         includeUnderstanding,
      }: {
         criterion: string;
         version: WcagVersion;
         includeUnderstanding: boolean;
      }) => {
         if (TECHNIQUE_ID_PATTERN.test(criterion)) {
            return createToolResponse(showWcagTechnique(criterion, version));
         }
         const result = showWcagCriterion(criterion, version);
         if (!includeUnderstanding) {
            return createToolResponse(result);
         }
         const understanding = showWcagUnderstanding(criterion, version);
         return createToolResponse({
            ...result,
            understanding: { document: understanding.document, body: understanding.body },
         });
      },
   );
}

/** Registers the 8-tool N5 review facade and backward-compatible aliases on McpServer. */
export function registerReviewTools(server: McpServer): void {
   registerCoreReviewTools(server);
   registerExtendedReviewTools(server);
}

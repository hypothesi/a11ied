import {
   axeBaselineSchema,
   axeFailOnImpactSchema,
   criterionLookupKeySchema,
   wcagLevelSchema,
   wcagVersionSchema,
   type AxeRunResult,
   type AxeVerdict,
} from '@a11ied/contracts';
import {
   buildNextCommands,
   evaluateAxeVerdict,
   filterAriaTree,
   getAccessibilityTree,
   runAxe,
   serializeAriaTree,
   buildAuditReport,
   type AriaTreeNode,
   type AuditReport,
} from '@a11ied/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
   DEFAULT_WCAG_VERSION,
   buildAxeVerdictInput,
   createToolResponse,
   describePageReportTarget,
   pageTargetInputSchema,
   readOnlyAnnotations,
   requireLoad,
   resolvePageTarget,
   type PageReportTarget,
} from '../lib/shared.js';

const CLI_EXIT_SUCCESS = 0;
const CLI_EXIT_ASSERTION = 4;

const axeCookieSchema = z.object({
   name: z.string().min(1),
   value: z.string(),
   url: z.string().min(1),
});

const runAxeInputSchema = pageTargetInputSchema
   .extend({
      version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
      criterion: criterionLookupKeySchema
         .optional()
         .describe('Limit the run to one WCAG criterion id or slug.'),
      level: wcagLevelSchema.optional().describe('Limit the run to one WCAG level.'),
      ruleIds: z
         .array(z.string().min(1))
         .min(1)
         .optional()
         .describe('Limit the run to these explicit axe rule ids.'),
      selector: z
         .string()
         .min(1)
         .optional()
         .describe('Scope the scan to elements matching this CSS selector.'),
      exclude: z
         .string()
         .min(1)
         .optional()
         .describe('Exclude elements matching this CSS selector from the scan.'),
      waitFor: z
         .string()
         .min(1)
         .optional()
         .describe('Wait for an element matching this CSS selector before scanning.'),
      viewport: z
         .object({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
         })
         .optional()
         .describe('Browser viewport to render the page at.'),
      headers: z
         .record(z.string(), z.string())
         .optional()
         .describe('Extra request headers to send when loading the target.'),
      cookies: z
         .array(axeCookieSchema)
         .optional()
         .describe('Cookies to set before loading the target.'),
      failOn: axeFailOnImpactSchema
         .optional()
         .describe('Only fail on violations at or above this impact. Defaults to minor.'),
      baseline: axeBaselineSchema
         .optional()
         .describe('Accepted findings that do not count toward the exit code.'),
   })
   .superRefine((value, ctx) => {
      const selected = [value.criterion, value.level, value.ruleIds].filter(
         (entry) => entry !== undefined,
      ).length;
      if (selected > 1) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
               'Choose at most one of criterion, level, or ruleIds. ' +
               'Omit all three to run every mapped rule, matching the CLI default.',
            path: ['criterion'],
         });
      }
   });
type RunAxeInput = z.infer<typeof runAxeInputSchema>;

interface AxeToolResult {
   target: PageReportTarget;
   result: AxeRunResult & { verdict: AxeVerdict };
   exitCode: number;
}

function exitCodeForVerdict(passed: boolean): number {
   return passed ? CLI_EXIT_SUCCESS : CLI_EXIT_ASSERTION;
}

type AxeScanOptions = Pick<
   RunAxeInput,
   'timeoutMs' | 'selector' | 'exclude' | 'waitFor' | 'viewport'
> & { extraHeaders: RunAxeInput['headers']; cookies: RunAxeInput['cookies'] };

/** Runs the selected axe scan: one criterion, one level, explicit rule ids, or all rules. */
async function selectAxeRun(
   load: ReturnType<typeof requireLoad>,
   input: RunAxeInput,
   scanOptions: AxeScanOptions,
): Promise<AxeRunResult> {
   const base = { wcagVersion: input.version, ...scanOptions };
   if (input.criterion) {
      return runAxe(load, { ...base, criterion: input.criterion });
   }
   if (input.level) {
      return runAxe(load, { ...base, level: input.level });
   }
   if (input.ruleIds) {
      return runAxe(load, { ...base, ruleIds: input.ruleIds });
   }
   return runAxe(load, base);
}

async function runAxeForInput(input: RunAxeInput): Promise<AxeToolResult> {
   const resolved = await resolvePageTarget(input, 'run_axe');
   const load = requireLoad(resolved);
   const scanOptions: AxeScanOptions = {
      timeoutMs: input.timeoutMs,
      selector: input.selector,
      exclude: input.exclude,
      waitFor: input.waitFor,
      viewport: input.viewport,
      extraHeaders: input.headers,
      cookies: input.cookies,
   };
   const result = await selectAxeRun(load, input, scanOptions);
   const verdict = evaluateAxeVerdict({
      violations: result.violations,
      ...buildAxeVerdictInput({ failOn: input.failOn, baseline: input.baseline }),
   });

   return {
      target: describePageReportTarget(resolved),
      result: { ...result, verdict },
      exitCode: exitCodeForVerdict(verdict.passed),
   };
}

function registerRunAxeTool(server: McpServer): void {
   server.registerTool(
      'run_axe',
      {
         title: 'Run axe',
         description:
            'Run axe-core against a target: an http(s) URL, a local file path (target), or inline HTML (html). ' +
            'Omit criterion, level, and ruleIds to run every mapped rule, the same as the CLI axe command with no filter. ' +
            'The result carries a verdict.passed field and the tool returns exitCode 4 (the CLI assertion exit code) when a violation ' +
            'at or above failOn (default minor) is not covered by baseline, and 0 otherwise.',
         inputSchema: runAxeInputSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async (input) => createToolResponse({ ...(await runAxeForInput(input)) }),
   );
}

const treeInputSchema = pageTargetInputSchema.extend({
   role: z.string().min(1).optional().describe('Keep only nodes with this role.'),
   name: z
      .string()
      .min(1)
      .optional()
      .describe('Keep only nodes whose accessible name contains this text.'),
});
type TreeInput = z.infer<typeof treeInputSchema>;

function buildTreeFilter(
   input: TreeInput,
): ((node: AriaTreeNode) => boolean) | undefined {
   if (!input.role && !input.name) {
      return undefined;
   }
   const namePattern = input.name?.toLowerCase();
   return (node: AriaTreeNode): boolean => {
      if (input.role && node.role !== input.role) {
         return false;
      }
      return !namePattern || (node.name ?? '').toLowerCase().includes(namePattern);
   };
}

async function handleTree(input: TreeInput): Promise<{
   target: PageReportTarget;
   result: { yaml: string; nodes: AriaTreeNode[] };
}> {
   const resolved = await resolvePageTarget(input, 'tree');
   const load = requireLoad(resolved);
   const tree = await getAccessibilityTree(load, { timeoutMs: input.timeoutMs });
   const filter = buildTreeFilter(input),
      target = describePageReportTarget(resolved);

   if (!filter) {
      return { target, result: tree };
   }
   const nodes = filterAriaTree(tree.nodes, filter);
   return { target, result: { yaml: serializeAriaTree(nodes), nodes } };
}

function registerTreeTool(server: McpServer): void {
   server.registerTool(
      'tree',
      {
         title: 'Accessibility tree',
         description:
            'Print the accessibility tree for a target: an http(s) URL, a local file path (target), or inline HTML (html). ' +
            'role and name each keep only matching nodes and their ancestors. ' +
            'Uses Playwright ariaSnapshot(), so JavaScript-rendered content is included.',
         inputSchema: treeInputSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async (input) => createToolResponse(await handleTree(input)),
   );
}

const auditInputSchema = pageTargetInputSchema.extend({
   version: wcagVersionSchema.default(DEFAULT_WCAG_VERSION),
   failOn: axeFailOnImpactSchema
      .optional()
      .describe(
         'Only fail on axe violations at or above this impact. Defaults to minor.',
      ),
   baseline: axeBaselineSchema
      .optional()
      .describe('Accepted axe findings that do not count toward the exit code.'),
});
type AuditInput = z.infer<typeof auditInputSchema>;

interface AuditToolResult {
   target: PageReportTarget;
   result: AuditReport & { verdict: AxeVerdict; nextCommands: string[] };
   exitCode: number;
}

async function handleAudit(input: AuditInput): Promise<AuditToolResult> {
   const resolved = await resolvePageTarget(input, 'audit');
   const load = requireLoad(resolved),
      target = describePageReportTarget(resolved);
   const report = await buildAuditReport({
      load,
      readHtml: resolved.readHtml,
      target: resolved.target,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
      wcagVersion: input.version,
      timeoutMs: input.timeoutMs,
   });
   const verdict = evaluateAxeVerdict({
      violations: report.axe.violations,
      ...buildAxeVerdictInput({ failOn: input.failOn, baseline: input.baseline }),
   });
   const nextCommands = buildNextCommands({
      axe: report.axe,
      criteria: report.criteria,
      target: target.value,
      roles: report.tree.roles,
   });

   return {
      target,
      result: { ...report, verdict, nextCommands },
      exitCode: exitCodeForVerdict(verdict.passed),
   };
}

function registerAuditTool(server: McpServer): void {
   server.registerTool(
      'audit',
      {
         title: 'Audit',
         description:
            'Run the full audit loop against a target: an http(s) URL, a local file path (target), or inline HTML (html). ' +
            'Runs axe against every mapped rule, an accessibility tree summary, the relevant criteria scan, and a per-criterion rollup. ' +
            'The result carries verdict.passed and nextCommands, and the tool returns exitCode 4 (the CLI assertion exit code) ' +
            'when an axe violation at or above failOn is not covered by baseline, and 0 otherwise. Run this after any component change.',
         inputSchema: auditInputSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async (input) => createToolResponse({ ...(await handleAudit(input)) }),
   );
}

export function registerExecutionTools(server: McpServer): void {
   registerRunAxeTool(server);
   registerTreeTool(server);
   registerAuditTool(server);
}

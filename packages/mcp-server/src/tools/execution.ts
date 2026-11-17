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
   capturePage,
   runPageCheck,
   type AriaTreeNode,
   type PageCheck,
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
      click: z
         .string()
         .min(1)
         .optional()
         .describe(
            'A selector for the one element to click after the page loads, before the scan.',
         ),
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
   'timeoutMs' | 'selector' | 'exclude' | 'waitFor' | 'click' | 'viewport'
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
      click: input.click,
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
   click: z
      .string()
      .min(1)
      .optional()
      .describe(
         'A selector for the one element to click after the page loads, before reading the tree.',
      ),
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
   const tree = await getAccessibilityTree(load, {
      timeoutMs: input.timeoutMs,
      click: input.click,
   });
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

const checkInputSchema = pageTargetInputSchema.extend({
   level: wcagLevelSchema
      .optional()
      .describe('Check WCAG through this level: A, AA, or AAA.'),
   storageStatePath: z.string().min(1).optional(),
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
type CheckInput = z.infer<typeof checkInputSchema>;

interface CheckToolResult {
   target: PageReportTarget;
   result: PageCheck & { verdict: AxeVerdict; nextCommands: string[] };
   exitCode: number;
}

async function handleCheck(input: CheckInput): Promise<CheckToolResult> {
   const resolved = await resolvePageTarget(input, 'check');
   const load = requireLoad(resolved),
      target = describePageReportTarget(resolved);
   const check = await runPageCheck({
      load,
      target: resolved.target,
      metadata: resolved.metadata,
      userHints: resolved.userHints,
      wcagVersion: input.version,
      level: input.level,
      timeoutMs: input.timeoutMs,
      storageStatePath: input.storageStatePath,
   });
   const verdict = evaluateAxeVerdict({
      violations: check.axe.violations,
      ...buildAxeVerdictInput({ failOn: input.failOn, baseline: input.baseline }),
   });
   const nextCommands = buildNextCommands({
      axe: check.axe,
      criteria: check.criteria,
      target: target.value,
      roles: check.tree.roles,
   });

   return {
      target,
      result: { ...check, verdict, nextCommands },
      exitCode: exitCodeForVerdict(verdict.passed),
   };
}

function registerCheckTool(server: McpServer): void {
   server.registerTool(
      'check',
      {
         title: 'Check one page',
         description:
            'Scan an http(s) URL, a local file path (target), or inline HTML (html) during development. ' +
            'Runs axe against every mapped rule and returns an accessibility tree summary, the relevant criteria, and a per-criterion rollup. ' +
            'The result carries verdict.passed and nextCommands, and the tool returns exitCode 4 (the CLI assertion exit code) ' +
            'when an axe violation at or above failOn is not covered by baseline, and 0 otherwise. ' +
            'A clean scan never passes a criterion. Use the audit tools for a tracked WCAG audit with judged outcomes.',
         inputSchema: checkInputSchema,
         annotations: { ...readOnlyAnnotations, openWorldHint: true },
      },
      async (input) => createToolResponse({ ...(await handleCheck(input)) }),
   );
}

function registerCaptureTool(server: McpServer): void {
   server.registerTool(
      'capture',
      {
         title: 'Capture a page',
         description:
            'Load a page, put it in a condition, and save a PNG screenshot: a viewport size, a zoom factor, WCAG text ' +
            'spacing, after clicking an element, after pressing keys such as "Tab*4", or while hovering. Returns the ' +
            'file path, the focused element with whether it is in view or covered and its outline, and the horizontal ' +
            'overflow in pixels. Same as a1 capture.',
         inputSchema: {
            url: z.string().min(1),
            out: z.string().min(1).describe('PNG file to write.'),
            viewport: z.string().optional().describe('WIDTHxHEIGHT, such as 320x800.'),
            zoom: z.number().positive().optional(),
            textSpacing: z.boolean().optional(),
            click: z.string().optional(),
            press: z.array(z.string()).optional(),
            hover: z.string().optional(),
            selector: z.string().optional(),
            fullPage: z.boolean().optional(),
            waitFor: z.string().optional(),
            storageStatePath: z.string().optional(),
            timeoutMs: z.number().int().positive().optional(),
         },
         annotations: {
            ...readOnlyAnnotations,
            readOnlyHint: false,
            openWorldHint: true,
         },
      },
      async (input) => createToolResponse({ ...(await capturePage(input.url, input)) }),
   );
}

export function registerExecutionTools(server: McpServer): void {
   registerRunAxeTool(server);
   registerTreeTool(server);
   registerCheckTool(server);
   registerCaptureTool(server);
}

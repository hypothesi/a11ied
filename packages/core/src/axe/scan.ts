import type { AxeRuleResult } from '@a11ied/contracts';
import axe from 'axe-core';

import type { PageCookie } from '../browser/page-setup.js';
import { withLoadedPage } from '../browser/shared-browser.js';
import type { DocumentLoad } from '../targets/parse.js';

const LOW_CONTENT_NODE_THRESHOLD = 10;
const LOW_CONTENT_TEXT_THRESHOLD = 50;
const axeScriptSource = axe.source;

export interface AxeScanOptions {
   timeoutMs?: number | undefined;
   selector?: string | undefined;
   exclude?: string | undefined;
   waitFor?: string | undefined;
   /** A selector for the one element to click after the page loads and before the scan. */
   click?: string | undefined;
   viewport?: { width: number; height: number } | undefined;
   extraHeaders?: Record<string, string> | undefined;
   cookies?: PageCookie[] | undefined;
}

/** True when a scan option would make the raw axe result unsafe to cache or reuse. */
export function hasCustomScanOptions(options: AxeScanOptions): boolean {
   return (
      Boolean(options.selector) ||
      Boolean(options.exclude) ||
      Boolean(options.waitFor) ||
      Boolean(options.click) ||
      Boolean(options.viewport) ||
      Boolean(options.extraHeaders) ||
      (options.cookies?.length ?? 0) > 0
   );
}

/** Selector steps nest when axe finds the element inside a shadow root. */
type RawAxeSelector = string | string[];

interface RawAxeNode {
   target?: RawAxeSelector[];
   html?: string;
   failureSummary?: string;
}

export interface RawAxeRule {
   id: string;
   impact?: 'minor' | 'moderate' | 'serious' | 'critical' | null;
   description: string;
   help: string;
   helpUrl: string;
   tags?: string[];
   nodes?: RawAxeNode[];
}

export interface RawAxeResults {
   violations?: RawAxeRule[];
   passes?: RawAxeRule[];
   incomplete?: RawAxeRule[];
   inapplicable?: RawAxeRule[];
}

export interface AxeScanResult {
   raw: RawAxeResults;
   warnings: string[];
}

export function normalizeRule(rule: RawAxeRule): AxeRuleResult {
   return {
      id: rule.id,
      impact: rule.impact ?? undefined,
      description: rule.description,
      help: rule.help,
      helpUrl: rule.helpUrl,
      tags: rule.tags ?? [],
      nodes:
         rule.nodes?.map((node) => ({
            target: (node.target ?? []).flat(),
            html: node.html ?? '',
            failureSummary: node.failureSummary ?? undefined,
         })) ?? [],
   };
}

interface AxeEvaluateArgs {
   ruleIds: string[];
   selector: string | undefined;
   exclude: string | undefined;
   nodeThreshold: number;
   textThreshold: number;
}

/** Runs entirely inside the page: builds axe's run context and executes the scan. */
async function runAxeInPage(args: AxeEvaluateArgs): Promise<AxeScanResult> {
   function buildRunContext(): unknown {
      if (!args.selector && !args.exclude) {
         return document;
      }
      const runContext: { include?: string[]; exclude?: string[] } = {};
      if (args.selector) {
         runContext.include = [args.selector];
      }
      if (args.exclude) {
         runContext.exclude = [args.exclude];
      }
      return runContext;
   }

   const axeRef = (
      globalThis as typeof globalThis & {
         axe: { run: (context: unknown, options: unknown) => Promise<RawAxeResults> };
      }
   ).axe;

   const warnings: string[] = [];
   const visibleNodes = document.body.querySelectorAll(
      ':not(script):not(style):not(link):not(meta)',
   ).length;
   const textLength = (document.body.textContent ?? '').trim().length;
   if (visibleNodes < args.nodeThreshold && textLength < args.textThreshold) {
      warnings.push(
         `Low content detected (${visibleNodes} visible elements, ${textLength} characters). ` +
            'This page may be an unmounted SPA shell. axe-core results may be incomplete or misleading.',
      );
   }

   const raw = await axeRef.run(buildRunContext(), {
      runOnly: { type: 'rule', values: args.ruleIds },
   });
   return { raw, warnings };
}

function buildWaitForSelectorOptions(timeoutMs: number | undefined): {
   timeout?: number;
} {
   if (timeoutMs === undefined) {
      return {};
   }
   return { timeout: timeoutMs };
}

/** Loads a target, then runs axe-core against it inside the page. */
export async function executeAxeScan(
   load: DocumentLoad,
   ruleIds: string[],
   scanOptions: AxeScanOptions,
): Promise<AxeScanResult> {
   return withLoadedPage(
      load,
      async (page) => {
         if (scanOptions.waitFor) {
            await page.waitForSelector(
               scanOptions.waitFor,
               buildWaitForSelectorOptions(scanOptions.timeoutMs),
            );
         }
         await page.addScriptTag({ content: axeScriptSource });
         return await page.evaluate(runAxeInPage, {
            ruleIds,
            selector: scanOptions.selector,
            exclude: scanOptions.exclude,
            nodeThreshold: LOW_CONTENT_NODE_THRESHOLD,
            textThreshold: LOW_CONTENT_TEXT_THRESHOLD,
         });
      },
      scanOptions,
   );
}

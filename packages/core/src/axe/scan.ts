import type { AxeRuleResult } from '@a11ied/contracts';
import axe from 'axe-core';
import type { Page } from 'playwright';
import { CliEnvironmentError } from '../errors/cli-errors.js';

import {
   withLoadedPage,
   type WithBrowserPageOptions,
} from '../browser/shared-browser.js';
import type { DocumentLoad } from '../targets/parse.js';

const LOW_CONTENT_NODE_THRESHOLD = 10;
const LOW_CONTENT_TEXT_THRESHOLD = 50;
const axeScriptSource = axe.source;
const activeScans = new WeakSet<Page>();

export interface AxeScanOptions extends WithBrowserPageOptions {
   selector?: string | undefined;
   exclude?: string | undefined;
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
async function scanBrowserPage(
   page: Page,
   args: AxeEvaluateArgs,
   options: AxeScanOptions,
): Promise<AxeScanResult> {
   if (options.waitFor) {
      await page.waitForSelector(
         options.waitFor,
         buildWaitForSelectorOptions(options.timeoutMs),
      );
   }
   await page.evaluate(axeScriptSource);
   return page.evaluate(runAxeInPage, args);
}

export async function executeAxeScan(
   load: DocumentLoad,
   ruleIds: string[],
   scanOptions: AxeScanOptions,
): Promise<AxeScanResult> {
   return withLoadedPage(
      load,
      async (page) => {
         if (activeScans.has(page)) {
            throw new CliEnvironmentError(
               'browser-scan-conflict',
               'An axe scan already owns this page. Wait for it before scanning again.',
            );
         }
         activeScans.add(page);
         try {
            return await scanBrowserPage(
               page,
               {
                  ruleIds,
                  selector: scanOptions.selector,
                  exclude: scanOptions.exclude,
                  nodeThreshold: LOW_CONTENT_NODE_THRESHOLD,
                  textThreshold: LOW_CONTENT_TEXT_THRESHOLD,
               },
               scanOptions,
            );
         } finally {
            activeScans.delete(page);
         }
      },
      scanOptions,
   );
}

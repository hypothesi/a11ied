import type {
   AxeRunResult,
   PageSignal,
   RelevanceMatrix,
   TargetReference,
   WcagLevel,
} from '@a11ied/contracts';
import { listRelevantCriteria } from '@a11ied/wcag-engine';
import type { Page } from 'playwright';
import { runAxe } from '../axe/runtime.js';
import { withCurrentBrowserPage } from '../browser/current-page.js';
import {
   withLoadedPage,
   type WithBrowserPageOptions,
} from '../browser/shared-browser.js';
import { scanHtmlForPageSignals } from '../relevance/html.js';
import type { DocumentLoad } from '../targets/parse.js';
import { getAccessibilityTree, getPageHtml, getPageTitle } from '../tree/runtime.js';
import { parseWcagVersion } from '../wcag/parsing.js';
import { buildCriteriaRollup, type CheckCriterion } from './criteria-rollup.js';
import { summarizeAccessibilityTree, type CheckTreeSummary } from './tree-summary.js';

/** The result of `a1 check`: what a scanner can say about one page, and what it cannot. */
export interface PageCheck {
   axe: AxeRunResult;
   tree: CheckTreeSummary;
   relevance: {
      signals: PageSignal[];
      matrix: RelevanceMatrix;
   };
   criteria: CheckCriterion[];
}

export interface RunPageCheckInput extends WithBrowserPageOptions {
   load: DocumentLoad;
   target: TargetReference;
   metadata: Record<string, string>;
   userHints: string[];
   wcagVersion: string;
   level?: WcagLevel | undefined;
}

async function checkLoadedPage(input: RunPageCheckInput, page: Page): Promise<PageCheck> {
   const wcagVersion = parseWcagVersion(input.wcagVersion);
   const pageOptions = { page, timeoutMs: input.timeoutMs, waitFor: input.waitFor };
   const load: DocumentLoad =
      input.load.kind === 'goto' ? { kind: 'goto', url: page.url() } : input.load;

   const axe = await runAxe(load, {
      wcagVersion,
      ...(input.level ? { level: input.level } : {}),
      ...pageOptions,
   });
   const tree = await getAccessibilityTree(load, pageOptions);
   const pageTitle = await getPageTitle(load, pageOptions);
   const html = await getPageHtml(load, pageOptions);
   const pageScan = scanHtmlForPageSignals(input.target.value, html, {
      target: input.target,
      metadata: input.metadata,
      userHints: input.userHints,
   });
   const matrix = listRelevantCriteria(pageScan, { version: wcagVersion });

   return {
      axe,
      tree: summarizeAccessibilityTree(tree.nodes, pageTitle),
      relevance: { signals: pageScan.signals, matrix },
      criteria: buildCriteriaRollup({
         version: wcagVersion,
         ...(input.level ? { level: input.level } : {}),
         axe,
         relevanceStates: Object.fromEntries(
            Object.entries(matrix.assessments).map(([id, assessment]) => [
               id,
               assessment.state,
            ]),
         ),
      }),
   };
}

/** Scans one page with axe and summarizes its tree and the criteria that apply to it. */
export async function runPageCheck(input: RunPageCheckInput): Promise<PageCheck> {
   return withLoadedPage(
      input.load,
      (page) => {
         const load: DocumentLoad =
            input.load.kind === 'goto' ? { kind: 'goto', url: page.url() } : input.load;
         return withCurrentBrowserPage({
            load,
            page,
            callback: (current) => checkLoadedPage(input, current),
         });
      },
      input,
   );
}

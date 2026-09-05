import type {
   AxeRunResult,
   ApplicabilityMatrix,
   ApplicabilitySignal,
   TargetReference,
} from '@a11ied/contracts';
import { listApplicableCriteria } from '@a11ied/wcag-engine';

import { deriveApplicabilityInputFromHtml } from '../applicability/html.js';
import { runAxe } from '../axe/runtime.js';
import type { DocumentLoad } from '../targets/parse.js';
import { getAccessibilityTree, getPageTitle } from '../tree/runtime.js';
import { parseWcagVersion } from '../wcag/parsing.js';
import { buildCriteriaRollup, type AuditCriterionRollup } from './criteria-rollup.js';
import { summarizeAccessibilityTree, type AuditTreeSummary } from './tree-summary.js';

export interface AuditReport {
   axe: AxeRunResult;
   tree: AuditTreeSummary;
   applicability: {
      signals: ApplicabilitySignal[];
      matrix: ApplicabilityMatrix;
   };
   criteria: AuditCriterionRollup[];
}

export interface BuildAuditReportInput {
   load: DocumentLoad;
   readHtml: () => Promise<string>;
   target: TargetReference;
   metadata: Record<string, string>;
   userHints: string[];
   wcagVersion: string;
   timeoutMs?: number | undefined;
}

/**
 * Builds the full audit report for one target: an axe scan of every mapped rule, an
 * accessibility tree summary, signal-backed WCAG applicability, and a per-criterion
 * rollup of axe verdict, applicability, and coverage state.
 */
export async function buildAuditReport(
   input: BuildAuditReportInput,
): Promise<AuditReport> {
   const wcagVersion = parseWcagVersion(input.wcagVersion);
   const pageOptions = { timeoutMs: input.timeoutMs };

   const axe = await runAxe(input.load, { wcagVersion });
   const tree = await getAccessibilityTree(input.load, pageOptions);
   const pageTitle = await getPageTitle(input.load, pageOptions);
   const treeSummary = summarizeAccessibilityTree(tree.nodes, pageTitle);

   const html = await input.readHtml();
   const applicabilityInput = deriveApplicabilityInputFromHtml(input.target.value, html, {
      target: input.target,
      metadata: input.metadata,
      userHints: input.userHints,
   });
   const matrix = listApplicableCriteria(applicabilityInput, { version: wcagVersion });

   const applicabilityStates = Object.fromEntries(
      Object.entries(matrix.assessments).map(([id, assessment]) => [
         id,
         assessment.state,
      ]),
   );
   const criteria = buildCriteriaRollup({
      version: wcagVersion,
      axe,
      applicabilityStates,
   });

   return {
      axe,
      tree: treeSummary,
      applicability: { signals: applicabilityInput.signals, matrix },
      criteria,
   };
}

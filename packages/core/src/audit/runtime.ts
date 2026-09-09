import type {
   AxeRunResult,
   RelevanceMatrix,
   PageSignal,
   EvidenceRecord,
   TargetReference,
} from '@a11ied/contracts';
import { listRelevantCriteria } from '@a11ied/wcag-engine';

import { scanHtmlForPageSignals } from '../relevance/html.js';
import { runAxe } from '../axe/runtime.js';
import type { DocumentLoad } from '../targets/parse.js';
import { getAccessibilityTree, getPageHtml, getPageTitle } from '../tree/runtime.js';
import { parseWcagVersion } from '../wcag/parsing.js';
import { buildSubjectKey } from '../evidence/subject.js';
import { readEvidenceForSubject } from '../evidence/store.js';
import { buildCriteriaRollup, type AuditCriterionRollup } from './criteria-rollup.js';
import { summarizeAccessibilityTree, type AuditTreeSummary } from './tree-summary.js';

export interface AuditReport {
   axe: AxeRunResult;
   tree: AuditTreeSummary;
   relevance: {
      signals: PageSignal[];
      matrix: RelevanceMatrix;
   };
   criteria: AuditCriterionRollup[];
   /** Results a person or an agent recorded for this target, newest per check. */
   recorded: EvidenceRecord[];
}

export interface BuildAuditReportInput {
   load: DocumentLoad;
   readHtml: () => Promise<string>;
   target: TargetReference;
   metadata: Record<string, string>;
   userHints: string[];
   wcagVersion: string;
   timeoutMs?: number | undefined;
   /** The canonical key recorded results were stored under. */
   subject?: string | undefined;
   /** Where recorded results live. Defaults to `.a11ied/evidence.jsonl`. */
   evidenceFile?: string | undefined;
}

/**
 * Builds the full audit report for one target: an axe scan of every mapped rule, an
 * accessibility tree summary, the relevant criteria scan, a per-criterion rollup of axe
 * verdict, relevance, and test method, and any result a person or an agent recorded for
 * the checks axe cannot decide.
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

   const html = await getPageHtml(input.load, pageOptions).catch(() => input.readHtml());
   const pageScan = scanHtmlForPageSignals(input.target.value, html, {
      target: input.target,
      metadata: input.metadata,
      userHints: input.userHints,
   });
   const matrix = listRelevantCriteria(pageScan, { version: wcagVersion });

   const relevanceStates = Object.fromEntries(
      Object.entries(matrix.assessments).map(([id, assessment]) => [
         id,
         assessment.state,
      ]),
   );
   const subject =
      input.subject ??
      buildSubjectKey({
         target: input.target,
         load: input.load,
         metadata: input.metadata,
         userHints: input.userHints,
         readHtml: input.readHtml,
      });
   const recorded = await readEvidenceForSubject(subject, { file: input.evidenceFile });
   const criteria = buildCriteriaRollup({
      version: wcagVersion,
      axe,
      relevanceStates,
      recordedOutcomes: Object.fromEntries(
         recorded
            .filter((record) => record.test.kind === 'criterion')
            .map((record) => [
               record.test.kind === 'criterion' ? record.test.criterionId : '',
               record.outcome,
            ]),
      ),
   });

   return {
      axe,
      tree: treeSummary,
      relevance: { signals: pageScan.signals, matrix },
      criteria,
      recorded,
   };
}

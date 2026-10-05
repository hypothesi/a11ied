import {
   axeRunResultSchema,
   evidenceRecordSchema,
   relevanceMatrixSchema,
   pageSignalSchema,
   type AxeRunResult,
   type RelevanceMatrix,
   type PageSignal,
   type EvidenceRecord,
   type TargetReference,
   type WcagLevel,
   type WcagVersion,
} from '@a11ied/contracts';
import { z } from 'zod';
import type { Page } from 'playwright';
import { withCurrentBrowserPage } from '../browser/current-page.js';
import {
   withLoadedPage,
   type WithBrowserPageOptions,
} from '../browser/shared-browser.js';
import { listRelevantCriteria } from '@a11ied/wcag-engine';

import { scanHtmlForPageSignals } from '../relevance/html.js';
import { runAxe } from '../axe/runtime.js';
import type { DocumentLoad } from '../targets/parse.js';
import { getAccessibilityTree, getPageHtml, getPageTitle } from '../tree/runtime.js';
import { parseWcagVersion } from '../wcag/parsing.js';
import { buildSubjectKey } from '../evidence/subject.js';
import { readEvidenceForSubject } from '../evidence/store.js';
import { isVerifiedEvidence } from '../evidence/validation.js';
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

/** Validate complete saved reports before reading their findings or rebuilding coverage. */
export const auditReportSchema = z.object({
   axe: axeRunResultSchema,
   tree: z.object({
      pageTitle: z.string(),
      firstHeading: z.string().default(''),
      counts: z.object({
         landmarks: z.number().int().nonnegative(),
         headings: z.number().int().nonnegative(),
         links: z.number().int().nonnegative(),
         buttons: z.number().int().nonnegative(),
         formControls: z.number().int().nonnegative(),
      }),
      headingLevels: z.array(z.number().int()),
      roles: z.array(z.string()),
   }),
   relevance: z.object({
      signals: z.array(pageSignalSchema),
      matrix: relevanceMatrixSchema,
   }),
   criteria: z.array(
      z.object({
         id: z.string(),
         title: z.string(),
         level: z.string(),
         axeVerdict: z.enum(['fail', 'pass', 'incomplete', 'not-covered']),
         relevance: z.string(),
         testMethod: z.string(),
         evidenceMode: z.string(),
         procedureIds: z.array(z.string()),
         pending: z.boolean(),
         pendingProcedureIds: z.array(z.string()).optional(),
         recordedOutcome: z.string().optional(),
      }),
   ),
   recorded: z.array(evidenceRecordSchema),
});

function rebuildEvidenceStatus(record: EvidenceRecord): EvidenceRecord {
   if (isVerifiedEvidence(record)) {
      return record;
   }
   return {
      ...record,
      verification: {
         status: record.verification?.status === 'stale' ? 'stale' : 'unverified',
         reasons: record.verification?.reasons ?? [
            'Recorded judgment has not been verified.',
         ],
      },
   };
}

/**
 * Rebuild outcomes from the current catalog and validated records, ignoring saved verdict
 * flags.
 */
export function rebuildAuditAssessment(
   report: AuditReport,
   profile?: { wcagVersion: WcagVersion; level: WcagLevel },
): AuditReport {
   const recorded = report.recorded.map(rebuildEvidenceStatus);
   return {
      ...report,
      recorded,
      criteria: buildCriteriaRollup({
         version: profile?.wcagVersion ?? report.axe.wcagVersion,
         level:
            profile?.level ??
            (report.axe.selection.kind === 'level' ? report.axe.selection.level : 'AAA'),
         axe: report.axe,
         relevanceStates: Object.fromEntries(
            Object.entries(report.relevance.matrix.assessments).map(
               ([id, assessment]) => [id, assessment.state],
            ),
         ),
         recorded,
      }),
   };
}

export interface BuildAuditReportInput extends WithBrowserPageOptions {
   load: DocumentLoad;
   readHtml: () => Promise<string>;
   target: TargetReference;
   metadata: Record<string, string>;
   userHints: string[];
   wcagVersion: string;
   level?: WcagLevel | undefined;
   /** The canonical key recorded results were stored under. */
   subject?: string | undefined;
   /** Where recorded results live. Defaults to `.a11ied/evidence.jsonl`. */
   evidenceFile?: string | undefined;
}

async function buildReportFromPage(
   input: BuildAuditReportInput,
   page: Page,
): Promise<AuditReport> {
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
   const treeSummary = summarizeAccessibilityTree(tree.nodes, pageTitle);

   const html = await getPageHtml(load, pageOptions);
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
      ...(input.level ? { level: input.level } : {}),
      axe,
      relevanceStates,
      recorded,
   });

   return {
      axe,
      tree: treeSummary,
      relevance: { signals: pageScan.signals, matrix },
      criteria,
      recorded,
   };
}

/** Combines automated checks with recorded procedure evidence for one target. */
export async function buildAuditReport(
   input: BuildAuditReportInput,
): Promise<AuditReport> {
   return withLoadedPage(
      input.load,
      (page) => {
         const load: DocumentLoad =
            input.load.kind === 'goto' ? { kind: 'goto', url: page.url() } : input.load;
         return withCurrentBrowserPage({
            load,
            page,
            callback: (current) => buildReportFromPage(input, current),
         });
      },
      input,
   );
}

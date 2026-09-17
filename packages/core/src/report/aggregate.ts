import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
   cliOutputEnvelopeSchema,
   reportModelSchema,
   type EarlProfile,
   type EarlReport,
   type ReportCriterion,
   type ReportFinding,
   type ReportModel,
   type ReportOutcome,
   type ReportPage,
   type SiteInventory,
   type ViolationCounts,
} from '@a11ied/contracts';
import { buildEarlReport } from '@a11ied/earl';
import { getAxeRule, WcagEngineNotFoundError } from '@a11ied/wcag-engine';

import { buildPageEarlAssertions } from '../audit/earl.js';
import type { AuditReport } from '../audit/runtime.js';
import { buildA11iedAssertor } from '../axe/earl.js';

export interface LoadedPageAudit {
   pageId: string;
   report?: AuditReport | undefined;
   error?: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuditReport(value: unknown): value is AuditReport {
   return (
      isRecord(value) &&
      isRecord(value.axe) &&
      Array.isArray(value.axe.violations) &&
      Array.isArray(value.axe.passes) &&
      Array.isArray(value.criteria) &&
      Array.isArray(value.recorded)
   );
}

/** Loads the CLI JSON envelope for every page that should have an audit result. */
export async function loadPageAuditReports(
   inventory: SiteInventory,
   resultsDir: string,
): Promise<LoadedPageAudit[]> {
   return Promise.all(
      inventory.pages
         .filter((page) => page.auditStatus === 'audited' || page.auditStatus === 'error')
         .map(async (page): Promise<LoadedPageAudit> => {
            const path = resolve(resultsDir, page.pageId, 'audit.json');
            try {
               const envelope = cliOutputEnvelopeSchema.parse(
                  JSON.parse(await readFile(path, 'utf8')),
               );
               if (!isAuditReport(envelope.result)) {
                  return {
                     pageId: page.pageId,
                     error: 'The audit file has no valid audit result.',
                  };
               }
               return { pageId: page.pageId, report: envelope.result };
            } catch (error) {
               return {
                  pageId: page.pageId,
                  error: error instanceof Error ? error.message : String(error),
               };
            }
         }),
   );
}

function emptyViolationCounts(): ViolationCounts {
   return { minor: 0, moderate: 0, serious: 0, critical: 0 };
}

function resolveOutcome(criterion: AuditReport['criteria'][number]): ReportOutcome {
   if (criterion.axeVerdict === 'fail' || criterion.recordedOutcome === 'failed') {
      return 'failed';
   }
   if (criterion.recordedOutcome === 'passed') {
      return 'passed';
   }
   if (criterion.recordedOutcome === 'inapplicable') {
      return 'inapplicable';
   }
   if (criterion.recordedOutcome === 'cantTell' || criterion.pending) {
      return 'cantTell';
   }
   if (criterion.axeVerdict === 'pass') {
      return 'passed';
   }
   return criterion.relevance === 'out-of-scope' ? 'inapplicable' : 'notTested';
}

function buildCriteria(report: AuditReport): ReportCriterion[] {
   return report.criteria.map((criterion) => ({
      criterionId: criterion.id,
      title: criterion.title,
      level: criterion.level,
      outcome: resolveOutcome(criterion),
      testMethod:
         criterion.testMethod === 'automated' ||
         criterion.testMethod === 'hybrid' ||
         criterion.testMethod === 'manual'
            ? criterion.testMethod
            : 'unknown',
   }));
}

function listCriterionIds(ruleId: string, version: string): string[] {
   try {
      return getAxeRule(ruleId, { version }).rule.criterionIds;
   } catch (error) {
      if (error instanceof WcagEngineNotFoundError) {
         return [];
      }
      throw error;
   }
}

function buildFindings(report: AuditReport): ReportFinding[] {
   return report.axe.violations.map((rule) => ({
      ruleId: rule.id,
      impact: rule.impact ?? 'minor',
      description: rule.description,
      guidance:
         rule.nodes
            .map((node) => node.failureSummary)
            .filter(Boolean)
            .join(' ') || rule.help,
      helpUrl: rule.helpUrl,
      criterionIds: listCriterionIds(rule.id, report.axe.wcagVersion),
      selectors: rule.nodes.flatMap((node) => node.target),
   }));
}

function countViolations(report: AuditReport): ViolationCounts {
   const counts = emptyViolationCounts();
   for (const violation of report.axe.violations) {
      counts[violation.impact ?? 'minor'] += 1;
   }
   return counts;
}

function buildReportPage(
   page: SiteInventory['pages'][number],
   loaded: LoadedPageAudit | undefined,
): ReportPage {
   const report = loaded?.report;
   return {
      pageId: page.pageId,
      url: page.finalUrl,
      ...(page.title ? { title: page.title } : {}),
      status: page.status,
      ...(page.templateId ? { templateId: page.templateId } : {}),
      auditStatus: page.auditStatus,
      criteria: report ? buildCriteria(report) : [],
      findings: report ? buildFindings(report) : [],
      violationCounts: report ? countViolations(report) : emptyViolationCounts(),
      ...(loaded?.error || page.error
         ? { error: loaded?.error ?? page.error?.message }
         : {}),
   };
}

function incrementOutcomeTotals(
   totals: ReportModel['totals']['outcomes'],
   outcome: ReportOutcome,
): void {
   totals[outcome] += 1;
}

function accumulatePageTotals(
   pages: ReportPage[],
   outcomes: ReportModel['totals']['outcomes'],
   violations: ViolationCounts,
): void {
   for (const page of pages) {
      for (const criterion of page.criteria) {
         incrementOutcomeTotals(outcomes, criterion.outcome);
      }
      for (const impact of ['minor', 'moderate', 'serious', 'critical'] as const) {
         violations[impact] += page.violationCounts[impact];
      }
   }
}

function buildTemplateSummaries(inventory: SiteInventory): ReportModel['templates'] {
   return inventory.templates.map((template) => ({
      templateId: template.templateId,
      representativePageId: template.representativePageId,
      auditedPageIds: template.memberPageIds.filter(
         (pageId) =>
            inventory.pages.find((page) => page.pageId === pageId)?.auditStatus ===
            'audited',
      ),
      notTestedPageIds: template.memberPageIds.filter(
         (pageId) =>
            inventory.pages.find((page) => page.pageId === pageId)?.auditStatus ===
            'not-tested',
      ),
   }));
}

function parseReportModel(input: {
   inventory: SiteInventory;
   outcomes: ReportModel['totals']['outcomes'];
   pageReports: LoadedPageAudit[];
   pages: ReportPage[];
   title: string;
   violations: ViolationCounts;
}): ReportModel {
   const { inventory, outcomes, pageReports, pages, title, violations } = input;
   return reportModelSchema.parse({
      version: '1',
      title,
      generatedAt: new Date().toISOString(),
      startUrl: inventory.startUrl,
      scope: inventory.run.scope,
      discovery: {
         complete: inventory.discovery.complete,
         gaps: [
            ...(inventory.discovery.truncatedReason
               ? [inventory.discovery.truncatedReason]
               : []),
            ...inventory.discovery.failures.map(
               (failure) => `${failure.source}: ${failure.message}`,
            ),
         ],
         discoveredPages: inventory.pages.filter((page) => !page.isDuplicateOf).length,
         auditedPages: inventory.pages.filter((page) => page.auditStatus === 'audited')
            .length,
      },
      methodology: {
         automated: true,
         hybrid: pages.some((page) =>
            page.criteria.some((criterion) => criterion.testMethod === 'hybrid'),
         ),
         manual: pages.some((page) =>
            page.criteria.some((criterion) => criterion.testMethod === 'manual'),
         ),
         statement:
            'Automated results cover only checks the tools can decide. A passing automated check is not a WCAG compliance claim.',
      },
      totals: { outcomes, violations },
      templates: buildTemplateSummaries(inventory),
      pages,
      warnings: pageReports.flatMap((entry) =>
         entry.error ? [`${entry.pageId}: ${entry.error}`] : [],
      ),
   });
}

/** Builds the complete render model from one inventory and its page audit results. */
export function buildReportModel(
   inventory: SiteInventory,
   pageReports: LoadedPageAudit[],
   title = 'Accessibility audit report',
): ReportModel {
   const loadedByPage = new Map(pageReports.map((entry) => [entry.pageId, entry]));
   const outcomes: ReportModel['totals']['outcomes'] = {
         passed: 0,
         failed: 0,
         cantTell: 0,
         notTested: 0,
         inapplicable: 0,
      },
      pages = inventory.pages.map((page) =>
         buildReportPage(page, loadedByPage.get(page.pageId)),
      ),
      violations = emptyViolationCounts();
   accumulatePageTotals(pages, outcomes, violations);

   return parseReportModel({
      inventory,
      outcomes,
      pageReports,
      pages,
      title,
      violations,
   });
}

/** Merges every page's assertions into one EARL JSON-LD report. */
export function buildAggregateEarlReport(
   pageReports: LoadedPageAudit[],
   options: { profile: EarlProfile; version: string },
): EarlReport {
   return buildEarlReport({
      assertions: pageReports.flatMap((entry) =>
         entry.report ? buildPageEarlAssertions(entry.report, options.profile) : [],
      ),
      assertor: buildA11iedAssertor(options.version),
   });
}

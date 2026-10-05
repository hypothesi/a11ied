import {
   reportModelSchema,
   type EarlProfile,
   type EarlReport,
   type EvidenceRecord,
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

import {
   buildPageEarlAssertions,
   buildRecordedEarlAssertions,
   buildCriterionEarlAssertions,
} from '../audit/earl.js';
import {
   getCriterionOutcome,
   type AuditCriterionRollup,
} from '../audit/criteria-rollup.js';
import { rebuildAuditAssessment, type AuditReport } from '../audit/runtime.js';
import { buildA11iedAssertor } from '../axe/earl.js';
import { isVerifiedEvidence } from '../evidence/validation.js';

import type { LoadedPageAudit } from './loaded-audits.js';
export { loadPageAuditReports, type LoadedPageAudit } from './loaded-audits.js';

function emptyViolationCounts(): ViolationCounts {
   return { minor: 0, moderate: 0, serious: 0, critical: 0 };
}

function buildCriteria(criteria: AuditCriterionRollup[]): ReportCriterion[] {
   return criteria.map((criterion) => ({
      criterionId: criterion.id,
      title: criterion.title,
      level: criterion.level,
      outcome: getCriterionOutcome(criterion),
      pending: criterion.pending,
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
      source: 'axe',
      impact: rule.impact ?? 'unknown',
      description: rule.description,
      guidance:
         rule.nodes
            .map((node) => node.failureSummary)
            .filter(Boolean)
            .join('\n\n') || rule.help,
      helpUrl: rule.helpUrl,
      criterionIds: listCriterionIds(rule.id, report.axe.wcagVersion),
      selectors: rule.nodes.flatMap((node) => node.target),
      reproduction: [],
      artifactLinks: [],
   }));
}

function buildBehavioralFindings(records: EvidenceRecord[]): ReportFinding[] {
   return records
      .filter((record) => isVerifiedEvidence(record) && record.outcome === 'failed')
      .map((record) => ({
         title:
            record.finding?.title ??
            (record.test.kind === 'criterion'
               ? `WCAG ${record.test.criterionId}: ${record.test.procedureId}`
               : `${record.test.exampleId}: ${record.test.rowKey}`),
         source: 'behavioral',
         impact: record.finding?.impact ?? 'unknown',
         description:
            record.finding?.userImpact ??
            record.note ??
            record.provenance?.rationale ??
            '',
         guidance: record.finding?.remediation ?? '',
         criterionIds: record.test.kind === 'criterion' ? [record.test.criterionId] : [],
         selectors: record.pointer ? [record.pointer] : [],
         evidence: record,
         reproduction: [],
         artifactLinks: [],
      }));
}

function countViolations(report: AuditReport): ViolationCounts {
   const counts = emptyViolationCounts();
   for (const violation of report.axe.violations) {
      if (violation.impact) {
         counts[violation.impact] += 1;
      }
   }
   return counts;
}

function getReportPageStatus(
   page: SiteInventory['pages'][number],
   loaded: LoadedPageAudit | undefined,
): ReportPage['auditStatus'] {
   if (page.auditStatus !== 'audited') {
      return page.auditStatus;
   }
   if (!loaded?.report || loaded.error) {
      return 'error';
   }
   return loaded.report.criteria.some(
      (criterion) => criterion.pending || getCriterionOutcome(criterion) === 'notTested',
   )
      ? 'in-progress'
      : 'audited';
}

function buildPageAssessment(
   loaded: LoadedPageAudit | undefined,
): Pick<ReportPage, 'criteria' | 'recorded' | 'findings' | 'violationCounts'> {
   const report = loaded?.report;
   const recorded = loaded?.recorded ?? report?.recorded ?? [];
   return {
      criteria: buildCriteria(report?.criteria ?? loaded?.criteria ?? []),
      recorded,
      findings: [
         ...(report ? buildFindings(report) : []),
         ...buildBehavioralFindings(recorded),
      ],
      violationCounts: report ? countViolations(report) : emptyViolationCounts(),
   };
}

function buildReportPage(
   page: SiteInventory['pages'][number],
   loaded: LoadedPageAudit | undefined,
): ReportPage {
   const hasAuditResult = !page.isDuplicateOf && page.auditStatus !== 'skipped-duplicate';
   const assessment = buildPageAssessment(hasAuditResult ? loaded : undefined);
   return {
      pageId: page.pageId,
      url: page.finalUrl,
      ...(page.title ? { title: page.title } : {}),
      status: page.status,
      ...(page.templateId ? { templateId: page.templateId } : {}),
      auditStatus: getReportPageStatus(page, loaded),
      ...assessment,
      ...(loaded?.error || page.error
         ? { error: page.error?.message ?? loaded?.error }
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

function buildTemplateSummaries(
   inventory: SiteInventory,
   pages: ReportPage[],
): ReportModel['templates'] {
   return inventory.templates.map((template) => ({
      templateId: template.templateId,
      representativePageId: template.representativePageId,
      auditedPageIds: template.memberPageIds.filter(
         (pageId) =>
            pages.find((page) => page.pageId === pageId)?.auditStatus === 'audited',
      ),
      notTestedPageIds: template.memberPageIds.filter(
         (pageId) =>
            pages.find((page) => page.pageId === pageId)?.auditStatus === 'not-tested',
      ),
   }));
}

function listReportWarnings(entry: LoadedPageAudit): string[] {
   const warnings = entry.error ? [`${entry.pageId}: ${entry.error}`] : [];
   for (const record of entry.report?.recorded ?? entry.recorded ?? []) {
      if (!isVerifiedEvidence(record)) {
         warnings.push(
            `${entry.pageId}: ${record.verification?.reasons.join(' ') ?? 'Recorded judgment has not been verified.'}`,
         );
      }
   }
   return warnings;
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
         scannedPages: pageReports.filter(
            (entry) =>
               entry.report &&
               pages.some(
                  (page) =>
                     page.pageId === entry.pageId &&
                     page.auditStatus !== 'skipped-duplicate',
               ),
         ).length,
         auditedPages: pages.filter((page) => page.auditStatus === 'audited').length,
      },
      methodology: {
         automated: pageReports.some((entry) => entry.report !== undefined),
         hybrid: pages.some((page) =>
            page.recorded.some(
               (record) => isVerifiedEvidence(record) && record.mode === 'semiAutomatic',
            ),
         ),
         manual: pages.some((page) =>
            page.recorded.some(
               (record) => isVerifiedEvidence(record) && record.mode === 'manual',
            ),
         ),
         statement:
            'Automated results cover only checks the tools can decide. A passing automated check is not a WCAG compliance claim.',
      },
      totals: { outcomes, violations },
      templates: buildTemplateSummaries(inventory, pages),
      pages,
      warnings: pageReports.flatMap((entry) => listReportWarnings(entry)),
   });
}

/** Builds the complete render model from one inventory and its page audit results. */
export function buildReportModel(
   inventory: SiteInventory,
   pageReports: LoadedPageAudit[],
   title = 'Accessibility audit report',
): ReportModel {
   const currentReports = pageReports.map((entry) =>
      entry.report
         ? {
              ...entry,
              report: rebuildAuditAssessment(
                 entry.report,
                 entry.assessmentProfile ?? inventory.run.profile,
              ),
           }
         : entry,
   );
   const loadedByPage = new Map(currentReports.map((entry) => [entry.pageId, entry]));
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
      pageReports: currentReports,
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
         entry.report
            ? buildPageEarlAssertions(
                 entry.report,
                 options.profile,
                 entry.assessmentProfile,
              )
            : [
                 ...buildRecordedEarlAssertions(
                    entry.recorded ?? [],
                    entry.assessmentProfile?.wcagVersion ?? '2.2',
                 ),
                 ...buildCriterionEarlAssertions({
                    criteria: entry.criteria ?? [],
                    subject: entry.subject ?? entry.pageId,
                    wcagVersion: entry.assessmentProfile?.wcagVersion ?? '2.2',
                 }),
              ],
      ),
      assertor: buildA11iedAssertor(options.version),
   });
}

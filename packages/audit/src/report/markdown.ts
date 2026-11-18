import type { AuditReport, ReportFinding } from './model.js';
import {
   describeScope,
   describeStandard,
   describeVerdict,
   formatDate,
   METHOD_PARAGRAPHS,
   SEVERITY_LABELS,
   STANDING_LABELS,
   describeCriteria,
   describeSource,
   groupExclusions,
   type ExclusionGroup,
} from './wording.js';

function cell(text: string): string {
   return text.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');
}

function renderSummaryTable(report: AuditReport): string[] {
   const { findings, criteria } = report.status;
   return [
      '| Findings | Critical | Serious | Moderate | Minor |',
      '| --- | --- | --- | --- | --- |',
      `| ${String(findings.total)} | ${String(findings.critical)} | ${String(findings.serious)} | ${String(findings.moderate)} | ${String(findings.minor)} |`,
      '',
      '| Criteria | Fail | Pass | Not applicable | Not verified or unfinished |',
      '| --- | --- | --- | --- | --- |',
      `| ${String(criteria.total)} | ${String(criteria.fail)} | ${String(criteria.pass)} | ${String(criteria['not-applicable'])} | ${String(criteria['cannot-tell'] + criteria.pending + criteria['not-evaluated'])} |`,
   ];
}

function renderPriorityTable(findings: readonly ReportFinding[]): string[] {
   if (findings.length === 0) {
      return ['No findings.'];
   }
   return [
      '| ID | Issue | Severity | WCAG | Affected |',
      '| --- | --- | --- | --- | --- |',
      ...findings.map(
         (finding) =>
            `| ${finding.id} | ${cell(finding.title)} | ${SEVERITY_LABELS[finding.severity]} | ${cell(describeCriteria(finding))} | ${String(finding.pageCount)} |`,
      ),
   ];
}

function renderFinding(finding: ReportFinding): string[] {
   return [
      `### ${finding.id}: ${finding.title}`,
      '',
      `${SEVERITY_LABELS[finding.severity]} | [${finding.criterion.id} ${finding.criterion.title}](${finding.criterion.url}) (Level ${finding.criterion.level}) | ${describeSource(finding.source)}`,
      '',
      ...(finding.alsoFails.length > 0
         ? [
              `Also fails: ${finding.alsoFails.map((each) => `${each.id} ${each.title}`).join(', ')}`,
              '',
           ]
         : []),
      `**Problem:** ${finding.description}`,
      '',
      `**Impact:** ${finding.impact}`,
      '',
      `**Fix:** ${finding.recommendation}`,
      '',
      '**Where:**',
      '',
      ...finding.occurrences.map((occurrence) => {
         const detail = occurrence.detail === '' ? '' : ` (${occurrence.detail})`;
         const evidence =
            occurrence.evidence.length === 0
               ? ''
               : ` Evidence: ${occurrence.evidence.join(', ')}`;
         return `* ${occurrence.pageName}: ${occurrence.location}${detail}${evidence}`;
      }),
      '',
   ];
}

function renderCriteria(report: AuditReport): string[] {
   return [
      '| Criterion | Level | Result | Findings |',
      '| --- | --- | --- | --- |',
      ...report.criteria.map(
         (criterion) =>
            `| ${criterion.info.id} ${cell(criterion.info.title)} | ${criterion.info.level} | ${STANDING_LABELS[criterion.standing]} | ${criterion.findingIds.join(', ')} |`,
      ),
   ];
}

function renderGaps(report: AuditReport): string[] {
   if (report.gaps.length === 0) {
      return [];
   }
   return [
      '## Not verified',
      '',
      ...report.gaps.map((gap) => {
         const criterion = gap.criterion === undefined ? '' : `${gap.criterion}, `;
         return `* ${criterion}${gap.pageName}: ${gap.reason}`;
      }),
      '',
   ];
}

function renderExclusionGroup(group: ExclusionGroup): string[] {
   const names = group.names.map((name) => `* ${name}`);
   return [`Excluded (${String(names.length)}): ${group.reason}`, '', ...names, ''];
}

function renderScope(report: AuditReport): string[] {
   return [
      '## Scope and method',
      '',
      '| ID | Page or screen | Location | States tested | Findings |',
      '| --- | --- | --- | --- | --- |',
      ...report.pages.map(
         (page) =>
            `| ${page.id} | ${cell(page.name)} | ${cell(page.locator)} | ${cell(page.statesTested.join(', ') || 'As loaded')} | ${String(page.findingCount)} |`,
      ),
      '',
      ...groupExclusions(report).flatMap((group) => renderExclusionGroup(group)),
      ...METHOD_PARAGRAPHS.flatMap((paragraph) => [paragraph, '']),
   ];
}

/** Renders the audit report as Markdown. */
export function renderMarkdownReport(report: AuditReport): string {
   return `${[
      `# Accessibility audit: ${report.config.name}`,
      '',
      `* Target: ${report.config.target}`,
      `* Standard: ${describeStandard(report)}`,
      `* Scope: ${describeScope(report)}`,
      `* Report date: ${formatDate(report.generatedAt)}`,
      `* Status: ${report.final ? 'Final' : `Interim, ${String(report.status.units.percentDone)}% of checks complete`}`,
      '',
      '## Summary',
      '',
      describeVerdict(report),
      '',
      ...renderSummaryTable(report),
      '',
      '## What to fix first',
      '',
      ...renderPriorityTable(report.findings),
      '',
      '## Findings',
      '',
      ...report.findings.flatMap(renderFinding),
      '## Results by success criterion',
      '',
      ...renderCriteria(report),
      '',
      ...renderGaps(report),
      ...renderScope(report),
   ]
      .join('\n')
      .trimEnd()}\n`;
}

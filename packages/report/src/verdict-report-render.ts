import type { EvidenceRecord } from '@a11ied/contracts';
import { join, resolve } from 'node:path';
import { writeAtomic } from '@a11ied/observe';
import type {
   VerdictAuditReport,
   RemediationRoadmapItem,
   VpatCriterionRow,
   MethodologyDisclosure,
} from './verdict-report.js';

function escapeHtml(value: string | number): string {
   return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
}

function renderHtmlExecutiveSummary(report: VerdictAuditReport): string {
   const exec = report.executiveSummary;
   return `<section id="executive-summary" aria-labelledby="exec-heading"><h2 id="exec-heading">Executive Summary</h2><p class="headline">${escapeHtml(exec.headline)}</p><p>${escapeHtml(exec.scopeStatement)}</p><dl class="summary-stats"><div><dt>Overall Conformance</dt><dd>${escapeHtml(exec.overallConformance)}</dd></div><div><dt>Total States</dt><dd>${exec.totalStates}</dd></div><div><dt>Criteria with results</dt><dd>${exec.evaluatedCriteriaCount}</dd></div><div><dt>Failing Criteria</dt><dd>${exec.failingCriteriaCount}</dd></div><div><dt>Needs Review Criteria</dt><dd>${exec.needsReviewCriteriaCount}</dd></div></dl><h3>Findings by Severity</h3><dl class="impact-breakdown"><div><dt>Critical</dt><dd>${exec.criticalFindingsCount}</dd></div><div><dt>Serious</dt><dd>${exec.seriousFindingsCount}</dd></div><div><dt>Moderate</dt><dd>${exec.moderateFindingsCount}</dd></div><div><dt>Minor</dt><dd>${exec.minorFindingsCount}</dd></div></dl></section>`;
}

function renderHtmlRoadmap(roadmap: readonly RemediationRoadmapItem[]): string {
   if (roadmap.length === 0) {
      return '<section id="remediation-roadmap" aria-labelledby="roadmap-heading"><h2 id="roadmap-heading">Prioritized Component Remediation Roadmap</h2><p>No component remediation items.</p></section>';
   }

   const rows = roadmap
      .map((item) => {
         const reproHtml =
            item.repro.length > 0
               ? `<ol class="repro-list">${item.repro.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
               : '<p class="none">None recorded</p>';
         const measurementsHtml = item.measurementsSummary
            ? `<p class="measurements"><strong>Measurements:</strong> ${escapeHtml(item.measurementsSummary)}</p>`
            : '';

         return `<article class="roadmap-item impact-${item.impact}"><div class="roadmap-header"><span class="impact-tag tag-${item.impact}">${escapeHtml(item.impact.toUpperCase())}</span><span class="criterion-tag">WCAG ${escapeHtml(item.criterionId)}</span><span class="template-tag">Template: ${escapeHtml(item.templateGroupId)}</span></div><p class="rationale"><strong>Rationale:</strong> ${escapeHtml(item.rationale)}</p>${measurementsHtml}<div class="affected-states"><strong>Affected States:</strong> ${escapeHtml(item.affectedStateIds.join(', '))}</div><div class="repro-steps"><strong>Repro Steps:</strong>${reproHtml}</div></article>`;
      })
      .join('');

   return `<section id="remediation-roadmap" aria-labelledby="roadmap-heading"><h2 id="roadmap-heading">Prioritized Component Remediation Roadmap</h2><div class="roadmap-list">${rows}</div></section>`;
}

function renderHtmlVpatTable(vpatTable: readonly VpatCriterionRow[]): string {
   const rows = vpatTable
      .map(
         (row) =>
            `<tr><th scope="row">${escapeHtml(row.criterionId)}</th><td>Level ${escapeHtml(row.level)}</td><td class="conformance-${row.conformance.toLowerCase().replaceAll(/\s+/g, '-')}">${escapeHtml(row.conformance)}</td><td>${escapeHtml(row.remarks)}</td></tr>`,
      )
      .join('');

   return `<section id="vpat-table" aria-labelledby="vpat-heading"><h2 id="vpat-heading">WCAG 2.2 Level A &amp; AA Conformance Table (VPAT / ACR)</h2><table class="vpat-table"><thead><tr><th scope="col">Criterion</th><th scope="col">Level</th><th scope="col">Conformance Level</th><th scope="col">Remarks and Explanations</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderHtmlDisclosures(methodology: MethodologyDisclosure): string {
   const { tierCounts, assistiveTechnology, templateGroups, scopeExclusions } =
      methodology;

   const exclusionsHtml =
      scopeExclusions.length === 0
         ? '<p>No scope exclusions applied.</p>'
         : `<ul>${scopeExclusions.map((rule) => `<li><strong>${escapeHtml(rule.ruleId)}:</strong> ${escapeHtml(rule.reason)}</li>`).join('')}</ul>`;

   const groupsHtml =
      templateGroups.length === 0
         ? '<p>No template groups defined.</p>'
         : `<ul>${templateGroups.map((group) => `<li><strong>${escapeHtml(group.templateGroupId)}:</strong> Representative <code>${escapeHtml(group.representativeStateId)}</code>, Members: ${escapeHtml(group.memberStateIds.join(', ') || 'none')}</li>`).join('')}</ul>`;

   return `<section id="partial-conformance" aria-labelledby="conformance-scope-heading"><h2 id="conformance-scope-heading">Statement of Partial/Scoped Conformance &amp; Template groups</h2><h3>Scope Exclusions</h3>${exclusionsHtml}<h3>Template groups</h3>${groupsHtml}</section><section id="methodology-disclosure" aria-labelledby="methodology-heading"><h2 id="methodology-heading">Methodology &amp; Assistive Technology Disclosure</h2><p class="at-statement">${escapeHtml(assistiveTechnology.statement)}</p><dl class="methodology-stats"><div><dt>Tier 0 (Deterministic Axe/ACT)</dt><dd>${tierCounts.tier0}</dd></div><div><dt>Tier 1 (Programmatic Probes)</dt><dd>${tierCounts.tier1}</dd></div><div><dt>Tier 2 (Advisory / Semantic Review)</dt><dd>${tierCounts.tier2}</dd></div><div><dt>Tier 3 (Native Screen Reader / AT)</dt><dd>${tierCounts.tier3}</dd></div><div><dt>Virtual Screen Reader (virtual-dom)</dt><dd>${assistiveTechnology.virtualDomCount}</dd></div><div><dt>Native AT (VoiceOver / NVDA)</dt><dd>${assistiveTechnology.nativeSrCount}</dd></div></dl></section>`;
}

const CSS_STYLES =
   'body{font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;margin:0;padding:1.5rem}' +
   'main{max-width:1200px;margin:0 auto}header{border-bottom:2px solid #e0e0e0;padding-bottom:1rem;margin-bottom:1.5rem}' +
   '.meta{color:#555}.headline{font-size:1.15rem;font-weight:bold;margin:1rem 0}' +
   '.summary-stats,.impact-breakdown,.methodology-stats{display:flex;flex-wrap:wrap;gap:0.75rem;padding:0;list-style:none}' +
   '.summary-stats div,.impact-breakdown div,.methodology-stats div{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:4px;padding:0.5rem 1rem;min-width:140px}' +
   'dt{font-size:0.8rem;color:#666;text-transform:uppercase}dd{margin:0;font-size:1.25rem;font-weight:bold}' +
   'table.vpat-table{width:100%;border-collapse:collapse;margin:1rem 0}' +
   'table.vpat-table th,table.vpat-table td{border:1px solid #e0e0e0;padding:0.6rem;text-align:left}' +
   'table.vpat-table th{background:#f1f3f5}' +
   '.roadmap-item{border:1px solid #e0e0e0;border-left-width:5px;border-radius:4px;padding:0.75rem;margin-bottom:0.75rem;background:#fafafa}' +
   '.roadmap-item.impact-critical{border-left-color:#b71c1c}.roadmap-item.impact-serious{border-left-color:#e65100}' +
   '.roadmap-item.impact-moderate{border-left-color:#f57f17}.roadmap-item.impact-minor{border-left-color:#0277bd}' +
   '.roadmap-header{display:flex;gap:0.5rem;margin-bottom:0.5rem;font-weight:bold}' +
   '.impact-tag{padding:0.15rem 0.4rem;border-radius:3px;color:#fff;font-size:0.75rem;background:#555}' +
   '.at-statement{background:#e3f2fd;border-left:4px solid #1976d2;padding:0.75rem;margin:1rem 0}';

function listScopedRecordDetails(record: EvidenceRecord): string[] {
   const details = [
      `Evidence ${record.evidenceId}: ${record.finding?.title ?? record.provenance?.rationale ?? ''}`,
   ];
   if (record.finding) {
      details.push(`User impact: ${record.finding.userImpact}`);
      if (record.finding.remediation) {
         details.push(`Remediation: ${record.finding.remediation}`);
      }
   }
   details.push(
      ...(record.assessment?.actions.map(
         (action) => `Action ${action.index}: ${action.outcome}. ${action.observation}`,
      ) ?? []),
   );
   return details;
}

function listScopedAssessmentDetails(report: VerdictAuditReport): string[] {
   const coordinator = report.coordinator;
   if (!coordinator) {
      return [];
   }
   const details = [coordinator.coverageStatement];
   for (const unit of coordinator.obligations) {
      const records = coordinator.records.filter((record) =>
         unit.evidenceIds.includes(record.evidenceId ?? ''),
      );
      details.push(
         `WCAG ${unit.criterionId} ${unit.scope} ${unit.journeyId ?? unit.environmentId ?? 'missing context'}: ${unit.outcome}; ${unit.complete ? 'complete' : 'unresolved'}. Participating states: ${unit.stateIds.join(', ')}.`,
         ...unit.reasons,
      );
      for (const record of records) {
         details.push(...listScopedRecordDetails(record));
      }
   }
   return details;
}

function renderHtmlScopedAssessments(report: VerdictAuditReport): string {
   const details = listScopedAssessmentDetails(report);
   if (details.length === 0) {
      return '';
   }
   return `<section aria-labelledby="scoped-assessments"><h2 id="scoped-assessments">Site and journey assessments</h2>${details.map((detail) => `<p>${escapeHtml(detail)}</p>`).join('')}</section>`;
}

export function renderVerdictAuditHtml(report: VerdictAuditReport): string {
   return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Accessibility Conformance Report (VPAT / ACR) - ${escapeHtml(report.targetOrigin)}</title><style>${CSS_STYLES}</style></head><body><header><h1>Accessibility Conformance Report (WCAG 2.2 VPAT / ACR)</h1><p class="meta">Target Origin: <strong>${escapeHtml(report.targetOrigin)}</strong> | Generated: ${escapeHtml(report.generatedAt)} | Status: <strong>${report.isDraft ? 'Draft' : 'Final'}</strong></p></header><main>${renderHtmlExecutiveSummary(report)}${renderHtmlRoadmap(report.remediationRoadmap)}${renderHtmlVpatTable(report.vpatTable)}${renderHtmlScopedAssessments(report)}${renderHtmlDisclosures(report.methodologyDisclosure)}</main></body></html>`;
}

function renderMarkdownExecutiveSummary(report: VerdictAuditReport): string {
   const exec = report.executiveSummary;
   return `## Executive Summary\n\n**Headline:** ${exec.headline}\n\n${exec.scopeStatement}\n\n- **Overall Conformance:** ${exec.overallConformance}\n- **Listed states:** ${exec.totalStates}\n- **Criteria with results:** ${exec.evaluatedCriteriaCount}\n- **Failing Criteria:** ${exec.failingCriteriaCount}\n- **Criteria Needing Review:** ${exec.needsReviewCriteriaCount}\n\n### Findings by Severity Impact\n- **Critical:** ${exec.criticalFindingsCount}\n- **Serious:** ${exec.seriousFindingsCount}\n- **Moderate:** ${exec.moderateFindingsCount}\n- **Minor:** ${exec.minorFindingsCount}\n`;
}

function renderMarkdownRoadmap(roadmap: readonly RemediationRoadmapItem[]): string {
   if (roadmap.length === 0) {
      return '## Prioritized Component Remediation Roadmap\n\nNo component remediation items.\n';
   }

   const items = roadmap
      .map((item, itemIndex) => {
         const reproList =
            item.repro.length > 0
               ? item.repro
                    .map((step, stepIndex) => `   ${stepIndex + 1}. ${step}`)
                    .join('\n')
               : '   - None recorded';
         const measurements = item.measurementsSummary
            ? `\n- **Measurements:** ${item.measurementsSummary}`
            : '';

         return `### ${itemIndex + 1}. [${item.impact.toUpperCase()}] WCAG ${item.criterionId} (Template: ${item.templateGroupId})\n- **Impact:** ${item.impact}\n- **Template Group:** ${item.templateGroupId}\n- **Affected States (${item.affectedStateIds.length}):** ${item.affectedStateIds.join(', ')}\n- **Rationale:** ${item.rationale}${measurements}\n- **Reproduction Steps:**\n${reproList}`;
      })
      .join('\n\n');

   return `## Prioritized Component Remediation Roadmap\n\n${items}\n`;
}

function renderMarkdownVpatTable(vpatTable: readonly VpatCriterionRow[]): string {
   const rows = vpatTable
      .map(
         (row) =>
            `| ${row.criterionId} | Level ${row.level} | ${row.conformance} | ${row.remarks.replaceAll('|', String.raw`\|`)} |`,
      )
      .join('\n');

   return `## WCAG 2.2 Level A & AA Conformance Table (VPAT / ACR)\n\n| Criterion | Level | Conformance | Remarks |\n| --- | --- | --- | --- |\n${rows}\n`;
}

function renderMarkdownDisclosures(methodology: MethodologyDisclosure): string {
   const { tierCounts, assistiveTechnology, templateGroups, scopeExclusions } =
      methodology;

   const exclusions =
      scopeExclusions.length === 0
         ? 'No scope exclusions applied.'
         : scopeExclusions
              .map((rule) => `- **${rule.ruleId}:** ${rule.reason}`)
              .join('\n');

   const groups =
      templateGroups.length === 0
         ? 'No template groups defined.'
         : templateGroups
              .map(
                 (group) =>
                    `- **${group.templateGroupId}:** Representative \`${group.representativeStateId}\`, Members: ${group.memberStateIds.join(', ') || 'none'}`,
              )
              .join('\n');

   return `## Statement of Partial/Scoped Conformance & Template groups\n\n### Scope Exclusions\n${exclusions}\n\n### Template groups\n${groups}\n\n## Methodology & Assistive Technology Disclosure\n\n${assistiveTechnology.statement}\n\n- **Tier 0 (Deterministic Axe/ACT):** ${tierCounts.tier0}\n- **Tier 1 (Programmatic Probes):** ${tierCounts.tier1}\n- **Tier 2 (Advisory / Semantic Review):** ${tierCounts.tier2}\n- **Tier 3 (Native Screen Reader / AT):** ${tierCounts.tier3}\n- **Virtual Screen Reader (virtual-dom):** ${assistiveTechnology.virtualDomCount}\n- **Native Assistive Technology (VoiceOver / NVDA):** ${assistiveTechnology.nativeSrCount}\n`;
}

export function renderVerdictAuditMarkdown(report: VerdictAuditReport): string {
   return `# Accessibility Conformance Report (WCAG 2.2 VPAT / ACR)\n\n**Target Origin:** ${report.targetOrigin}  \n**Generated:** ${report.generatedAt}  \n**Status:** ${report.isDraft ? 'Draft / Incomplete' : 'Final'}\n\n${renderMarkdownExecutiveSummary(report)}\n${renderMarkdownRoadmap(report.remediationRoadmap)}\n${renderMarkdownVpatTable(report.vpatTable)}\n${listScopedAssessmentDetails(report).join('\n\n')}\n${renderMarkdownDisclosures(report.methodologyDisclosure)}`;
}

export async function writeVerdictAuditReportFiles(
   runDir: string,
   report: VerdictAuditReport,
): Promise<{ jsonPath: string; htmlPath: string; markdownPath: string }> {
   const dir = resolve(runDir);
   const jsonPath = join(dir, 'verdict-report.json');
   const htmlPath = join(dir, 'verdict-report.html');
   const markdownPath = join(dir, 'verdict-report.md');

   await Promise.all([
      writeAtomic(jsonPath, report),
      writeAtomic(htmlPath, renderVerdictAuditHtml(report)),
      writeAtomic(markdownPath, renderVerdictAuditMarkdown(report)),
   ]);

   return { jsonPath, htmlPath, markdownPath };
}

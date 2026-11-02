import type { EvidenceRecord, ReportModel } from '@a11ied/contracts';
import { readFileSync } from 'node:fs';
import {
   escapeHtml,
   renderOutcome,
   getOutcomeLabel,
   renderLink,
} from './outcome-html.js';

import { renderFindings } from './finding-html.js';
import { getFindingID } from './finding-reference.js';
import { renderAssessmentIssues } from './coverage-html.js';

const REPORT_STYLES = readFileSync(new URL('report.scss', import.meta.url), 'utf8');

const PAGE_STATUSES = new Map([
   ['audited', 'Assessment complete'],
   ['in-progress', 'Assessment in progress'],
   ['not-tested', 'Not assessed'],
   ['skipped-duplicate', 'Redirect to another listed page'],
   ['error', 'Could not assess this page'],
]);

function renderMethods(model: ReportModel): string {
   const methods = [
      ...(model.methodology.automated ? ['automated browser checks'] : []),
      ...(model.methodology.hybrid ? ['checks performed with tool assistance'] : []),
      ...(model.methodology.manual ? ['manual checks'] : []),
   ];
   const description =
      methods.length > 0
         ? `This report includes ${new Intl.ListFormat('en').format(methods)}.`
         : 'No assessment results have been recorded yet.';
   return `<p>${escapeHtml(description)}</p>${!model.methodology.manual && !model.methodology.hybrid ? '<p>No manual accessibility checks have been recorded.</p>' : ''}`;
}

function renderCoverage(model: ReportModel): string {
   const { auditedPages, discoveredPages, scannedPages } = model.discovery,
      scans =
         scannedPages === discoveredPages && discoveredPages > 0
            ? `Automated scan results are available for all ${String(discoveredPages)} discovered ${discoveredPages === 1 ? 'page' : 'pages'}.`
            : `Discovery found ${String(discoveredPages)} ${discoveredPages === 1 ? 'page' : 'pages'}; scan results are available for ${String(scannedPages)}.`;
   let assessment = 'No page assessments were completed.';
   if (model.status === 'draft') {
      assessment = 'The full assessment is still in progress.';
   }
   if (auditedPages > 0) {
      assessment = `${String(auditedPages)} ${auditedPages === 1 ? 'page assessment is' : 'page assessments are'} complete.`;
   }
   return [
      `<p class="coverage-lead">${escapeHtml(scans)}</p><p>${escapeHtml(assessment)}</p>`,
      model.discovery.complete
         ? ''
         : '<p>Page discovery is incomplete. This report covers the pages found so far.</p>',
   ].join('');
}

function getAssessmentPages(model: ReportModel): ReportModel['pages'] {
   return model.pages.filter((page) => page.auditStatus !== 'skipped-duplicate');
}

function renderContents(model: ReportModel): string {
   const sections = [
      { id: 'methodology', label: 'What was checked' },
      ...([...model.discovery.gaps, ...model.warnings].length > 0 ||
      model.assessment?.issues.length
         ? [{ id: 'coverage-gaps', label: 'Coverage gaps' }]
         : []),
      { id: 'templates', label: 'Page coverage' },
   ];
   const pagesList = getAssessmentPages(model)
         .map(
            (page) =>
               `<li>${renderLink(`#page-${page.pageId}`, page.title ?? page.url, false)}</li>`,
         )
         .join(''),
      sectionsList = sections
         .map(
            (section) => `<li>${renderLink(`#${section.id}`, section.label, false)}</li>`,
         )
         .join('');
   return [
      '<nav class="contents" aria-label="Table of contents"><details class="contents-menu" open><summary>Contents</summary><ol>',
      sectionsList,
      `<li>${renderLink('#assessments', 'Page assessments', false)}<ol>${pagesList}</ol></li>`,
      `<li>${renderLink('#inventory', 'Page inventory', false)}</li></ol></details></nav>`,
   ].join('');
}

function renderCounts(model: ReportModel): string {
   return (['critical', 'serious', 'moderate', 'minor'] as const)
      .map(
         (impact) =>
            `<li><strong>${escapeHtml(model.totals.violations[impact])}</strong> ${impact}</li>`,
      )
      .join('');
}

function renderTemplates(model: ReportModel): string {
   const rows = getAssessmentPages(model)
      .map((page) => {
         const failed = page.criteria.filter(
               (criterion) => criterion.outcome === 'failed',
            ).length,
            progress = model.assessment?.progress.pages.find(
               (entry) => entry.id === page.pageId,
            );

         return `<tr><th scope="row">${renderLink(`#page-${page.pageId}`, page.title ?? page.url, false)}</th><td>${escapeHtml(PAGE_STATUSES.get(page.auditStatus) ?? page.auditStatus)}</td><td>${progress ? `${String(progress.assessed)} / ${String(progress.total)} checks assessed; ${String(progress.unresolved)} unresolved` : 'No coordinator progress available'}</td><td>${String(failed)} failed criteria; ${String(page.findings.length)} findings</td></tr>`;
      })
      .join('');
   const coverage = `<div class="table-scroll" tabindex="0" role="region" aria-label="Page coverage table"><table class="coverage-table"><caption>Assessment progress by page</caption><thead><tr><th scope="col">Page</th><th scope="col">Status</th><th scope="col">Coverage</th><th scope="col">Findings</th></tr></thead><tbody>${rows}</tbody></table></div>`;

   return (
      coverage +
      model.templates
         .map(
            (template) => `<article><h3>Pages with a shared layout</h3>
         <p>Selected page: ${renderLink(`#page-${template.representativePageId}`, model.pages.find((page) => page.pageId === template.representativePageId)?.url ?? template.representativePageId)}</p>
         <p>Completed page assessments: ${escapeHtml(template.auditedPageIds.length)}.</p>
         <p>Other pages without an assessment: ${escapeHtml(template.notTestedPageIds.length)}. Their results are not inferred from the selected page.</p></article>`,
         )
         .join('')
   );
}

function renderCriterionTotals(page: ReportModel['pages'][number]): string {
   return (['passed', 'failed', 'notTested', 'cantTell', 'inapplicable'] as const)
      .map((outcome) => {
         const count = page.criteria.filter(
            (criterion) => criterion.outcome === outcome,
         ).length;
         const showCount =
            count > 0 ||
            outcome === 'passed' ||
            outcome === 'failed' ||
            outcome === 'notTested';
         return showCount ? renderOutcome(outcome, count) : '';
      })
      .join('');
}

function renderCriteria(page: ReportModel['pages'][number]): string {
   if (page.criteria.length === 0) {
      return '<p>No criterion assessment was recorded for this page.</p>';
   }
   const rows = page.criteria
      .map((criterion) => {
         const findings = page.findings.filter((finding) =>
               finding.criterionIds.includes(criterion.criterionId),
            ),
            links = findings.map((finding) =>
               renderLink(
                  `#${getFindingID(page.url, finding)}`,
                  getFindingID(page.url, finding),
                  false,
               ),
            );

         return [
            `<tr class="criterion--${criterion.outcome}"><th scope="row">${escapeHtml(criterion.criterionId)} ${escapeHtml(criterion.title)}</th>`,
            `<td>${escapeHtml(criterion.level)}</td><td>${renderOutcome(criterion.outcome)}</td>`,
            `<td>${escapeHtml(criterion.testMethod)}</td><td>${links.join('<br>') || (criterion.pending ? 'Assessment unfinished' : 'No failure finding')}</td></tr>`,
         ].join('');
      })
      .join('');
   return [
      `<details class="criteria"><summary><h4>Criterion outcomes</h4> <span class="criteria-total">${String(page.criteria.length)} criteria</span><span class="criteria-totals">${renderCriterionTotals(page)}</span></summary>`,
      '<div class="table-scroll" tabindex="0" role="region" aria-label="Criterion outcomes table"><table><caption>Criterion outcomes</caption><thead><tr><th scope="col">Criterion</th>',
      '<th scope="col">Level</th><th scope="col">Outcome</th><th scope="col">Test strategy</th><th scope="col">Finding references</th></tr></thead>',
      `<tbody>${rows}</tbody></table></div></details>`,
   ].join('');
}

function getRecordedMethod(record: EvidenceRecord): string {
   if (record.provenance?.actor.kind === 'agent') {
      return 'Agent assessment';
   }
   return record.mode === 'manual'
      ? 'Declared manual review'
      : 'Declared tool-assisted review';
}

function renderRecordedOutcome(record: EvidenceRecord): string {
   if (record.verification?.status === 'verified') {
      return renderOutcome(record.outcome);
   }
   const status = record.verification?.status === 'stale' ? 'Stale' : 'Unverified';
   return `<span>${status}</span><p>Recorded judgment: ${escapeHtml(getOutcomeLabel(record.outcome))}</p>`;
}

function renderRecorded(page: ReportModel['pages'][number]): string {
   if (page.recorded.length === 0) {
      return '<p>No manual or hybrid evidence was recorded for this page.</p>';
   }
   const rows = page.recorded
      .map((record) => {
         const procedure =
               record.test.kind === 'criterion'
                  ? record.test.procedureId
                  : record.test.rowKey,
            test =
               record.test.kind === 'criterion'
                  ? record.test.criterionId
                  : record.test.exampleId;
         return [
            `<tr><th scope="row">${escapeHtml(test)}</th>`,
            `<td>${renderRecordedOutcome(record)}</td><td>`,
            `<p>${getRecordedMethod(record)}. Procedure: <code>${escapeHtml(procedure)}</code></p>`,
            `<p>Evidence: ${escapeHtml(record.verification?.status ?? 'unverified')}</p>`,
            `<p>${escapeHtml(record.verification?.reasons.join(' ') ?? 'This record has not been verified.')}</p>`,
            `<p>${escapeHtml(record.note ?? record.provenance?.rationale ?? 'No explanation recorded.')}</p>`,
            record.outcome === 'failed' && record.verification?.status === 'verified'
               ? `<p>Recommendation and evidence: ${
                    page.findings
                       .filter(
                          (finding) => finding.evidence?.evidenceId === record.evidenceId,
                       )
                       .map((finding) =>
                          renderLink(
                             `#${getFindingID(page.url, finding)}`,
                             getFindingID(page.url, finding),
                             false,
                          ),
                       )
                       .join(', ') || 'No linked finding recorded'
                 }</p>`
               : '',
            `<code>${escapeHtml(record.pointer ?? 'Page')}</code><p>${escapeHtml(record.recordedAt)}</p></td></tr>`,
         ].join('');
      })
      .join('');
   return [
      '<p>Recorded checks show agent and manual evidence. Criterion totals also include automated scanner results; failed criteria link to the findings above.</p>',
      '<div class="table-scroll" tabindex="0" role="region" aria-label="Recorded checks table"><table class="recorded-table"><caption>Recorded checks</caption><thead><tr><th scope="col">Test</th>',
      '<th scope="col">Outcome</th>',
      `<th scope="col">Evidence and recommendations</th></tr></thead><tbody>${rows}</tbody></table></div>`,
   ].join('');
}

function renderGaps(model: ReportModel): string {
   const gaps = [...model.discovery.gaps, ...model.warnings];
   if (gaps.length === 0 && !model.assessment?.issues.length) {
      return '';
   }
   const items = gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join('');
   return [
      '<section aria-labelledby="coverage-gaps"><h2 id="coverage-gaps">Coverage gaps</h2>',
      `<ul>${items}</ul>`,
      renderAssessmentIssues(model),
      '</section>',
   ].join('');
}

function renderPages(model: ReportModel): string {
   return getAssessmentPages(model)
      .map(
         (page) => `<section aria-labelledby="page-${escapeHtml(page.pageId)}">
         <h3 id="page-${escapeHtml(page.pageId)}">${escapeHtml(page.title ?? page.url)}</h3>
         <p>${renderLink(page.url, page.url)}</p>
         <p>${escapeHtml(PAGE_STATUSES.get(page.auditStatus) ?? page.auditStatus)}. HTTP status: ${escapeHtml(page.status)}.</p>
         ${page.error ? `<p class="error"><strong>Error:</strong> ${escapeHtml(page.error)}</p>` : ''}
         ${renderFindings(page)}
         ${renderCriteria(page)}
         ${renderRecorded(page)}
      </section>`,
      )
      .join('');
}

function renderInventory(model: ReportModel): string {
   return model.pages
      .map(
         (page) => `<tr><td>${renderLink(page.url, page.url)}</td>
         <td>${escapeHtml(page.status)}</td>${model.templates.length > 0 ? `<td>${escapeHtml(page.templateId ?? 'Individual page')}</td>` : ''}
         <td>${escapeHtml(PAGE_STATUSES.get(page.auditStatus) ?? page.auditStatus)}</td></tr>`,
      )
      .join('');
}

/** Wrapped headings need measured offsets so nested sticky levels do not overlap. */
function renderStickyHeadings(): string {
   return [
      '<script>',
      '(function () {',
      "   const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,.criteria > summary'))",
      "      .filter((heading) => { return !heading.matches('summary h4'); });",
      '   function updateOffsets() {',
      '      const heights = new Map(headings.map((heading) => { return [heading, heading.getBoundingClientRect().height]; }));',
      '      for (const heading of headings) {',
      '         let depth = 0, offset = 0, parent = heading.parentElement;',
      '         while (parent) {',
      "            const ancestor = parent.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > summary');",
      '            if (ancestor && ancestor !== heading && heights.has(ancestor)) {',
      '               offset += heights.get(ancestor);',
      '               depth += 1;',
      '            }',
      '            parent = parent.parentElement;',
      '         }',
      "         heading.style.setProperty('--sticky-top', String(offset) + 'px');",
      "         heading.style.setProperty('--sticky-layer', String(headings.length - depth));",
      '      }',
      '   }',
      '   const observer = new ResizeObserver(updateOffsets);',
      '   headings.forEach((heading) => { observer.observe(heading); });',
      '   updateOffsets();',
      "   const layout = document.querySelector('.report-layout'), menu = document.querySelector('.contents-menu'), main = document.querySelector('main');",
      '   if (layout && menu && main) {',
      '      let previousSidebar;',
      '      const menuObserver = new ResizeObserver(() => {',
      "         const sidebar = menu.closest('nav').getBoundingClientRect().width < main.getBoundingClientRect().width;",
      '         if (sidebar !== previousSidebar) { menu.open = sidebar; previousSidebar = sidebar; }',
      '      });',
      '      menuObserver.observe(layout);',
      '   }',
      '})();',
      '</script>',
   ].join('\n');
}

/** Renders a complete offline HTML report from the public report model. */
export function renderHtmlReport(model: ReportModel): string {
   return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.title)}</title><style>
${REPORT_STYLES}
</style></head><body><a class="skip-link" href="#report-main">Skip to report</a><header id="report-top"><h1>${model.status === 'draft' ? 'Draft: ' : ''}${escapeHtml(model.title)}</h1>
${model.status === 'draft' ? '<p><strong>Draft assessment.</strong> Available results are shown below. Unfinished page assessments and pending manual checks remain incomplete. This is not a final report.</p>' : ''}
<p>${renderLink(model.startUrl, model.startUrl)}</p>${renderCoverage(model)}
<ul class="counts" aria-label="Violations by impact">${renderCounts(model)}</ul></header><div class="report-layout">
${renderContents(model)}<main id="report-main" tabindex="-1">
<section aria-labelledby="methodology"><h2 id="methodology">What was checked</h2>${renderMethods(model)}<p>${escapeHtml(model.methodology.statement)}</p></section>
${renderGaps(model)}
<section aria-labelledby="templates"><h2 id="templates">Page coverage</h2>${renderTemplates(model)}</section>
<section aria-labelledby="assessments"><h2 id="assessments">Page assessments</h2>${renderPages(model)}</section>
<section aria-labelledby="inventory"><h2 id="inventory">Page inventory</h2><div class="table-scroll" tabindex="0" role="region" aria-label="Page inventory table"><table><thead><tr><th scope="col">URL</th><th scope="col">HTTP status</th>${model.templates.length > 0 ? '<th scope="col">Layout group</th>' : ''}<th scope="col">Assessment</th></tr></thead>
<tbody>${renderInventory(model)}</tbody></table></div></section></main></div><a class="back-to-top" href="#report-top">Back to top</a><footer><p>Generated ${escapeHtml(model.generatedAt)}.</p></footer>${renderStickyHeadings()}</body></html>`;
}

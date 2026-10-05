import type { EvidenceRecord, ReportModel } from '@a11ied/contracts';
import {
   escapeHtml,
   renderOutcome,
   getOutcomeLabel,
   renderLink,
} from './outcome-html.js';

import { renderFindings } from './finding-html.js';

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
      ...([...model.discovery.gaps, ...model.warnings].length > 0
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
      '<nav class="contents" aria-label="Table of contents"><h2>Contents</h2><ol>',
      sectionsList,
      `<li>${renderLink('#assessments', 'Page assessments', false)}<ol>${pagesList}</ol></li>`,
      `<li>${renderLink('#inventory', 'Page inventory', false)}</li></ol></nav>`,
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
   if (model.templates.length === 0) {
      return '<p>Available results are reported separately for each discovered page.</p>';
   }
   return model.templates
      .map(
         (template) => `<article><h3>Pages with a shared layout</h3>
         <p>Selected page: ${renderLink(`#page-${template.representativePageId}`, model.pages.find((page) => page.pageId === template.representativePageId)?.url ?? template.representativePageId)}</p>
         <p>Completed page assessments: ${escapeHtml(template.auditedPageIds.length)}.</p>
         <p>Other pages without an assessment: ${escapeHtml(template.notTestedPageIds.length)}. Their results are not inferred from the selected page.</p></article>`,
      )
      .join('');
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
      .map((criterion) =>
         [
            `<tr class="criterion--${criterion.outcome}"><th scope="row">${escapeHtml(criterion.criterionId)} ${escapeHtml(criterion.title)}</th>`,
            `<td>${escapeHtml(criterion.level)}</td><td>${renderOutcome(criterion.outcome)}</td>`,
            `<td>${escapeHtml(criterion.testMethod)}</td></tr>`,
         ].join(''),
      )
      .join('');
   return [
      `<details class="criteria"><summary><h4>Criterion outcomes</h4> <span class="criteria-total">${String(page.criteria.length)} criteria</span><span class="criteria-totals">${renderCriterionTotals(page)}</span></summary>`,
      '<div class="table-scroll" tabindex="0" role="region" aria-label="Criterion outcomes table"><table><caption>Criterion outcomes</caption><thead><tr><th scope="col">Criterion</th>',
      '<th scope="col">Level</th><th scope="col">Outcome</th><th scope="col">Test strategy</th></tr></thead>',
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
            `<tr><th scope="row">${escapeHtml(test)}</th><td>${escapeHtml(procedure)}</td>`,
            `<td>${renderRecordedOutcome(record)}</td><td>${getRecordedMethod(record)}</td><td>`,
            `<p>Evidence: ${escapeHtml(record.verification?.status ?? 'unverified')}</p>`,
            `<p>${escapeHtml(record.verification?.reasons.join(' ') ?? 'This record has not been verified.')}</p>`,
            `<p>${escapeHtml(record.note ?? record.provenance?.rationale ?? 'No explanation recorded.')}</p>`,
            `<code>${escapeHtml(record.pointer ?? 'Page')}</code><p>${escapeHtml(record.recordedAt)}</p></td></tr>`,
         ].join('');
      })
      .join('');
   return [
      '<table><caption>Recorded checks</caption><thead><tr><th scope="col">Test</th>',
      '<th scope="col">Procedure</th><th scope="col">Outcome</th><th scope="col">Evidence mode</th>',
      `<th scope="col">Evidence</th></tr></thead><tbody>${rows}</tbody></table>`,
   ].join('');
}

function renderGaps(model: ReportModel): string {
   const gaps = [...model.discovery.gaps, ...model.warnings];
   if (gaps.length === 0) {
      return '';
   }
   const items = gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join('');
   return [
      '<section aria-labelledby="coverage-gaps"><h2 id="coverage-gaps">Coverage gaps</h2>',
      `<ul>${items}</ul>`,
      model.assessment?.issues.length
         ? `<details><summary>${String(model.assessment.issues.length)} unresolved assessment requirements</summary><ul>${model.assessment.issues.map((issue) => `<li>${escapeHtml(issue.message)}</li>`).join('')}</ul></details>`
         : '',
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
      '})();',
      '</script>',
   ].join('\n');
}

/** Renders a complete offline HTML report from the public report model. */
export function renderHtmlReport(model: ReportModel): string {
   return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.title)}</title><style>
:root{color-scheme:light;--ink:#17202a;--muted:#465360;--paper:#fff;--line:#b8c1c8;--accent:#174ea6;--danger:#8b1a1a}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}
header,main,footer{max-width:74rem;margin-inline:auto;padding:2rem}header{border-block-end:4px solid var(--ink)}
h1,h2,h3{line-height:1.2}h4,h5{font-size:1rem}a{color:var(--accent);overflow-wrap:anywhere}.counts{display:flex;flex-wrap:wrap;gap:1rem;padding:0;list-style:none}
.counts li{min-width:8rem;padding:.75rem;border:1px solid var(--line)}.counts strong{display:block;font-size:2rem}
section{padding-block:1.5rem;border-block-end:1px solid var(--line)}.finding{padding:1rem;border-inline-start:5px solid var(--line)}
.finding--critical,.finding--serious{border-color:var(--danger)}.error{color:var(--danger)}table{width:100%;border-collapse:collapse}
th,td{padding:.6rem;border:1px solid var(--line);text-align:start;vertical-align:top}code{overflow-wrap:anywhere}
@media print{header,main,footer{max-width:none;padding:1rem}a{color:inherit}.finding{break-inside:avoid}}
.coverage-lead{font-size:1.15rem;font-weight:600}.contents ol{padding-inline-start:1.5rem}
.contents ol ol{columns:2 24rem;column-gap:3rem;margin-block:.5rem}.contents li{padding-block:.25rem}
.contents ol ol li{break-inside:avoid}.guidance li{margin-block:.4rem}.guidance h5{margin-block-end:.5rem}
.criteria{margin-block:1rem}.criteria summary{cursor:pointer;padding:.75rem;border:1px solid var(--line);border-radius:.4rem}
.table-scroll{max-inline-size:100%;overflow-x:auto}.criteria table{min-inline-size:38rem}
.criteria summary h4{display:inline;font-size:1rem}.criteria-total{color:var(--muted);margin-inline-start:.75rem}
.criteria-totals{display:flex;flex-wrap:wrap;gap:.5rem;margin-block-start:.5rem}
.criteria summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.criteria[open] summary{margin-block-end:.5rem}
.outcome{display:inline-flex;align-items:center;gap:.4rem;padding:.2rem .5rem;border-radius:.35rem;font-weight:600;white-space:nowrap}
.outcome svg{width:1.1em;height:1.1em;flex:none}.outcome--passed{color:#14532d;background:#dcfce7}
.outcome--failed{color:#7f1d1d;background:#fee2e2}.outcome--cantTell{color:#713f12;background:#fef3c7}
.outcome--notTested{color:#334155;background:#e2e8f0}.outcome--inapplicable{color:#374151;background:#f3f4f6}
.criterion--failed{background:#fff7f7}.criterion--cantTell{background:#fffdf2}
@media screen{h1,h2,h3,h4,h5,.criteria summary{position:sticky;inset-block-start:var(--sticky-top,0px);z-index:var(--sticky-layer,1);padding-block:.75rem;margin-block:0;background:var(--paper);scroll-margin-block-start:calc(var(--sticky-top,0px) + 1rem)}.criteria summary h4{position:static;padding:0}}
@media print{.contents{display:none}.criteria summary{border:0;padding:0}.criteria table{font-size:.8rem;min-inline-size:0}}
@media print{.table-scroll{overflow:visible}h1,h2,h3,h4,h5{break-after:avoid}section[aria-labelledby="templates"]{break-inside:avoid}}
</style></head><body><header><h1>${model.status === 'draft' ? 'Draft: ' : ''}${escapeHtml(model.title)}</h1>
${model.status === 'draft' ? '<p><strong>Draft assessment.</strong> Available results are shown below. Unfinished page assessments and pending manual checks remain incomplete. This is not a final report.</p>' : ''}
<p>${renderLink(model.startUrl, model.startUrl)}</p>${renderCoverage(model)}
<ul class="counts" aria-label="Violations by impact">${renderCounts(model)}</ul></header><main>
${renderContents(model)}
<section aria-labelledby="methodology"><h2 id="methodology">What was checked</h2>${renderMethods(model)}<p>${escapeHtml(model.methodology.statement)}</p></section>
${renderGaps(model)}
<section aria-labelledby="templates"><h2 id="templates">Page coverage</h2>${renderTemplates(model)}</section>
<section aria-labelledby="assessments"><h2 id="assessments">Page assessments</h2>${renderPages(model)}</section>
<section aria-labelledby="inventory"><h2 id="inventory">Page inventory</h2><table><thead><tr><th scope="col">URL</th><th scope="col">HTTP status</th>${model.templates.length > 0 ? '<th scope="col">Layout group</th>' : ''}<th scope="col">Assessment</th></tr></thead>
<tbody>${renderInventory(model)}</tbody></table></section></main><footer><p>Generated ${escapeHtml(model.generatedAt)}.</p></footer>${renderStickyHeadings()}</body></html>`;
}

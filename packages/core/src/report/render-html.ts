import type { ReportModel } from '@a11ied/contracts';

function escapeHtml(value: string | number): string {
   return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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
      return '<p>No template groups were assigned.</p>';
   }
   return model.templates
      .map(
         (template) => `<article><h3>${escapeHtml(template.templateId)}</h3>
         <p>Representative page: <code>${escapeHtml(template.representativePageId)}</code></p>
         <p>Audited directly: ${escapeHtml(template.auditedPageIds.join(', ') || 'none')}</p>
         <p>Not tested: ${escapeHtml(template.notTestedPageIds.join(', ') || 'none')}</p></article>`,
      )
      .join('');
}

function renderFindings(page: ReportModel['pages'][number]): string {
   if (page.findings.length === 0) {
      return '<p>No axe violations were recorded for this page.</p>';
   }
   return page.findings
      .map(
         (finding) => `<article class="finding finding--${escapeHtml(finding.impact)}">
         <h3>${escapeHtml(finding.impact)}: ${escapeHtml(finding.ruleId)}</h3>
         <p>${escapeHtml(finding.description)}</p>
         <p><strong>WCAG:</strong> ${escapeHtml(finding.criterionIds.join(', ') || 'No mapped criterion')}</p>
         <p><strong>Elements:</strong> <code>${escapeHtml(finding.selectors.join(', ') || 'Page')}</code></p>
         <p><strong>Fix:</strong> ${escapeHtml(finding.guidance)}</p>
         <p><a href="${escapeHtml(finding.helpUrl)}">Rule documentation</a></p>
      </article>`,
      )
      .join('');
}

function renderPages(model: ReportModel): string {
   return model.pages
      .map(
         (page) => `<section aria-labelledby="page-${escapeHtml(page.pageId)}">
         <h2 id="page-${escapeHtml(page.pageId)}">${escapeHtml(page.title ?? page.url)}</h2>
         <p><a href="${escapeHtml(page.url)}">${escapeHtml(page.url)}</a></p>
         <p>Status: ${escapeHtml(page.auditStatus)}. HTTP: ${escapeHtml(page.status)}.</p>
         ${page.error ? `<p class="error"><strong>Error:</strong> ${escapeHtml(page.error)}</p>` : ''}
         ${renderFindings(page)}
      </section>`,
      )
      .join('');
}

function renderInventory(model: ReportModel): string {
   return model.pages
      .map(
         (
            page,
         ) => `<tr><td><a href="${escapeHtml(page.url)}">${escapeHtml(page.url)}</a></td>
         <td>${escapeHtml(page.status)}</td><td>${escapeHtml(page.templateId ?? 'unassigned')}</td>
         <td>${escapeHtml(page.auditStatus)}</td></tr>`,
      )
      .join('');
}

/** Renders a complete offline HTML report from the public report model. */
export function renderHtmlReport(model: ReportModel): string {
   const inventoryLabel = model.discovery.complete
      ? 'Complete inventory'
      : 'Partial inventory';
   return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.title)}</title><style>
:root{color-scheme:light;--ink:#17202a;--muted:#4f5b66;--paper:#fff;--line:#b8c1c8;--accent:#174ea6;--danger:#8b1a1a}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
header,main,footer{max-width:74rem;margin-inline:auto;padding:2rem}header{border-block-end:4px solid var(--ink)}
h1,h2,h3{line-height:1.2}a{color:var(--accent)}.counts{display:flex;flex-wrap:wrap;gap:1rem;padding:0;list-style:none}
.counts li{min-width:8rem;padding:.75rem;border:1px solid var(--line)}.counts strong{display:block;font-size:2rem}
section{padding-block:1.5rem;border-block-end:1px solid var(--line)}.finding{padding:1rem;border-inline-start:5px solid var(--line)}
.finding--critical,.finding--serious{border-color:var(--danger)}.error{color:var(--danger)}table{width:100%;border-collapse:collapse}
th,td{padding:.6rem;border:1px solid var(--line);text-align:start;vertical-align:top}code{overflow-wrap:anywhere}
@media print{header,main,footer{max-width:none;padding:1rem}a{color:inherit}.finding{break-inside:avoid}}
</style></head><body><header><h1>${escapeHtml(model.title)}</h1>
<p>${escapeHtml(model.startUrl)}</p><p>${escapeHtml(inventoryLabel)}. Scope: ${escapeHtml(model.scope)}.
Audited ${escapeHtml(model.discovery.auditedPages)} of ${escapeHtml(model.discovery.discoveredPages)} discovered pages.</p>
<ul class="counts" aria-label="Violations by impact">${renderCounts(model)}</ul></header><main>
<section aria-labelledby="methodology"><h2 id="methodology">Methodology</h2><p>${escapeHtml(model.methodology.statement)}</p>
<p>Methods present: automated ${model.methodology.automated ? 'yes' : 'no'}, hybrid ${model.methodology.hybrid ? 'yes' : 'no'}, manual ${model.methodology.manual ? 'yes' : 'no'}.</p></section>
<section aria-labelledby="templates"><h2 id="templates">Template sampling</h2>${renderTemplates(model)}</section>
${renderPages(model)}
<section aria-labelledby="inventory"><h2 id="inventory">Page inventory</h2><table><thead><tr><th scope="col">URL</th><th scope="col">HTTP status</th><th scope="col">Template</th><th scope="col">Audit status</th></tr></thead>
<tbody>${renderInventory(model)}</tbody></table></section></main><footer><p>Generated ${escapeHtml(model.generatedAt)}.</p></footer></body></html>`;
}

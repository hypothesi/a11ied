import { readFileSync } from 'node:fs';
import type { AuditReport, ReportCriterion, ReportFinding } from './model.js';
import {
   describeScope,
   describeStandard,
   describeVerdict,
   formatDate,
   METHOD_PARAGRAPHS,
   SEVERITY_LABELS,
   SEVERITY_MEANINGS,
   STANDING_LABELS,
   describeCriteria,
   describeSource,
   groupExclusions,
} from './wording.js';
import { SEVERITY_ORDER } from '../findings.js';

const REPORT_STYLES = readFileSync(new URL('audit-report.scss', import.meta.url), 'utf8');
const VIEWER_SCRIPT = readFileSync(new URL('report-viewer.js', import.meta.url), 'utf8');

/** One dialog serves every screenshot; the script fills it in when a thumbnail is opened. */
const VIEWER_DIALOG = [
   '<dialog class="report-viewer" data-report-viewer aria-labelledby="report-viewer-title">',
   '<div class="report-viewer-bar">',
   '<div><h2 id="report-viewer-title" data-viewer-title></h2>',
   '<p class="report-viewer-meta"><span data-viewer-size></span><span data-viewer-position></span></p></div>',
   '<div class="report-viewer-actions">',
   '<button type="button" data-viewer-zoom aria-pressed="false">Actual size</button>',
   '<button type="button" data-viewer-close>Close</button>',
   '</div></div>',
   '<div class="report-viewer-main">',
   '<div class="report-viewer-body" data-viewer-body tabindex="0" role="region" aria-label="Screenshot. Scroll to see all of it.">',
   '<img data-viewer-image alt="">',
   '</div>',
   '<div class="report-viewer-map" data-viewer-map hidden><div class="report-viewer-map-track">',
   '<img data-viewer-map-image alt="">',
   '<div class="report-viewer-map-window" data-viewer-window></div>',
   '<input type="range" min="0" max="1000" value="0" data-viewer-slider aria-label="Position in screenshot">',
   '</div></div></div></dialog>',
].join('');

/** How one evidence file appears in the report: a link target, and whether to show it. */
export interface EvidenceLink {
   href: string;
   label: string;
   image: boolean;
}

export interface HtmlReportOptions {
   resolveEvidence: (path: string) => EvidenceLink;
}

export function escapeHtml(text: string): string {
   return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
}

function badge(kind: string, label: string): string {
   return `<span class="report-badge report-badge--${kind}">${escapeHtml(label)}</span>`;
}

function renderMeta(report: AuditReport): string {
   const status = report.final
      ? 'Final'
      : `Interim: ${String(report.status.units.percentDone)}% of checks complete`;
   const rows = [
      ['Target', report.config.target],
      ['Standard', describeStandard(report)],
      ['Scope', describeScope(report)],
      ['Report date', formatDate(report.generatedAt)],
      ['Status', status],
   ];
   return `<dl class="report-meta">${rows
      .map(
         ([term, value]) =>
            `<div><dt>${escapeHtml(term ?? '')}</dt><dd>${escapeHtml(value ?? '')}</dd></div>`,
      )
      .join('')}</dl>`;
}

function tile(count: number, label: string): string {
   return `<li><strong>${String(count)}</strong><span>${escapeHtml(label)}</span></li>`;
}

function renderSummary(report: AuditReport): string {
   const { findings, criteria } = report.status;
   const open = criteria['cannot-tell'] + criteria.pending + criteria['not-evaluated'];
   return [
      '<section aria-labelledby="summary"><h2 id="summary">Summary</h2>',
      `<p class="report-verdict report-verdict--${report.verdict}">${escapeHtml(describeVerdict(report))}</p>`,
      '<h3>Findings by severity</h3><ul class="report-tiles">',
      ...SEVERITY_ORDER.map((severity) =>
         tile(findings[severity], SEVERITY_LABELS[severity]),
      ),
      '</ul><h3>Success criteria</h3><ul class="report-tiles">',
      tile(criteria.fail, 'Fail'),
      tile(criteria.pass, 'Pass'),
      tile(criteria['not-applicable'], 'Not applicable'),
      tile(open, 'Not verified or unfinished'),
      '</ul></section>',
   ].join('');
}

function renderPriorities(findings: readonly ReportFinding[]): string {
   if (findings.length === 0) {
      return '<section aria-labelledby="priorities"><h2 id="priorities">What to fix first</h2><p>No findings were recorded.</p></section>';
   }
   const rows = findings
      .map(
         (finding) =>
            `<tr><td><a href="#${finding.id}">${finding.id}</a></td><td>${escapeHtml(finding.title)}</td><td>${badge(finding.severity, SEVERITY_LABELS[finding.severity])}</td><td>${escapeHtml(describeCriteria(finding))}</td><td>${String(finding.pageCount)}</td></tr>`,
      )
      .join('');
   return `<section aria-labelledby="priorities"><h2 id="priorities">What to fix first</h2><div class="report-tableWrap"><table><caption>Findings in priority order: most severe first, then most widespread.</caption><thead><tr><th scope="col">ID</th><th scope="col">Issue</th><th scope="col">Severity</th><th scope="col">WCAG criterion</th><th scope="col">Pages affected</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderEvidence(
   paths: readonly string[],
   location: string,
   options: HtmlReportOptions,
): string {
   if (paths.length === 0) {
      return '';
   }
   const items = paths.map((path) => {
      const link = options.resolveEvidence(path);
      if (!link.image) {
         return `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`;
      }
      const alt = `Screenshot: ${location}`;
      return [
         '<figure class="report-shot" data-report-shot>',
         `<a href="${escapeHtml(link.href)}" title="Open the screenshot"><img src="${escapeHtml(link.href)}" alt="${escapeHtml(alt)}" loading="lazy"></a>`,
         '<div class="report-shot-more" data-shot-more hidden>',
         '<button type="button">Show full screenshot <span data-shot-size></span></button>',
         '</div></figure>',
      ].join('');
   });
   return `<div class="report-evidence">${items.join('')}</div>`;
}

function renderFinding(finding: ReportFinding, options: HtmlReportOptions): string {
   const occurrences = finding.occurrences
      .map((occurrence) => {
         const detail =
            occurrence.detail === ''
               ? ''
               : ` <span>${escapeHtml(occurrence.detail)}</span>`;
         return `<li><strong>${escapeHtml(occurrence.pageName)}:</strong> <code>${escapeHtml(occurrence.location)}</code>${detail}${renderEvidence(occurrence.evidence, occurrence.location, options)}</li>`;
      })
      .join('');
   const source = describeSource(finding.source);
   return [
      `<article class="report-finding" id="${finding.id}" aria-labelledby="${finding.id}-title">`,
      `<h3 id="${finding.id}-title">${finding.id}: ${escapeHtml(finding.title)}</h3>`,
      `<p class="report-finding-meta">${badge(finding.severity, SEVERITY_LABELS[finding.severity])}`,
      `<a href="${escapeHtml(finding.criterion.url)}">${escapeHtml(`${finding.criterion.id} ${finding.criterion.title}`)} (Level ${finding.criterion.level})</a>`,
      `<span>${source}</span></p>`,
      finding.alsoFails.length > 0
         ? `<p class="report-finding-meta">Also fails: ${finding.alsoFails
              .map(
                 (each) =>
                    `<a href="${escapeHtml(each.url)}">${escapeHtml(`${each.id} ${each.title}`)}</a>`,
              )
              .join(', ')}</p>`
         : '',
      `<dl><dt>Problem</dt><dd>${escapeHtml(finding.description)}</dd>`,
      `<dt>Who it affects</dt><dd>${escapeHtml(finding.impact)}</dd>`,
      `<dt>How to fix it</dt><dd>${escapeHtml(finding.recommendation)}</dd>`,
      `<dt>Where it occurs</dt><dd><ul class="report-occurrences">${occurrences}</ul></dd></dl>`,
      '</article>',
   ].join('');
}

function renderFindings(report: AuditReport, options: HtmlReportOptions): string {
   if (report.findings.length === 0) {
      return '';
   }
   return `<section aria-labelledby="findings"><h2 id="findings">Findings</h2>${report.findings
      .map((finding) => renderFinding(finding, options))
      .join('')}</section>`;
}

function renderCriterionRow(criterion: ReportCriterion): string {
   const links = criterion.findingIds
      .map((id) => `<a href="#${id}">${id}</a>`)
      .join(', ');
   return `<tr><th scope="row"><a href="${escapeHtml(criterion.info.url)}">${escapeHtml(`${criterion.info.id} ${criterion.info.title}`)}</a></th><td>${criterion.info.level}</td><td>${badge(criterion.standing, STANDING_LABELS[criterion.standing])}</td><td>${links}</td></tr>`;
}

function renderCriteria(report: AuditReport): string {
   return `<section aria-labelledby="criteria"><h2 id="criteria">Results by success criterion</h2><div class="report-tableWrap"><table><caption>A criterion fails when at least one audited page or screen fails it.</caption><thead><tr><th scope="col">Success criterion</th><th scope="col">Level</th><th scope="col">Result</th><th scope="col">Findings</th></tr></thead><tbody>${report.criteria
      .map(renderCriterionRow)
      .join('')}</tbody></table></div></section>`;
}

function renderGaps(report: AuditReport): string {
   if (report.gaps.length === 0) {
      return '';
   }
   const items = report.gaps
      .map((gap) => {
         const criterion = gap.criterion === undefined ? '' : `${gap.criterion}, `;
         return `<li><strong>${escapeHtml(`${criterion}${gap.pageName}`)}:</strong> ${escapeHtml(gap.reason)}</li>`;
      })
      .join('');
   return `<section aria-labelledby="gaps"><h2 id="gaps">Not verified</h2><p>These checks could not be completed. They are not passes.</p><ul>${items}</ul></section>`;
}

function renderCheckNotes(report: AuditReport): string {
   const blocks = report.pages
      .map((page) => {
         const rows = report.criteria
            .flatMap((criterion) =>
               criterion.outcomes
                  .filter(
                     (outcome) =>
                        outcome.pageId === page.id && outcome.outcome !== 'pending',
                  )
                  .map(
                     (outcome) =>
                        `<tr><th scope="row">${escapeHtml(`${criterion.info.id} ${criterion.info.title}`)}</th><td>${badge(outcome.outcome, STANDING_LABELS[outcome.outcome])}</td><td>${escapeHtml(outcome.note)}</td></tr>`,
                  ),
            )
            .join('');
         return rows === ''
            ? ''
            : `<details><summary>${escapeHtml(`${page.id} ${page.name}`)}</summary><div class="report-tableWrap"><table><thead><tr><th scope="col">Success criterion</th><th scope="col">Result</th><th scope="col">What was checked</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
      })
      .join('');
   return blocks === ''
      ? ''
      : `<h3>Check notes by page</h3><p>The auditor's note for each decision, for readers who want to verify the work.</p>${blocks}`;
}

function renderScope(report: AuditReport): string {
   const rows = report.pages
      .map(
         (page) =>
            `<tr><td>${page.id}</td><th scope="row">${escapeHtml(page.name)}</th><td>${escapeHtml(page.locator)}</td><td>${escapeHtml(page.statesTested.join(', ') || 'As loaded')}</td><td>${String(page.unitsDone)} of ${String(page.unitsTotal)}</td><td>${String(page.findingCount)}</td></tr>`,
      )
      .join('');
   const excluded =
      report.excluded.length === 0
         ? ''
         : `<h3>Excluded from this audit</h3>${groupExclusions(report)
              .map(
                 (group) =>
                    `<p>${escapeHtml(group.reason)} (${String(group.names.length)})</p><ul>${group.names
                       .map((name) => `<li>${escapeHtml(name)}</li>`)
                       .join('')}</ul>`,
              )
              .join('')}`;
   const severities = SEVERITY_ORDER.map(
      (severity) =>
         `<li><strong>${SEVERITY_LABELS[severity]}:</strong> ${escapeHtml(SEVERITY_MEANINGS[severity])}</li>`,
   ).join('');
   return [
      '<section aria-labelledby="scope"><h2 id="scope">Scope and method</h2>',
      `<div class="report-tableWrap"><table><caption>Pages, screens, and states audited.</caption><thead><tr><th scope="col">ID</th><th scope="col">Name</th><th scope="col">Location</th><th scope="col">States tested</th><th scope="col">Test passes done</th><th scope="col">Findings</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      excluded,
      '<h3>Method</h3>',
      ...METHOD_PARAGRAPHS.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
      `<h3>Severity levels</h3><ul>${severities}</ul>`,
      renderCheckNotes(report),
      '</section>',
   ].join('');
}

/** Renders the audit report as one self-contained, accessible HTML document. */
export function renderHtmlReport(
   report: AuditReport,
   options: HtmlReportOptions,
): string {
   const title = `Accessibility audit: ${report.config.name}`;
   return [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${escapeHtml(title)}</title><style>${REPORT_STYLES}</style></head>`,
      '<body><main class="report">',
      `<header><p class="report-eyebrow">Accessibility audit report</p><h1>${escapeHtml(report.config.name)}</h1>${renderMeta(report)}</header>`,
      renderSummary(report),
      renderPriorities(report.findings),
      renderFindings(report, options),
      renderCriteria(report),
      renderGaps(report),
      renderScope(report),
      `<footer class="report-footer"><p>Generated by a11ied on ${escapeHtml(formatDate(report.generatedAt))}. Audit ID: ${escapeHtml(report.config.id)}.</p></footer>`,
      '</main>',
      VIEWER_DIALOG,
      `<script type="module">${VIEWER_SCRIPT}</script>`,
      '</body></html>\n',
   ].join('');
}

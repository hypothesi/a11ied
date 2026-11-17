import { readFileSync } from 'node:fs';
import type { Audit } from '../db.js';
import { listFindings, type FindingRecord } from '../findings.js';
import { TEST_PASSES } from '../passes.js';
import { escapeHtml } from '../report/html.js';
import { SEVERITY_LABELS } from '../report/wording.js';
import type { AuditPage, Unit } from '../schema.js';
import { getAuditStatus, type AuditStatus } from '../status.js';
import { listPages } from '../pages.js';
import { listUnits } from '../units.js';

const DASHBOARD_STYLES = readFileSync(
   new URL('audit-dashboard.scss', import.meta.url),
   'utf8',
);
const EVENT_LIMIT = 40;
const TIME_START = 11;
const TIME_END = 19;

const PHASE_LABELS: Readonly<Record<AuditStatus['phase'], string>> = {
   setup: 'Setting up: no work units yet',
   'in-progress': 'In progress',
   'needs-attention': 'Stopped: every remaining unit is blocked',
   complete: 'Complete',
};

const UNIT_LABELS: Readonly<Record<Unit['status'], string>> = {
   done: 'Done',
   claimed: 'Working',
   blocked: 'Blocked',
   pending: 'Queued',
};

export interface DashboardOptions {
   /** Seconds between automatic reloads. Omit for a static snapshot. */
   refreshSeconds?: number | undefined;
   /** Link to the live report, when one is being served. */
   reportHref?: string | undefined;
}

function tile(count: number | string, label: string): string {
   return `<li><strong>${String(count)}</strong><span>${escapeHtml(label)}</span></li>`;
}

function renderProgress(status: AuditStatus): string {
   const { units } = status;
   const eta =
      status.etaMinutes === undefined || status.phase !== 'in-progress'
         ? ''
         : `<span>About ${String(status.etaMinutes)} min left at the current rate</span>`;
   return [
      `<div class="dash-progress"><progress max="${String(Math.max(units.total, 1))}" value="${String(units.done)}" aria-label="Work units complete"></progress>`,
      `<strong>${String(units.done)} of ${String(units.total)} units (${String(units.percentDone)}%)</strong>${eta}</div>`,
      '<ul class="dash-tiles">',
      tile(units.claimed, 'Units in progress'),
      tile(units.pending, 'Units queued'),
      tile(units.blocked, 'Units blocked'),
      tile(status.findings.total, 'Findings'),
      tile(status.criteria.fail, 'Criteria failing'),
      tile(
         `${String(status.criteria.pass + status.criteria['not-applicable'])}/${String(status.criteria.total)}`,
         'Criteria passing or not applicable',
      ),
      '</ul>',
   ].join('');
}

function renderBlocked(status: AuditStatus): string {
   if (status.blocked.length === 0) {
      return '';
   }
   const items = status.blocked
      .map(
         (unit) =>
            `<li><strong>${escapeHtml(unit.id)}:</strong> ${escapeHtml(unit.reason)} <br>Resolve it, then run <code>a1 audit reopen ${escapeHtml(unit.id)}</code></li>`,
      )
      .join('');
   return `<section aria-labelledby="blocked"><h2 id="blocked">Needs a person (${String(status.blocked.length)})</h2><div class="dash-alert"><ul>${items}</ul></div></section>`;
}

function renderWorkers(status: AuditStatus): string {
   if (status.workers.length === 0) {
      return '<section aria-labelledby="workers"><h2 id="workers">Active workers</h2><p class="dash-sub">No worker holds a unit right now.</p></section>';
   }
   const rows = status.workers
      .map(
         (worker) =>
            `<tr><th scope="row">${escapeHtml(worker.worker)}</th><td>${escapeHtml(worker.unitId)}</td><td>${String(worker.minutesActive)} min</td><td>${String(worker.leaseMinutesLeft)} min</td></tr>`,
      )
      .join('');
   return `<section aria-labelledby="workers"><h2 id="workers">Active workers</h2><div class="dash-tableWrap"><table><thead><tr><th scope="col">Worker</th><th scope="col">Unit</th><th scope="col">Working for</th><th scope="col">Claim expires in</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderCell(unit: Unit | undefined): string {
   if (!unit) {
      return '<td class="dash-cell dash-cell--pending">-</td>';
   }
   const who = unit.status === 'claimed' ? ` (${escapeHtml(unit.worker ?? '')})` : '';
   return `<td class="dash-cell dash-cell--${unit.status}">${UNIT_LABELS[unit.status]}${who}</td>`;
}

function renderMatrix(pages: readonly AuditPage[], units: readonly Unit[]): string {
   const passes = TEST_PASSES.filter((pass) =>
      units.some((unit) => unit.pass === pass.id),
   );
   if (passes.length === 0) {
      return '';
   }
   const rows = pages
      .filter((page) => units.some((unit) => unit.pageId === page.id))
      .map((page) => {
         const cells = passes
            .map((pass) =>
               renderCell(
                  units.find((unit) => unit.pageId === page.id && unit.pass === pass.id),
               ),
            )
            .join('');
         return `<tr><th scope="row">${escapeHtml(`${page.id} ${page.name}`)}</th>${cells}</tr>`;
      })
      .join('');
   const head = passes
      .map((pass) => `<th scope="col">${escapeHtml(pass.id)}</th>`)
      .join('');
   return `<section aria-labelledby="matrix"><h2 id="matrix">Progress by page and test pass</h2><div class="dash-tableWrap"><table><thead><tr><th scope="col">Page or screen</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderFindings(findings: readonly FindingRecord[]): string {
   if (findings.length === 0) {
      return '';
   }
   const rows = findings
      .map((finding) => {
         const pages = new Set(finding.open.map((instance) => instance.pageId)).size;
         return `<tr><td>${finding.id}</td><td>${SEVERITY_LABELS[finding.severity]}</td><td>${[finding.criterion, ...finding.related].join(', ')}</td><td>${escapeHtml(finding.title)}</td><td>${String(pages)}</td><td>${finding.source}</td></tr>`;
      })
      .join('');
   return `<section aria-labelledby="findings"><h2 id="findings">Findings so far (${String(findings.length)})</h2><div class="dash-tableWrap"><table><thead><tr><th scope="col">ID</th><th scope="col">Severity</th><th scope="col">WCAG</th><th scope="col">Issue</th><th scope="col">Pages</th><th scope="col">Source</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderLog(status: AuditStatus): string {
   const items = status.recentEvents
      .toReversed()
      .map(
         (event) =>
            `<li><time datetime="${event.at}">${event.at.slice(TIME_START, TIME_END)}</time> ${escapeHtml(event.actor)}: ${escapeHtml(event.message)}</li>`,
      )
      .join('');
   return `<section aria-labelledby="log"><h2 id="log">Recent activity (UTC, newest first)</h2><ul class="dash-log">${items}</ul></section>`;
}

/** Renders the live progress page for one audit. */
export function renderDashboardHtml(
   audit: Audit,
   options: DashboardOptions = {},
): string {
   const status = getAuditStatus(audit, EVENT_LIMIT);
   const { config } = status;
   const refresh =
      options.refreshSeconds === undefined
         ? ''
         : `<meta http-equiv="refresh" content="${String(options.refreshSeconds)}">`;
   const report =
      options.reportHref === undefined
         ? ''
         : ` <a href="${escapeHtml(options.reportHref)}">Open the ${status.phase === 'complete' ? '' : 'interim '}report</a>`;
   return [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      refresh,
      `<title>${escapeHtml(`${String(status.units.percentDone)}% ${config.name}`)} audit</title><style>${DASHBOARD_STYLES}</style></head>`,
      '<body><main class="dash">',
      `<h1>${escapeHtml(config.name)}</h1>`,
      `<p class="dash-sub">${escapeHtml(config.target)} | WCAG ${escapeHtml(config.wcagVersion)} ${config.level} | ${String(status.pages.active)} pages or screens | audit <code>${escapeHtml(config.id)}</code></p>`,
      `<p><strong>${PHASE_LABELS[status.phase]}.</strong>${report}</p>`,
      renderProgress(status),
      renderBlocked(status),
      renderWorkers(status),
      renderMatrix(listPages(audit), listUnits(audit)),
      renderFindings(listFindings(audit)),
      renderLog(status),
      '</main></body></html>\n',
   ].join('');
}

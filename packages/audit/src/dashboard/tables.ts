import type { FindingRecord } from '../findings.js';
import { TEST_PASSES } from '../passes.js';
import { escapeHtml } from '../report/html.js';
import { SEVERITY_LABELS } from '../report/wording.js';
import { SITE_PAGE_ID } from '../pages.js';
import type { AuditPage, Finding, Unit } from '../schema.js';
import type { AuditStatus } from '../status.js';
import {
   formatMinutes,
   icon,
   renderTime,
   section,
   table,
   UNIT_LABELS,
   type IconName,
} from './parts.js';

const UNIT_ICONS: Readonly<Record<Unit['status'], IconName>> = {
   done: 'done',
   claimed: 'claimed',
   blocked: 'blocked',
   pending: 'pending',
};

const SOURCE_LABELS: Readonly<Record<Finding['source'], string>> = {
   axe: 'Automated scan',
   agent: 'Auditing agent',
   human: 'Person',
};

/** What the page needs to describe units, pages, and findings by name. */
export interface DashboardData {
   status: AuditStatus;
   pages: readonly AuditPage[];
   units: readonly Unit[];
   findings: readonly FindingRecord[];
   /** Link to the live report, when one is being served. */
   reportHref: string | undefined;
}

function capitalize(text: string): string {
   return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Describes a unit by its page and test pass, for example "Cart, pointer". */
function describeUnit(unit: Unit, pages: readonly AuditPage[]): string {
   const page = pages.find((each) => each.id === unit.pageId);
   return `${page?.name ?? unit.pageId}, ${unit.pass}`;
}

export function renderBlocked({ status, pages }: DashboardData): string {
   if (status.blocked.length === 0) {
      return section({ key: 'blocked', heading: '', body: '' });
   }
   const items = status.blocked
      .map(
         (unit) =>
            `<li><p><strong>${escapeHtml(unit.id)}</strong> <span class="dash-sub">${escapeHtml(describeUnit(unit, pages))}</span></p><p>${escapeHtml(unit.reason)}</p><p class="dash-sub">Resolve it, then run <code class="dash-command">a1 audit reopen ${escapeHtml(unit.id)}</code></p></li>`,
      )
      .join('');
   return `<section class="dash-section dash-alert" data-live="blocked" aria-labelledby="blocked"><h2 id="blocked">${icon('blocked')}Needs a person (${String(status.blocked.length)})</h2><ul>${items}</ul></section>`;
}

function describeLease(minutesLeft: number): string {
   if (minutesLeft > 0) {
      return formatMinutes(minutesLeft);
   }
   const text =
      minutesLeft === 0
         ? 'Less than 1 min'
         : `Expired ${formatMinutes(-minutesLeft)} ago`;
   return `<span class="dash-state dash-state--blocked">${icon('blocked')}${text}</span>`;
}

export function renderWorkers({ status, pages, units }: DashboardData): string {
   if (status.workers.length === 0) {
      const body =
         status.phase === 'complete'
            ? ''
            : '<p class="dash-sub">No worker holds a unit right now.</p>';
      return section({ key: 'workers', heading: 'Active workers', body });
   }
   const rows = status.workers
      .map((worker) => {
         const unit = units.find((each) => each.id === worker.unitId);
         const name = unit ? escapeHtml(describeUnit(unit, pages)) : '';
         return `<tr><th scope="row">${escapeHtml(worker.worker)}</th><td><span class="dash-page"><span class="dash-id">${escapeHtml(worker.unitId)}</span><span>${name}</span></span></td><td>${formatMinutes(worker.minutesActive)}</td><td>${describeLease(worker.leaseMinutesLeft)}</td></tr>`;
      })
      .join('');
   return section({
      key: 'workers',
      heading: `Active workers (${String(status.workers.length)})`,
      body: table({
         labelledBy: 'workers',
         className: 'dash-table--workers',
         head: ['Worker', 'Unit', 'Working for', 'Claim expires in'],
         rows,
      }),
   });
}

function renderCell(unit: Unit | undefined): string {
   if (!unit) {
      return '<td class="dash-cell dash-cell--none"><span aria-hidden="true">-</span><span class="dash-hidden">Not planned</span></td>';
   }
   const who = unit.status === 'claimed' ? ` (${escapeHtml(unit.worker ?? '')})` : '';
   return `<td class="dash-cell dash-cell--${unit.status}"><span class="dash-state dash-state--${unit.status}">${icon(UNIT_ICONS[unit.status])}<span class="dash-state-label">${UNIT_LABELS[unit.status]}${who}</span></span></td>`;
}

/** The cross-page row has no page id worth showing; its name says what it covers. */
function renderPageName(page: AuditPage): string {
   const id = page.id === SITE_PAGE_ID ? '' : escapeHtml(page.id);
   return `<span class="dash-page"><span class="dash-id">${id}</span><span>${escapeHtml(page.name)}</span></span>`;
}

function countDone(units: readonly Unit[]): string {
   const done = units.filter((unit) => unit.status === 'done').length;
   return `${String(done)} of ${String(units.length)}`;
}

export function renderMatrix({ status, pages, units }: DashboardData): string {
   const passes = TEST_PASSES.filter((pass) =>
      units.some((unit) => unit.pass === pass.id),
   );
   if (passes.length === 0) {
      const body =
         status.phase === 'setup'
            ? '<p class="dash-sub">No pages or screens yet. Add them with <code class="dash-command">a1 audit page add &lt;url&gt;</code> or <code class="dash-command">a1 audit discover &lt;url&gt;</code>.</p>'
            : '';
      return section({ key: 'matrix', heading: 'Progress by page and test pass', body });
   }
   const rows = pages
      .map((page) => ({ page, own: units.filter((unit) => unit.pageId === page.id) }))
      .filter(({ own }) => own.length > 0)
      .map(({ page, own }) => {
         const cells = passes
            .map((pass) => renderCell(own.find((unit) => unit.pass === pass.id)))
            .join('');
         const complete = own.every((unit) => unit.status === 'done');
         return `<tr><th scope="row">${renderPageName(page)}</th><td class="dash-count${complete ? ' dash-count--complete' : ''}">${countDone(own)}</td>${cells}</tr>`;
      })
      .join('');
   const totals = passes
      .map(
         (pass) =>
            `<td class="dash-count">${countDone(units.filter((unit) => unit.pass === pass.id))}</td>`,
      )
      .join('');
   return section({
      key: 'matrix',
      heading: 'Progress by page and test pass',
      body: table({
         labelledBy: 'matrix',
         className: 'dash-table--matrix',
         head: [
            'Page or screen',
            'Done',
            ...passes.map((pass) => escapeHtml(capitalize(pass.id))),
         ],
         rows,
         foot: `<tr><th scope="row">Units done</th><td class="dash-count">${countDone(units)}</td>${totals}</tr>`,
      }),
   });
}

export function renderFindings({ status, findings, reportHref }: DashboardData): string {
   const rows = findings
      .map((finding) => {
         const pages = new Set(finding.open.map((instance) => instance.pageId)).size;
         const id = escapeHtml(finding.id);
         const link =
            reportHref === undefined
               ? id
               : `<a href="${escapeHtml(reportHref)}#${id}">${id}</a>`;
         const criteria = [finding.criterion, ...finding.related].map((criterion) =>
            escapeHtml(criterion),
         );
         return `<tr><td>${link}</td><td><span class="dash-badge dash-badge--${finding.severity}">${SEVERITY_LABELS[finding.severity]}</span></td><td class="dash-nowrap">${criteria.join(', ')}</td><td>${escapeHtml(finding.title)}</td><td class="dash-count">${String(pages)}</td><td class="dash-nowrap">${SOURCE_LABELS[finding.source]}</td></tr>`;
      })
      .join('');
   const heading = status.phase === 'complete' ? 'Findings' : 'Findings so far';
   return section({
      key: 'findings',
      heading: `${heading} (${String(findings.length)})`,
      body:
         rows === ''
            ? ''
            : table({
                 labelledBy: 'findings',
                 className: 'dash-table--findings',
                 head: ['ID', 'Severity', 'WCAG', 'Issue', 'Pages', 'Found by'],
                 rows,
              }),
   });
}

export function renderLog({ status }: DashboardData): string {
   const items = status.recentEvents
      .toReversed()
      .map(
         (event) =>
            `<li class="dash-event dash-event--${escapeHtml(event.type)}">${renderTime(event.at, 'time')}<strong>${escapeHtml(event.actor)}</strong><span>${escapeHtml(event.message)}</span></li>`,
      )
      .join('');
   return section({
      key: 'log',
      heading: 'Recent activity',
      body:
         items === ''
            ? ''
            : `<p class="dash-sub">Newest first. Times are in <span data-dash-zone>UTC</span>.</p><ul class="dash-log">${items}</ul>`,
   });
}

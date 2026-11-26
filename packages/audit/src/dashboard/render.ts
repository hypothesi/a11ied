import { readFileSync } from 'node:fs';
import type { Audit } from '../db.js';
import { listFindings } from '../findings.js';
import { escapeHtml } from '../report/html.js';
import { plural } from '../report/wording.js';
import { getAuditStatus, type AuditStatus } from '../status.js';
import { listPages } from '../pages.js';
import { listUnits } from '../units.js';
import { ICON_SPRITE, icon, renderTime, type IconName } from './parts.js';
import { renderSummary } from './summary.js';
import {
   renderBlocked,
   renderFindings,
   renderLog,
   renderMatrix,
   renderWorkers,
   type DashboardData,
} from './tables.js';

const DASHBOARD_STYLES = readFileSync(
   new URL('audit-dashboard.scss', import.meta.url),
   'utf8',
);
const LIVE_SCRIPT = readFileSync(new URL('dashboard-live.js', import.meta.url), 'utf8');
const EVENT_LIMIT = 40;

interface PhaseText {
   label: string;
   /** What the phase means for the reader, when the label alone does not say. */
   detail: string;
   icon: IconName;
}

const PHASES: Readonly<Record<AuditStatus['phase'], PhaseText>> = {
   setup: { label: 'Setting up', detail: 'No work units yet.', icon: 'pending' },
   'in-progress': { label: 'In progress', detail: '', icon: 'claimed' },
   'needs-attention': {
      label: 'Stopped',
      detail: 'Every remaining unit is blocked.',
      icon: 'blocked',
   },
   complete: { label: 'Complete', detail: 'Every unit is done.', icon: 'done' },
};

export interface DashboardOptions {
   /** Seconds between automatic updates. Omit for a static snapshot. */
   refreshSeconds?: number | undefined;
   /** Link to the live report, when one is being served. */
   reportHref?: string | undefined;
}

function renderTarget(target: string): string {
   const isWebAddress =
      URL.canParse(target) && /^https?:$/u.test(new URL(target).protocol);
   return isWebAddress
      ? `<a href="${escapeHtml(target)}">${escapeHtml(target)}</a>`
      : escapeHtml(target);
}

function renderTitle(status: AuditStatus, options: DashboardOptions): string {
   const { config, phase } = status;
   const text = PHASES[phase];
   const detail = text.detail === '' ? '' : `<span>${text.detail}</span>`;
   const report =
      options.reportHref === undefined
         ? ''
         : `<a class="dash-button" href="${escapeHtml(options.reportHref)}">Open the ${phase === 'complete' ? '' : 'interim '}report</a>`;
   return [
      '<div class="dash-title" data-live="title">',
      `<h1>${escapeHtml(config.name)}</h1>`,
      `<p class="dash-target">${renderTarget(config.target)}</p>`,
      `<p class="dash-status"><strong class="dash-phase dash-phase--${phase}">${icon(text.icon)}${text.label}</strong>${detail}${report}</p>`,
      '</div>',
   ].join('');
}

/**
 * States how current the page is. The live page's script takes over this element; without
 * scripts the page reloads itself, and a snapshot never changes.
 */
function renderFreshness(audit: Audit, options: DashboardOptions): string {
   if (options.refreshSeconds === undefined) {
      return `<div class="dash-live"><p>Snapshot from ${renderTime(audit.now().toISOString(), 'datetime')}. It does not update.</p></div>`;
   }
   const seconds = String(options.refreshSeconds);
   return [
      `<div class="dash-live" data-dash-live data-refresh-seconds="${seconds}">`,
      `<p data-dash-state>Reloads every ${seconds} seconds</p>`,
      '<button type="button" class="dash-button" data-dash-pause hidden>Pause updates</button>',
      '</div>',
   ].join('');
}

function renderMeta(status: AuditStatus): string {
   const { config, pages } = status;
   const kind = config.platform === 'web' ? 'page' : 'screen';
   const excluded = pages.excluded === 0 ? '' : `, ${String(pages.excluded)} excluded`;
   const rows = [
      [
         'Standard',
         `WCAG ${escapeHtml(config.wcagVersion)} Level ${config.level}, ${plural(status.criteria.total, 'criterion', 'criteria')}`,
      ],
      ['Scope', `${plural(pages.active, kind, `${kind}s`)}${excluded}`],
      ['Audit', `<code>${escapeHtml(config.id)}</code>`],
      ['Started', renderTime(config.createdAt, 'datetime')],
   ];
   return `<dl class="dash-meta" data-live="meta">${rows.map(([term, value]) => `<div><dt>${term ?? ''}</dt><dd>${value ?? ''}</dd></div>`).join('')}</dl>`;
}

/** The sentence a screen reader hears when the phase or the blocked count changes. */
function describeForAnnouncement(status: AuditStatus): string {
   const blocked = status.blocked.length;
   const needs =
      blocked === 0 ? '' : ` ${plural(blocked, 'unit needs', 'units need')} a person.`;
   return `Audit ${PHASES[status.phase].label.toLowerCase()}.${needs}`;
}

/** Renders the live progress page for one audit. */
export function renderDashboardHtml(
   audit: Audit,
   options: DashboardOptions = {},
): string {
   const status = getAuditStatus(audit, EVENT_LIMIT);
   const data: DashboardData = {
      status,
      pages: listPages(audit),
      units: listUnits(audit),
      findings: listFindings(audit),
      reportHref: options.reportHref,
   };
   const isLive = options.refreshSeconds !== undefined;
   // Without scripts the page falls back to reloading itself.
   const refresh = isLive
      ? `<noscript><meta http-equiv="refresh" content="${String(options.refreshSeconds)}"></noscript>`
      : '';
   return [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      // An empty icon stops the browser from requesting a favicon the server does not have.
      '<link rel="icon" href="data:,">',
      refresh,
      `<title>${escapeHtml(`${String(status.units.percentDone)}% ${status.config.name}`)} audit</title><style>${DASHBOARD_STYLES}</style></head>`,
      `<body>${ICON_SPRITE}<main class="dash" data-dash-announcement="${escapeHtml(describeForAnnouncement(status))}">`,
      `<header class="dash-header">${renderTitle(status, options)}${renderFreshness(audit, options)}</header>`,
      '<p class="dash-hidden" role="status" data-dash-announcer></p>',
      renderMeta(status),
      renderBlocked(data),
      renderSummary(status),
      renderWorkers(data),
      renderMatrix(data),
      renderFindings(data),
      renderLog(data),
      '</main>',
      isLive ? `<script type="module">${LIVE_SCRIPT}</script>` : '',
      '</body></html>\n',
   ].join('');
}

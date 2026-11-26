import { SEVERITY_ORDER } from '../findings.js';
import { SEVERITY_LABELS, STANDING_LABELS, plural } from '../report/wording.js';
import type { AuditStatus, CriterionStanding } from '../status.js';
import { formatMinutes, UNIT_LABELS, UNIT_STATUS_ORDER } from './parts.js';

/** Results other than failure, in the order the report lists them. */
const OTHER_STANDINGS: readonly CriterionStanding[] = [
   'pass',
   'not-applicable',
   'cannot-tell',
   'pending',
   'not-evaluated',
];

interface BreakdownRow {
   kind: string;
   label: string;
   count: number;
}

function renderBreakdown(rows: readonly BreakdownRow[]): string {
   const items = rows
      .map((row) => {
         const zero = row.count === 0 ? ' dash-breakdown-row--zero' : '';
         return `<li class="dash-breakdown-row${zero}"><span class="dash-mark dash-mark--${row.kind}">${row.label}</span><strong>${String(row.count)}</strong></li>`;
      })
      .join('');
   return `<ul class="dash-breakdown">${items}</ul>`;
}

function describeEta(status: AuditStatus): string {
   if (status.phase !== 'in-progress' || status.etaMinutes === undefined) {
      return '';
   }
   return `<p class="dash-eta">About ${formatMinutes(status.etaMinutes)} left at the current rate</p>`;
}

/**
 * Draws the unit states as one bar split in proportion to their counts. The legend under
 * it states every count in text, so the bar itself is hidden from assistive technology.
 */
function renderUnitBar(units: AuditStatus['units']): string {
   const segments = UNIT_STATUS_ORDER.filter((state) => units[state] > 0)
      .map(
         (state) =>
            `<span class="dash-bar-segment dash-fill--${state}" style="flex-grow:${String(units[state])}"></span>`,
      )
      .join('');
   const legend = UNIT_STATUS_ORDER.map((state) => {
      const zero = units[state] === 0 ? ' class="dash-legend--zero"' : '';
      return `<li${zero}><span class="dash-swatch dash-fill--${state}"></span><strong>${String(units[state])}</strong> ${UNIT_LABELS[state].toLowerCase()}</li>`;
   }).join('');
   return `<div class="dash-bar" aria-hidden="true">${segments}</div><ul class="dash-legend">${legend}</ul>`;
}

function renderUnitsCard(status: AuditStatus): string {
   const { units } = status;
   const count =
      units.total === 0
         ? 'No work units yet'
         : `${String(units.done)} of ${plural(units.total, 'unit', 'units')} done`;
   return [
      '<div class="dash-card dash-card--units"><h2>Work units</h2>',
      `<p class="dash-hero"><strong>${String(units.percentDone)}%</strong><span>${count}</span></p>`,
      describeEta(status),
      renderUnitBar(units),
      '</div>',
   ].join('');
}

function renderFindingsCard(status: AuditStatus): string {
   const { findings } = status;
   const noun = findings.total === 1 ? 'finding' : 'findings';
   const label = status.phase === 'complete' ? noun : `${noun} so far`;
   return [
      '<div class="dash-card"><h2>Findings</h2>',
      `<p class="dash-figure"><strong>${String(findings.total)}</strong><span>${label}</span></p>`,
      renderBreakdown(
         SEVERITY_ORDER.map((severity) => ({
            kind: severity,
            label: SEVERITY_LABELS[severity],
            count: findings[severity],
         })),
      ),
      '</div>',
   ].join('');
}

function renderCriteriaCard(status: AuditStatus): string {
   const { criteria } = status;
   const tone = criteria.fail > 0 ? ' dash-figure--fail' : '';
   const verb = criteria.fail === 1 ? 'fails' : 'fail';
   const rows = OTHER_STANDINGS.filter(
      (standing) => standing !== 'not-evaluated' || criteria[standing] > 0,
   ).map((standing) => ({
      kind: standing,
      label: STANDING_LABELS[standing],
      count: criteria[standing],
   }));
   return [
      '<div class="dash-card"><h2>Success criteria</h2>',
      `<p class="dash-figure${tone}"><strong>${String(criteria.fail)}</strong><span>of ${plural(criteria.total, 'criterion', 'criteria')} ${verb}</span></p>`,
      renderBreakdown(rows),
      '</div>',
   ].join('');
}

/** The three cards that state how far the audit is and what it has found. */
export function renderSummary(status: AuditStatus): string {
   return [
      '<div class="dash-summary" data-live="summary">',
      renderUnitsCard(status),
      renderFindingsCard(status),
      renderCriteriaCard(status),
      '</div>',
   ].join('');
}

import type { ReportOutcome } from '@a11ied/contracts';

const OUTCOMES = {
   passed: { label: 'Passed', path: 'm6 10 3 3 5-6' },
   failed: { label: 'Failed', path: 'm7 7 6 6m0-6-6 6' },
   cantTell: { label: 'Needs review', path: 'M8 8a2 2 0 0 1 4 0c0 2-2 2-2 2m0 2v.1' },
   notTested: { label: 'Not tested', path: 'M6 10h8' },
   inapplicable: { label: 'Not applicable', path: 'm5 15 10-10' },
};
/** Escape report text and attributes before combining them with HTML. */
export function escapeHtml(value: string | number): string {
   return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
}

/** Keep outcome labels and decorative SVGs consistent across summaries and tables. */
export function renderOutcome(outcome: ReportOutcome, count?: number): string {
   const { label, path } = OUTCOMES[outcome];
   const text = count === undefined ? label : `${String(count)} ${label.toLowerCase()}`;
   return [
      `<span class="outcome outcome--${outcome}">`,
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">',
      `<circle cx="10" cy="10" r="8"/><path d="${path}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      `${text}</span>`,
   ].join('');
}

/** Use readable WCAG outcome names in unverified judgment labels too. */
export function getOutcomeLabel(outcome: ReportOutcome): string {
   return OUTCOMES[outcome].label;
}

/**
 * Local report navigation stays in the current tab; evidence and reference links open
 * separately.
 */
export function renderLink(url: string, label: string, opensNewTab = true): string {
   const attributes = opensNewTab
      ? ' target="_blank" rel="noopener noreferrer" title="Opens in a new tab"'
      : '';
   return `<a href="${escapeHtml(url)}"${attributes}>${escapeHtml(label)}</a>`;
}

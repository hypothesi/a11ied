import type {
   ReportCriterion,
   ReportFinding,
   ReportModel,
   ReportOutcome,
} from '@a11ied/contracts';
import { escapeHtml, renderLink, renderOutcome } from './outcome-html.js';

const MAX_SELECTORS = 5;

type Impact = ReportFinding['impact'];

const PRINCIPLES = new Map([
   ['1', { name: 'Perceivable', summary: 'Content can be perceived by every user.' }],
   ['2', { name: 'Operable', summary: 'Every control works by keyboard and pointer.' }],
   ['3', { name: 'Understandable', summary: 'Content and behavior are predictable.' }],
   ['4', { name: 'Robust', summary: 'Assistive technology can interpret the page.' }],
]);

/** Most urgent first, so a criterion shows the worst result any page produced. */
const OUTCOME_PRIORITY: readonly ReportOutcome[] = [
   'failed',
   'cantTell',
   'notTested',
   'passed',
   'inapplicable',
];

const IMPACT_PRIORITY: readonly Impact[] = [
   'critical',
   'serious',
   'moderate',
   'minor',
   'unknown',
];

interface IssueGroup {
   key: string;
   title: string;
   impact: Impact;
   source: ReportFinding['source'];
   description: string;
   guidance: string | undefined;
   helpUrl: string | undefined;
   criterionIDs: string[];
   selectors: Set<string>;
   pages: Map<string, string>;
}

interface CriterionRollup {
   criterion: ReportCriterion;
   outcome: ReportOutcome;
   pageCount: number;
   failedPages: number;
   issueKeys: string[];
}

function getIssueKey(finding: ReportFinding): string {
   return finding.ruleId ?? finding.title ?? finding.description;
}

function getImpactRank(impact: Impact): number {
   return IMPACT_PRIORITY.indexOf(impact);
}

function groupIssues(model: ReportModel): IssueGroup[] {
   const groups = new Map<string, IssueGroup>();
   for (const page of model.pages) {
      for (const finding of page.findings) {
         const key = getIssueKey(finding);
         const group: IssueGroup = groups.get(key) ?? {
            key,
            title: finding.title ?? finding.ruleId ?? 'Accessibility finding',
            impact: finding.impact,
            source: finding.source,
            description: finding.description,
            guidance: finding.guidance,
            helpUrl: finding.helpUrl,
            criterionIDs: finding.criterionIds,
            selectors: new Set<string>(),
            pages: new Map<string, string>(),
         };
         for (const selector of finding.selectors) {
            group.selectors.add(selector);
         }
         group.pages.set(page.pageId, page.title ?? page.url);
         groups.set(key, group);
      }
   }
   return [...groups.values()].toSorted(
      (first, second) =>
         getImpactRank(first.impact) - getImpactRank(second.impact) ||
         second.pages.size - first.pages.size,
   );
}

function rollUpCriteria(model: ReportModel, issues: IssueGroup[]): CriterionRollup[] {
   const rollups = new Map<string, CriterionRollup>();
   for (const page of model.pages) {
      for (const criterion of page.criteria) {
         const rollup = rollups.get(criterion.criterionId) ?? {
            criterion,
            outcome: criterion.outcome,
            pageCount: 0,
            failedPages: 0,
            issueKeys: [],
         };
         rollup.pageCount += 1;
         rollup.failedPages += criterion.outcome === 'failed' ? 1 : 0;
         if (
            OUTCOME_PRIORITY.indexOf(criterion.outcome) <
            OUTCOME_PRIORITY.indexOf(rollup.outcome)
         ) {
            rollup.outcome = criterion.outcome;
         }
         rollups.set(criterion.criterionId, rollup);
      }
   }
   for (const rollup of rollups.values()) {
      rollup.issueKeys = issues
         .filter((issue) => issue.criterionIDs.includes(rollup.criterion.criterionId))
         .map((issue) => issue.key);
   }
   return [...rollups.values()].toSorted((first, second) =>
      first.criterion.criterionId.localeCompare(second.criterion.criterionId, 'en', {
         numeric: true,
      }),
   );
}

function getIssueAnchor(key: string): string {
   return `issue-${key.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
}

function renderGuidanceSteps(guidance: string): string {
   const steps = guidance
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
   return `<ul>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ul>`;
}

function renderIssue(issue: IssueGroup, pageCount: number): string {
   const pages = [...issue.pages.entries()]
         .map(
            ([pageID, label]) =>
               `<li>${renderLink(`#page-${pageID}`, label, false)}</li>`,
         )
         .join(''),
      selectors = [...issue.selectors]
         .slice(0, MAX_SELECTORS)
         .map((selector) => `<code>${escapeHtml(selector)}</code>`);
   return `<details class="issue issue--${escapeHtml(issue.impact)}" id="${getIssueAnchor(issue.key)}">
<summary><span class="impact impact--${escapeHtml(issue.impact)}">${escapeHtml(issue.impact === 'unknown' ? 'Not rated' : issue.impact)}</span>
<strong>${escapeHtml(issue.title)}</strong>
<span class="issue-scope">${String(issue.pages.size)} of ${String(pageCount)} pages | WCAG ${escapeHtml(issue.criterionIDs.join(', ') || 'unmapped')}</span></summary>
<div class="issue-body"><p>${escapeHtml(issue.description)}</p>
${selectors.length > 0 ? `<p><strong>Elements:</strong> ${selectors.join(', ')}</p>` : ''}
${issue.guidance ? `<h4>How to fix</h4>${renderGuidanceSteps(issue.guidance)}` : ''}
${issue.helpUrl ? `<p>${renderLink(issue.helpUrl, 'Rule documentation')}</p>` : ''}
<details class="issue-pages"><summary>Affected pages (${String(issue.pages.size)})</summary><ul>${pages}</ul></details></div></details>`;
}

/** Findings grouped by cause, so one site-wide defect is one entry, not 24. */
export function renderFixFirst(model: ReportModel): string {
   const issues = groupIssues(model),
      pageCount = model.pages.filter(
         (page) => page.auditStatus !== 'skipped-duplicate',
      ).length;
   if (issues.length === 0) {
      return '<p>No findings were recorded.</p>';
   }
   return `<p>Findings are grouped by cause, most severe first. Open one for the fix and its affected pages.</p>${issues
      .map((issue) => renderIssue(issue, pageCount))
      .join('')}`;
}

function renderCriterionRow(
   rollup: CriterionRollup,
   issues: Map<string, IssueGroup>,
): string {
   const { criterion } = rollup,
      links = rollup.issueKeys
         .map((key) =>
            renderLink(`#${getIssueAnchor(key)}`, issues.get(key)?.title ?? key, false),
         )
         .join('<br>');
   return `<tr class="rollup--${rollup.outcome}"><th scope="row">${escapeHtml(criterion.criterionId)} ${escapeHtml(criterion.title)}</th>
<td>${escapeHtml(criterion.level)}</td><td>${renderOutcome(rollup.outcome)}</td>
<td>${rollup.failedPages > 0 ? `${String(rollup.failedPages)} of ${String(rollup.pageCount)} pages` : '-'}</td>
<td>${links || (rollup.outcome === 'notTested' ? renderLink('#coverage-gaps', 'Not attempted in this run. See coverage gaps for why.', false) : '-')}</td></tr>`;
}

function renderOutcomeTotals(rollups: CriterionRollup[]): string {
   return OUTCOME_PRIORITY.map((outcome) => {
      const count = rollups.filter((rollup) => rollup.outcome === outcome).length;
      return count > 0 ? renderOutcome(outcome, count) : '';
   }).join('');
}

/** Every Level A and AA criterion, grouped by principle and collapsed by default. */
export function renderCriteriaByPrinciple(model: ReportModel): string {
   const issues = groupIssues(model);
   const rollups = rollUpCriteria(model, issues);
   const issueMap = new Map(issues.map((issue) => [issue.key, issue]));
   if (rollups.length === 0) {
      return '<p>No criterion results were recorded.</p>';
   }
   const sections = [...PRINCIPLES.entries()].map(([digit, principle]) => {
      const group = rollups.filter((rollup) =>
         rollup.criterion.criterionId.startsWith(`${digit}.`),
      );
      const rows = group.map((rollup) => renderCriterionRow(rollup, issueMap)).join('');
      return `<details class="principle"${group.some((entry) => entry.outcome === 'failed') ? ' open' : ''}>
<summary><h3>${digit}. ${principle.name}</h3> <span class="rollup-total">${String(group.length)} criteria. ${principle.summary}</span>
<span class="rollup-totals">${renderOutcomeTotals(group)}</span></summary>
<div class="table-scroll" tabindex="0" role="region" aria-label="${principle.name} criteria"><table><thead><tr><th scope="col">Criterion</th><th scope="col">Level</th><th scope="col">Site-wide result</th><th scope="col">Pages failing</th><th scope="col">Related issues</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
   });
   return [
      `<p>${String(rollups.length)} Level A and AA criteria. Each shows the worst result on any page: Failed beats Needs review, which beats Not tested.</p>`,
      `<p class="rollup-totals">${renderOutcomeTotals(rollups)}</p>`,
      ...sections,
   ].join('');
}

/** Headline numbers a reader can absorb in five seconds. */
export function renderOverview(model: ReportModel): string {
   const issues = groupIssues(model);
   const rollups = rollUpCriteria(model, issues);
   const failed = String(rollups.filter((rollup) => rollup.outcome === 'failed').length);
   const countOf = (outcome: ReportOutcome): string =>
      String(rollups.filter((rollup) => rollup.outcome === outcome).length);
   const tiles = [
      [String(issues.length), 'distinct issues to fix'],
      [failed, `of ${String(rollups.length)} criteria failing`],
      [countOf('cantTell'), 'criteria need review'],
      [countOf('passed'), 'criteria passing on every page'],
      [countOf('notTested'), 'criteria not yet tested'],
      [String(model.discovery.discoveredPages), 'pages in scope'],
   ];
   return `<ul class="tiles" aria-label="Summary">${tiles
      .map(
         ([value, label]) =>
            `<li><strong>${escapeHtml(value ?? '')}</strong><span>${escapeHtml(label ?? '')}</span></li>`,
      )
      .join('')}</ul>`;
}

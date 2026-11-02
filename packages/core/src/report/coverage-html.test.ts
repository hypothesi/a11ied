import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { buildReportModel } from './aggregate.js';
import { renderAssessmentIssues } from './coverage-html.js';
import { getFindingID } from './finding-reference.js';
import { buildReportTestInventory } from './test-fixtures.js';

const GAP_GROUP_COUNT = 2;
const GAP_ISSUE_COUNT = 1001;

describe('assessment gap explanations', () => {
   it('groups repeated scope diagnostics and preserves actionable reasons', () => {
      const model = buildReportModel(buildReportTestInventory(), []);
      model.assessment = {
         runId: 'report-test',
         revision: 1,
         complete: false,
         coverage: { total: 1001, attempted: 0, assessed: 0, unresolved: 1001 },
         progress: { pages: [], states: [], journeys: [] },
         issues: [
            ...Array.from({ length: 1000 }, () => ({
               code: 'audit-obligation-missing',
               message: 'Required WCAG 1.1.1 scope is missing or outdated.',
            })),
            {
               code: 'audit-check-unsupported',
               message: 'Required capabilities are unavailable: audio.',
            },
         ],
      };
      const document = new JSDOM(renderAssessmentIssues(model)).window.document;

      expect(document.querySelectorAll('tbody tr')).toHaveLength(GAP_GROUP_COUNT);
      expect(document.body.textContent).toContain('1000');
      expect(document.body.textContent).toContain(
         'unfinished work, not a website failure',
      );
      expect(document.body.textContent).toContain('Use a verified environment');
      expect(document.body.textContent).not.toContain('scope is missing or outdated');
      expect(model.assessment.issues).toHaveLength(GAP_ISSUE_COUNT);
   });
});

describe('finding references', () => {
   it('keeps references stable across remediation edits and distinct across pages', () => {
      const finding = {
         source: 'axe' as const,
         ruleId: 'button-name',
         impact: 'critical' as const,
         description: 'Unnamed button',
         guidance: 'Add a name.',
         criterionIds: ['4.1.2'],
         selectors: ['button'],
         reproduction: [],
         artifactLinks: [],
      };
      const reference = getFindingID('https://example.test/', finding);
      finding.guidance = 'Use the visible button text as its name.';

      expect(getFindingID('https://example.test/', finding)).toStrictEqual(reference);
      expect(getFindingID('https://example.test/contact', finding)).not.toStrictEqual(
         reference,
      );
   });
});

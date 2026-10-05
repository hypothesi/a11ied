import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { reportOutcomeSchema, type ReportModel } from '@a11ied/contracts';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { buildAuditReport } from '../audit/runtime.js';
import { withLoadedPage } from '../browser/shared-browser.js';
import { buildReportModel } from './aggregate.js';
import { renderHtmlReport } from './render-html.js';
import { buildReportTestAudit, buildReportTestInventory } from './test-fixtures.js';

const BROWSER_TEST_TIMEOUT_MS = 90_000;
const PRESENTATION_CRITERION_COUNT = 7;
const REPORT_TEST_VIEWPORT = { width: 390, height: 700 };

function buildPresentationModel(): ReportModel {
   const model = buildReportModel(buildReportTestInventory(), [
      { pageId: 'home-a1b2c3d4', report: buildReportTestAudit() },
   ]);
   const [page] = model.pages,
      criterion = page?.criteria[0];
   if (!page || !criterion) {
      throw new Error('The fixture needs a page and criterion.');
   }
   model.status = 'draft';
   model.discovery.auditedPages = 0;
   page.auditStatus = 'in-progress';
   page.title =
      'A long page assessment title that wraps over multiple lines on a narrow screen';
   page.criteria = reportOutcomeSchema.options.map((outcome) => ({
      ...criterion,
      outcome,
   }));
   page.criteria.push(
      { ...criterion, outcome: 'passed' },
      { ...criterion, outcome: 'notTested' },
   );
   model.warnings.push('A page could not be discovered.');
   page.findings.push({
      ruleId: 'button-name',
      source: 'axe',
      reproduction: [],
      artifactLinks: [],
      impact: 'critical',
      description: 'Buttons need accessible names.',
      guidance:
         'Fix any of the following:\n  Give the button a name.\n  Associate a visible <label>.\n\nFix all of the following:\n  Preserve keyboard focus.',
      helpUrl: 'https://example.test/button-name',
      criterionIds: ['4.1.2'],
      selectors: ['button'],
   });
   model.pages.push({
      ...page,
      pageId: 'redirect-page',
      url: 'https://example.test/redirect',
      title: 'Redirect alias',
      auditStatus: 'skipped-duplicate',
      criteria: [],
      findings: [],
      recorded: [],
   });
   return model;
}

describe('report presentation', () => {
   it('explains coverage and separates fix instructions without exposing bookkeeping', () => {
      const html = renderHtmlReport(buildPresentationModel());
      const document = new JSDOM(html).window.document;

      expect(document.body.textContent).toContain(
         'Automated scan results are available for all 1 discovered page.',
      );
      expect(document.body.textContent).toContain(
         'The full assessment is still in progress.',
      );
      expect(document.body.textContent).toContain(
         'No manual accessibility checks have been recorded.',
      );
      expect(document.body.textContent).not.toMatch(
         /Methods present|No template groups|Complete inventory|notTested/,
      );
      expect(
         [...document.querySelectorAll('.guidance li')].map((item) => item.textContent),
      ).to.eql([
         'Give the button a name.',
         'Associate a visible <label>.',
         'Preserve keyboard focus.',
      ]);
      expect(html).not.toContain('visible <label>');
   });
});

describe('report navigation', () => {
   it('offers collapsed tables, labeled SVG outcomes, and safe contents links to real headings', () => {
      const document = new JSDOM(renderHtmlReport(buildPresentationModel())).window
         .document;
      const contents = [...document.querySelectorAll('nav a')],
         links = [...document.querySelectorAll('a')].filter(
            (link) => !link.closest('nav'),
         );

      expect(document.querySelector('details')?.hasAttribute('open')).toStrictEqual(
         false,
      );
      expect(
         [...document.querySelectorAll('details table .outcome')].map(
            (badge) => badge.textContent,
         ),
      ).to.eql([
         'Passed',
         'Failed',
         'Needs review',
         'Not tested',
         'Not applicable',
         'Passed',
         'Not tested',
      ]);
      expect(
         document.querySelectorAll('details table .outcome svg[aria-hidden="true"]'),
      ).toHaveLength(PRESENTATION_CRITERION_COUNT);
      expect(
         links.every(
            (link) =>
               link.getAttribute('target') === '_blank' &&
               link.getAttribute('rel') === 'noopener noreferrer',
         ),
      ).toStrictEqual(true);
      expect(contents.length).toBeGreaterThan(0);
      expect(
         contents.every(
            (link) => !link.hasAttribute('target') && !link.hasAttribute('rel'),
         ),
      ).toStrictEqual(true);
      expect(
         contents.every(
            (link) =>
               document.querySelector(link.getAttribute('href') ?? '#missing') !== null,
         ),
      ).toStrictEqual(true);
   });
});

describe('report hierarchy', () => {
   it('nests page links under assessments and uses matching heading levels', () => {
      const model = buildPresentationModel();
      const document = new JSDOM(renderHtmlReport(model)).window.document;

      expect(
         [...document.querySelectorAll('nav > ol > li > a')].map(
            (link) => link.textContent,
         ),
      ).to.eql([
         'What was checked',
         'Coverage gaps',
         'Page coverage',
         'Page assessments',
         'Page inventory',
      ]);
      expect(document.querySelectorAll('nav > ol > li > ol > li > a')).toHaveLength(
         model.discovery.discoveredPages,
      );
      expect(document.querySelector('#assessments')?.tagName).toStrictEqual('H2');
      expect(
         document.querySelectorAll(
            'section[aria-labelledby="assessments"] > section > h3',
         ),
      ).toHaveLength(model.discovery.discoveredPages);
      expect(document.querySelector('nav')?.textContent).not.toContain('Redirect alias');
      expect(
         document.querySelector('#inventory')?.closest('section')?.textContent,
      ).toContain('https://example.test/redirect');
      expect(document.querySelector('summary > h4')?.textContent).toStrictEqual(
         'Criterion outcomes',
      );
      expect(document.querySelector('.finding > h4')).not.toBeNull();
      expect(document.querySelector('.guidance > h5')?.textContent).toStrictEqual(
         'How to fix',
      );
   });
});

describe('criterion summary counts', () => {
   it('counts repeated outcomes and includes additional outcomes when present', () => {
      const document = new JSDOM(renderHtmlReport(buildPresentationModel())).window
         .document;

      expect(
         [...document.querySelectorAll('summary .outcome')].map(
            (badge) => badge.textContent,
         ),
      ).to.eql([
         '2 passed',
         '1 failed',
         '2 not tested',
         '1 needs review',
         '1 not applicable',
      ]);
      expect(
         document.querySelectorAll('summary .outcome svg[aria-hidden="true"]'),
      ).toHaveLength(reportOutcomeSchema.options.length);
   });

   it('keeps zero failed and not-tested counts visible in the collapsed summary', () => {
      const model = buildPresentationModel();
      for (const page of model.pages) {
         for (const criterion of page.criteria) {
            criterion.outcome = 'passed';
         }
      }
      const document = new JSDOM(renderHtmlReport(model)).window.document;

      expect(
         [...document.querySelectorAll('summary .outcome')].map(
            (badge) => badge.textContent,
         ),
      ).to.eql(['7 passed', '0 failed', '0 not tested']);
   });
});

describe('sticky report headings', () => {
   it(
      'stacks the section, wrapped page heading, and criterion summary while scrolling',
      async () => {
         const html = renderHtmlReport(buildPresentationModel());
         await withLoadedPage({ kind: 'html', html }, async (page) => {
            await page.setViewportSize(REPORT_TEST_VIEWPORT);
            await page.locator('details summary').first().click();
            await page.waitForFunction(() => {
               const section = document.querySelector('#assessments'),
                  summary = document.querySelector('details summary'),
                  title = document.querySelector(
                     'section[aria-labelledby="assessments"] > section > h3',
                  );
               return (
                  section &&
                  title &&
                  summary &&
                  Math.abs(
                     Number.parseFloat(getComputedStyle(summary).top) -
                        section.getBoundingClientRect().height -
                        title.getBoundingClientRect().height,
                  ) < 1
               );
            });
            const state = await page.evaluate(() => {
               const section = document.querySelector('#assessments'),
                  summary = document.querySelector('details summary'),
                  title = document.querySelector(
                     'section[aria-labelledby="assessments"] > section > h3',
                  );
               if (!section || !title || !summary) {
                  throw new Error('The fixture needs nested headings.');
               }
               const offset = Number.parseFloat(getComputedStyle(summary).top);
               window.scrollTo(
                  0,
                  summary.getBoundingClientRect().top + window.scrollY - offset,
               );
               return {
                  positions: [section, title, summary].map(
                     (heading) => getComputedStyle(heading).position,
                  ),
                  gap:
                     summary.getBoundingClientRect().top -
                     title.getBoundingClientRect().bottom,
               };
            });

            expect(state.positions).to.eql(['sticky', 'sticky', 'sticky']);
            expect(Math.abs(state.gap)).toBeLessThanOrEqual(1);
         });
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

describe('expanded report accessibility', () => {
   it(
      'passes axe with every outcome and the initially hidden tables expanded',
      async () => {
         const directory = await mkdtemp(
            resolve(tmpdir(), 'a11ied-report-presentation-'),
         );
         try {
            const dom = new JSDOM(renderHtmlReport(buildPresentationModel()));
            for (const detail of dom.window.document.querySelectorAll('details')) {
               detail.setAttribute('open', '');
            }
            const html = dom.serialize(),
               report = await buildAuditReport({
                  load: { kind: 'html', html },
                  readHtml: async () => html,
                  target: { kind: 'html', value: html },
                  metadata: {},
                  userHints: [],
                  wcagVersion: '2.2',
                  evidenceFile: resolve(directory, 'evidence.jsonl'),
               });

            expect(report.axe.violations).to.eql([]);
         } finally {
            await rm(directory, { recursive: true, force: true });
         }
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

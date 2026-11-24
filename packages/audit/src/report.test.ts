import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
   addPage,
   blockUnit,
   buildAuditReport,
   claimNext,
   closeAudit,
   renderDashboardHtml,
   renderMarkdownReport,
   startAudit,
   submitUnit,
   writeAuditReport,
   type Audit,
} from './index.js';

const PAGE_COUNT = 2;
let root = '';
const opened: Audit[] = [];

function start(criteria: string[]): Audit {
   const audit = startAudit({
      target: 'https://example.test',
      name: 'Example',
      id: 'report',
      root,
      criteria,
   });
   opened.push(audit);
   return audit;
}

function failFocus(audit: Audit, worker: string, evidence?: string[]): void {
   const unit = claimNext(audit, { worker });
   const shot = join('evidence', `${unit?.id ?? 'unit'}.png`);
   mkdirSync(join(audit.dir, 'evidence'), { recursive: true });
   writeFileSync(join(audit.dir, shot), 'x');
   submitUnit(audit, {
      unitId: unit?.id ?? '',
      worker,
      submission: {
         results: [{ criterion: '2.4.7', outcome: 'fail', note: 'No focus ring.' }],
         findings: [
            {
               criterion: '2.4.7',
               title: 'Menu button has no focus indicator',
               severity: 'serious',
               description: 'The <Menu> button shows no change on focus.',
               impact: 'Keyboard users lose their place.',
               recommendation: 'Add a :focus-visible outline.',
               location: 'Header > Menu (button.nav)',
               evidence: evidence ?? [shot],
            },
         ],
      },
   });
}

beforeEach(() => {
   root = mkdtempSync(join(tmpdir(), 'a11ied-report-'));
});

afterEach(() => {
   for (const audit of opened.splice(0)) {
      closeAudit(audit);
   }
   rmSync(root, { recursive: true, force: true });
});

describe('audit report', () => {
   it('states failure, lists one finding across two pages, and is final when done', () => {
      const audit = start(['2.4.7']);
      addPage(audit, { locator: 'https://example.test/', name: 'Home' });
      addPage(audit, { locator: 'https://example.test/about', name: 'About' });
      failFocus(audit, 'w1');
      failFocus(audit, 'w2');

      const report = buildAuditReport(audit);
      const markdown = renderMarkdownReport(report);

      expect(report.final).toBe(true);
      expect(report.verdict).toBe('fails');
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0]?.pageCount).toBe(PAGE_COUNT);
      expect(markdown).toContain('does not meet WCAG 2.2 Level AA');
      expect(markdown).toContain('| F1 | Menu button has no focus indicator | Serious |');
      expect(markdown).toContain('* Status: Final');
   });

   it('marks an unfinished audit interim and explains every gap', () => {
      const audit = start(['2.4.7', '3.3.1', '3.2.3']);
      addPage(audit, { locator: 'https://example.test/', name: 'Home' });
      const unit = claimNext(audit, { worker: 'w1', passes: ['forms'] });
      blockUnit(audit, { unitId: unit?.id ?? '', actor: 'w1', reason: 'Needs a login.' });

      const report = buildAuditReport(audit);
      const reasons = report.gaps.map((gap) => gap.reason).join('\n');

      expect(report.final).toBe(false);
      expect(report.verdict).toBe('incomplete');
      expect(reasons).toContain('was blocked: Needs a login.');
      expect(reasons).toContain('1 test pass has not been completed: keyboard.');
      expect(reasons).toContain('Needs at least two pages or screens');
      expect(renderMarkdownReport(report)).toContain('Interim');
   });

   it('writes a self-contained HTML file with escaped text and embedded screenshots', () => {
      const audit = start(['2.4.7']);
      addPage(audit, { locator: 'https://example.test/', name: 'Home' });
      mkdirSync(join(audit.dir, 'evidence', 'P1.keyboard'), { recursive: true });
      writeFileSync(join(audit.dir, 'evidence', 'P1.keyboard', 'focus.png'), 'png-bytes');
      failFocus(audit, 'w1', ['evidence/P1.keyboard/focus.png']);

      const { files } = writeAuditReport(audit, { formats: ['html'] });
      const html = readFileSync(files[0] ?? '', 'utf8');

      expect(html).toContain('<html lang="en">');
      expect(html).toContain('The &lt;Menu&gt; button shows no change on focus.');
      expect(html).toContain('src="data:image/png;base64,');
      expect(html).toContain('alt="Screenshot: Header &gt; Menu (button.nav)"');
      expect(html).toContain('data-report-shot');
   });

   it('colors a summary tile only when it counts something', () => {
      const audit = start(['2.4.7']);
      addPage(audit, { locator: 'https://example.test/', name: 'Home' });
      failFocus(audit, 'w1');

      const { files } = writeAuditReport(audit, { formats: ['html'] });
      const html = readFileSync(files[0] ?? '', 'utf8');

      expect(html).toContain('<li class="report-tile--fail"><strong>1</strong>');
      expect(html).toContain('<li><strong>0</strong><span>Pass</span>');
   });

   it('includes a screenshot viewer for pictures too tall to show in a thumbnail', () => {
      const audit = start(['2.4.7']);
      addPage(audit, { locator: 'https://example.test/', name: 'Home' });
      failFocus(audit, 'w1');

      const { files } = writeAuditReport(audit, { formats: ['html'] });
      const html = readFileSync(files[0] ?? '', 'utf8');

      expect(html).toContain('<dialog class="report-viewer"');
      expect(html).toContain('Show full screenshot');
      expect(html).toContain('aria-label="Position in screenshot"');
      expect(html.slice(html.indexOf('<script'))).toContain('showModal');
   });
});

describe('audit dashboard', () => {
   it('shows who is working on what and what needs a person', () => {
      const audit = start(['2.4.7', '3.3.1']);
      addPage(audit, { locator: 'https://example.test/', name: 'Home' });
      claimNext(audit, { worker: 'w1', passes: ['keyboard'] });
      blockUnit(audit, { unitId: 'P1.forms', actor: 'lead', reason: 'Needs a login.' });

      const html = renderDashboardHtml(audit, { refreshSeconds: 5 });

      expect(html).toContain('<meta http-equiv="refresh" content="5">');
      expect(html).toContain('Working (w1)');
      expect(html).toContain('Needs a person (1)');
      expect(html).toContain('a1 audit reopen P1.forms');
   });
});

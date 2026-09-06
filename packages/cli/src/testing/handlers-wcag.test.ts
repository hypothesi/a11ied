import { describe, expect, it } from 'vitest';

import {
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   EXIT_USAGE,
   SEARCH_EXCERPT_LINES,
} from './setup.js';
import { expectFirstErrorMessage } from './helpers.js';

const SHOW_EXCERPT_LINES = 14;

interface CriterionResult {
   criterion: { id: string; normativeText: string; understandingUrl: string };
   coverage: { coverageState: string; axeRuleIds: string[]; actRuleIds: string[] };
   strategy: { preferredEvidenceMode: string };
}

async function assertWcagShorthand(): Promise<void> {
   const result = await runCli(['wcag', '1.4.3', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.command as { subcommand: string }).subcommand).toBe('show');
   expect((json.result as CriterionResult).criterion.id).toBe('1.4.3');
   expect((json.result as CriterionResult).coverage.axeRuleIds).toContain(
      'color-contrast',
   );
}

async function assertWcagTechniqueShorthand(): Promise<void> {
   const result = await runCli(['wcag', 'G18', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const payload = json.result as {
      technique: { id: string; url: string; kind: string };
      criteria: Array<{ id: string }>;
   };
   expect(payload.technique.kind).toBe('sufficient');
   expect(payload.technique.url).toBe(
      'https://www.w3.org/WAI/WCAG22/Techniques/general/G18',
   );
   expect(payload.criteria.map((criterion) => criterion.id)).toContain('1.4.3');
}

async function assertWcagCriteria(): Promise<void> {
   const allResult = await runCli(['wcag', 'criteria', '--wcag', '2.1', '--json']);
   const allCriteria = parseJsonOutput(allResult.stdout);
   expect(allResult.status).toBe(EXIT_SUCCESS);
   expect(allCriteria.ok).toBe(true);
   expect((allCriteria.result as { level: string }).level).toBe('all');
   const allEntries = (
      allCriteria.result as { criteria: Array<{ wcagVersion: string; level: string }> }
   ).criteria;
   expect(allEntries.every((entry) => entry.wcagVersion === '2.1')).toBe(true);
   expect([...new Set(allEntries.map((entry) => entry.level))].toSorted()).toEqual([
      'A',
      'AA',
      'AAA',
   ]);

   const result = await runCli([
      'wcag',
      'criteria',
      '--level',
      'AA',
      '--wcag',
      '2.1',
      '--json',
   ]);
   const criteria = parseJsonOutput(result.stdout);
   expect(criteria.ok).toBe(true);
   expect(
      (
         criteria.result as { criteria: Array<{ wcagVersion: string; level: string }> }
      ).criteria.every((entry) => entry.wcagVersion === '2.1' && entry.level === 'AA'),
   ).toBe(true);
}

async function assertWcagCriteriaSummary(): Promise<void> {
   const result = await runCli(['wcag', 'criteria', '--summary', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const summary = json.result as {
      version: string;
      totals: { criteria: number; automated: number };
      byLevel: Record<string, { criteria: number }>;
   };
   const levelTotal = Object.values(summary.byLevel).reduce(
      (memo, bucket) => memo + bucket.criteria,
      0,
   );
   expect(summary.version).toBe('2.2');
   expect(summary.totals.criteria).toBe(levelTotal);
   expect(summary.totals.automated).toBeGreaterThan(0);

   const text = await runCli(['wcag', 'criteria', '--summary']);
   expect(text.stdout).toContain('WCAG 2.2 coverage');
   expect(text.stdout).toMatch(/All\s+\d+\s+\d+/);
}

async function assertWcagShow(): Promise<void> {
   const result = await runCli(['wcag', 'show', 'status-messages', '--json']);
   const show = parseJsonOutput(result.stdout);
   expect(show.ok).toBe(true);
   const payload = show.result as CriterionResult;
   expect(payload.criterion.id).toBe('4.1.3');
   expect(payload.criterion.normativeText).toBeTruthy();
   expect(payload.criterion.understandingUrl).toBeTruthy();
   expect(payload.coverage).toMatchObject({
      coverageState: expect.any(String),
      axeRuleIds: expect.any(Array),
      actRuleIds: expect.any(Array),
   });
   expect(payload.strategy.preferredEvidenceMode).toBeTruthy();
}

async function assertWcagSearch(): Promise<void> {
   const result = await runCli(['wcag', 'search', 'status message', '--json']);
   const search = parseJsonOutput(result.stdout);
   expect(search.ok).toBe(true);
   expect(
      (
         search.result as { results: Array<{ criterionId: string; matches: unknown[] }> }
      ).results.some(
         (entry) => entry.criterionId === '4.1.3' && entry.matches.length > 0,
      ),
   ).toBe(true);
}

async function assertWcagRule(): Promise<void> {
   const result = await runCli(['wcag', 'rule', 'color-contrast', '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const payload = json.result as {
      ruleId: string;
      help: string;
      helpUrl: string;
      rule: { criterionIds: string[] };
      criteria: Array<{ id: string; level: string; techniques: unknown[] }>;
   };
   expect(payload.ruleId).toBe('color-contrast');
   expect(payload.help).toMatch(/contrast/i);
   expect(payload.helpUrl).toMatch(/^https:\/\//);
   expect(payload.rule.criterionIds).toContain('1.4.3');
   expect(payload.criteria.find((criterion) => criterion.id === '1.4.3')?.level).toBe(
      'AA',
   );

   const text = await runCli(['wcag', 'rule', 'color-contrast']);
   expect(text.stdout).toContain('1.4.3  Contrast (Minimum)  [AA]');
   expect(text.stdout).toContain('Fix');

   const missing = await runCli(['wcag', 'rule', 'not-a-rule', '--json']);
   expectFirstErrorMessage({ result: missing, match: /not-a-rule/ });
}

/** The W3C Document License asks each copy to carry the notice, the status, and a link. */
async function assertUnderstandingTextAttribution(document: {
   title: string;
   url: string;
   status: string;
}): Promise<void> {
   const text = await runCli(['wcag', 'understanding', '2.4.2']);
   expect(text.stdout).toContain('2.4.2  Page Titled  [A]');
   expect(text.stdout).toContain('Copyright W3C');
   expect(text.stdout).toContain(document.title);
   expect(text.stdout).toContain(document.status);
   expect(text.stdout).toContain(document.url);
}

/** The short excerpt inside `wcag show` is a copy too, so it names its source. */
async function assertExcerptAttribution(documentUrl: string): Promise<void> {
   const excerpt = await runCli(['wcag', '2.4.2']);
   expect(excerpt.stdout).toContain('Copyright W3C');
   expect(excerpt.stdout).toContain(documentUrl);
}

async function assertWcagUnderstanding(): Promise<void> {
   const jsonResult = await runCli(['wcag', 'understanding', 'page-titled', '--json']);
   const json = parseJsonOutput(jsonResult.stdout);
   expect(jsonResult.status).toBe(EXIT_SUCCESS);
   const payload = json.result as {
      criterion: { id: string };
      document: { title: string; url: string; status: string };
      body: string;
   };
   expect(payload.criterion.id).toBe('2.4.2');
   expect(payload.document.url).toBe(
      'https://www.w3.org/WAI/WCAG22/Understanding/page-titled',
   );
   expect(payload.document.title).toBeTruthy();
   expect(payload.document.status).toBeTruthy();
   expect(payload.body.length).toBeGreaterThan(0);

   await assertUnderstandingTextAttribution(payload.document);
   await assertExcerptAttribution(payload.document.url);
}

async function assertWcagBareHelp(): Promise<void> {
   const result = await runCli(['wcag']);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect(result.stdout).toContain('Usage: a1 wcag [options] [command] [criterion]');

   const json = await runCli(['wcag', '--json']);
   expect(json.status).toBe(EXIT_SUCCESS);
   expect(json.stdout).toContain('Usage: a1 wcag');
}

async function assertWcagInvalidVersion(): Promise<void> {
   const result = await runCli([
      'wcag',
      'criteria',
      '--level',
      'AA',
      '--wcag',
      '2.0',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_USAGE);
   expect(json.ok).toBe(false);
   expect((json.errors as Array<{ message: string }>)[0]?.message).toMatch(
      /2.0.*unsupported/i,
   );
}

async function assertTextShowSnapshot(): Promise<void> {
   const show = await runCli(['wcag', 'show', 'status-messages']);
   const excerpt = show.stdout.split('\n').slice(0, SHOW_EXCERPT_LINES).join('\n');

   expect(excerpt).toContain('4.1.3  Status Messages  [AA]');
   expect(excerpt).toContain('Guideline 4.1 Compatible');
   expect(excerpt).toContain(
      'In content implemented using markup languages, status messages can be',
   );
   // The old field-label view is gone: no bare headings over a URL or an enum table.
   expect(show.stdout).not.toContain('Normative text');
   expect(show.stdout).not.toContain('Understanding\n');
   expect(show.stdout).not.toContain('Coverage');
   expect(show.stdout).toContain('Testing it');
   expect(show.stdout).toContain('a1 sr expect <text>');
   expect(show.stdout).toContain('If it fails');
   expect(show.stdout).toContain('ARIA22');
   expect(show.stdout).toContain('a1 wcag understanding 4.1.3');
}

async function assertTextSearchSnapshot(): Promise<void> {
   const search = await runCli(['wcag', 'search', 'status message']);
   const excerpt = search.stdout.split('\n').slice(0, SEARCH_EXCERPT_LINES).join('\n');

   expect(excerpt).toContain('Search results for "status message"  2 matches');
   expect(excerpt).toContain('4.1.3  Status Messages  [AA]');
   expect(excerpt).not.toContain('score');
   expect(search.stdout).toContain('Run a1 wcag x.y.z for details');
}

async function assertTextVerboseShow(): Promise<void> {
   const verboseShow = await runCli(['wcag', 'show', 'status-messages', '--verbose']);
   expect(verboseShow.stdout).toMatch(/Slug:\s+status-messages/);
   expect(verboseShow.stdout).toMatch(/Coverage state:\s+hybrid/);
   expect(verboseShow.stdout).toMatch(/Procedure ids:\s+status_message_probe/);
}

describe('cli wcag commands', () => {
   it('shows a criterion through the bare shorthand', async () => {
      await assertWcagShorthand();
   });
   it('shows a technique through the bare shorthand', async () => {
      await assertWcagTechniqueShorthand();
   });
   it('checks wcag criteria', async () => {
      await assertWcagCriteria();
   });
   it('prints coverage totals with criteria --summary', async () => {
      await assertWcagCriteriaSummary();
   });
   it('checks wcag show with coverage folded in', async () => {
      await assertWcagShow();
   });
   it('checks wcag search', async () => {
      await assertWcagSearch();
   });
   it('maps an axe rule to criteria with wcag rule', async () => {
      await assertWcagRule();
   });
   it('prints the full Understanding document with the source attribution', async () => {
      await assertWcagUnderstanding();
   });
   it('prints help and exits 0 for bare wcag without a terminal', async () => {
      await assertWcagBareHelp();
   });
   it('rejects unsupported version', async () => {
      await assertWcagInvalidVersion();
   });
   it('keeps representative text output readable', async () => {
      await assertTextShowSnapshot();
      await assertTextSearchSnapshot();
      await assertTextVerboseShow();
   });
});

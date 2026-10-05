import { rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearEvidence, recordEvidence } from '../evidence/store.js';
import { loadPageAuditReports } from './loaded-audits.js';
import { assertReportReady } from './readiness.js';
import { createSavedAssessment, saveAudit } from './test-fixtures.js';

const roots: string[] = [];
afterEach(async () => {
   vi.restoreAllMocks();
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

describe('current assessment report evidence', () => {
   it('blocks corrupt assessment data even when the page has an explained access failure', async () => {
      const { fixture, inventory, report, resultsDir, auditFile } =
         await createSavedAssessment(roots);
      const page = inventory.pages[0];
      if (!page) {
         throw new Error('Missing report page fixture.');
      }
      page.auditStatus = 'error';
      page.error = { code: 'authentication-required', message: 'Sign-in is required.' };
      await saveAudit(auditFile, report);
      await writeFile(fixture.file, '{broken evidence}\n');
      const loaded = await loadPageAuditReports(inventory, resultsDir);

      expect(loaded[0]?.assessmentError).toBeTruthy();
      expect(() => assertReportReady(inventory, loaded)).toThrow(
         'Repair the assessment data',
      );
   });
   it('loads post-scan judgments from a custom run path and honors corrections and clears', async () => {
      const { fixture, inventory, report, resultsDir, auditFile } =
         await createSavedAssessment(roots);
      await saveAudit(auditFile, report);
      const accepted = await recordEvidence(fixture.record, fixture);
      const initial = await loadPageAuditReports(inventory, resultsDir);

      expect(initial[0]?.report?.recorded[0]?.outcome).toStrictEqual('passed');
      report.recorded = [accepted.record];
      await saveAudit(auditFile, report);
      await recordEvidence(
         { ...fixture.record, outcome: 'failed', recordedAt: new Date().toISOString() },
         fixture,
      );
      const corrected = await loadPageAuditReports(inventory, resultsDir);

      expect(
         corrected[0]?.report?.criteria.find((criterion) => criterion.id === '4.1.1')
            ?.recordedOutcome,
      ).toStrictEqual('failed');
      await clearEvidence(undefined, fixture);
      const cleared = await loadPageAuditReports(inventory, resultsDir);

      expect(cleared[0]?.report?.recorded).to.eql([]);
      expect(
         cleared[0]?.report?.criteria.find((criterion) => criterion.id === '4.1.1')
            ?.pending,
      ).toStrictEqual(true);
   });
   it('retains draft scans with an explicit missing-run error', async () => {
      const { fixture, inventory, report, resultsDir, auditFile } =
         await createSavedAssessment(roots);
      await saveAudit(auditFile, report);
      await rm(fixture.runFile);
      const loaded = await loadPageAuditReports(inventory, resultsDir, { draft: true });

      expect(loaded[0]?.report?.axe.url).toStrictEqual(fixture.run.target.value);
      expect(loaded[0]?.error).toContain('ENOENT');
      expect(loaded[0]?.report?.recorded).to.eql([]);
   });
});

describe('saved scan identity', () => {
   it.each(['page', 'version', 'level'])('rejects a different saved %s', async (kind) => {
      const { inventory, report, resultsDir, auditFile } =
         await createSavedAssessment(roots);
      if (kind === 'page') {
         report.axe.url = 'https://createdbyfireside.com/another-page';
      } else if (kind === 'version') {
         report.axe.wcagVersion = '2.2';
      } else {
         report.axe.selection = { kind: 'level', level: 'A', resolvedRuleIds: [] };
      }
      await saveAudit(auditFile, report);
      const loaded = await loadPageAuditReports(inventory, resultsDir);

      expect(loaded[0]?.report).toBeUndefined();
      expect(loaded[0]?.error).toMatch(/another page|different WCAG/);
   });
});

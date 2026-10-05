import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { siteInventorySchema, type SiteInventory } from '@a11ied/contracts';
import { createEvidenceTestAssessment } from '../evidence/test-fixtures.js';
import type { AuditReport } from '../audit/runtime.js';
import { updateAuditRun } from '../audit/run-store.js';
import { writeInventoryAtomic } from '../discovery/runtime.js';

/** Supplies one completed criterion assessment for report validation fixtures. */
export function buildReportTestAudit(): AuditReport {
   return {
      axe: {
         url: 'https://example.test/',
         wcagVersion: '2.2',
         selection: { kind: 'level', level: 'AA', resolvedRuleIds: [] },
         ruleIds: [],
         violations: [],
         passes: [],
         incomplete: [],
         inapplicable: [],
      },
      tree: {
         pageTitle: 'Example',
         firstHeading: 'Example',
         counts: { landmarks: 1, headings: 1, links: 0, buttons: 0, formControls: 0 },
         headingLevels: [1],
         roles: ['main', 'heading'],
      },
      relevance: {
         signals: [],
         matrix: {
            version: '2.2',
            target: { kind: 'url', value: 'https://example.test/' },
            assessments: {},
         },
      },
      criteria: [
         {
            id: '1.4.3',
            title: 'Contrast (Minimum)',
            level: 'AA',
            axeVerdict: 'pass',
            relevance: 'relevant',
            testMethod: 'hybrid',
            evidenceMode: 'hybrid',
            procedureIds: ['axe_scan', 'manual_review'],
            pending: false,
            recordedOutcome: 'passed',
         },
      ],
      recorded: [],
   };
}

export function buildReportTestInventory(): SiteInventory {
   return siteInventorySchema.parse({
      version: '1',
      startUrl: 'https://example.test/',
      generatedAt: '2026-09-16T12:00:00.000Z',
      run: {
         runId: 'run-1',
         originKey: 'example-test-a1b2c3d4',
         phase: 'report-building',
         startedAt: '2026-09-16T12:00:00.000Z',
         updatedAt: '2026-09-16T12:05:00.000Z',
         scope: 'site',
         optionsChosen: {
            auditMode: 'full',
            probeErrorPages: true,
            parallelAutomatedAudit: false,
            capturePageArtifacts: false,
         },
      },
      discovery: {
         complete: true,
         maxPages: 2000,
         maxSitemaps: 50,
         sources: [],
         failures: [],
      },
      pages: [
         {
            pageId: 'home-a1b2c3d4',
            url: 'https://example.test/',
            finalUrl: 'https://example.test/',
            status: 200,
            discoveredVia: 'crawl',
            requiresAuth: false,
            hasDestructiveActions: false,
            discoveryStatus: 'resolved',
            auditStatus: 'audited',
         },
      ],
      templates: [],
   });
}

/** Persists unfinished results, an unscanned page, and an alias for report checks. */
export async function writeReportTestDraft(directory: string): Promise<{
   inventoryPath: string;
   resultsDir: string;
}> {
   const inventory = buildReportTestInventory(),
      inventoryPath = resolve(directory, 'inventory.json'),
      report = buildReportTestAudit(),
      resultsDir = resolve(directory, 'pages');
   const [page] = inventory.pages,
      [criterion] = report.criteria;
   if (!page || !criterion) {
      throw new Error('The report fixture needs a page and criterion.');
   }
   page.auditStatus = 'in-progress';
   criterion.pending = true;
   inventory.run.phase = 'auditing';
   inventory.pages.push(
      {
         ...page,
         pageId: 'unscanned-b2c3d4e5',
         url: 'https://example.test/other',
         finalUrl: 'https://example.test/other',
      },
      {
         ...page,
         pageId: 'alias-c3d4e5f6',
         url: 'http://example.test/',
         auditStatus: 'skipped-duplicate',
         isDuplicateOf: page.pageId,
      },
      {
         ...page,
         pageId: 'sampled-d4e5f6g7',
         url: 'https://example.test/sampled',
         finalUrl: 'https://example.test/sampled',
         auditStatus: 'not-tested',
      },
   );
   await writeInventoryAtomic(inventory, inventoryPath);
   const now = new Date().toISOString();
   const envelope = JSON.stringify({
      ok: true,
      command: { family: 'audit', subcommand: '', version: '0.1.0' },
      result: report,
      warnings: [],
      errors: [],
      meta: { schemaVersion: '1', startedAt: now, completedAt: now, durationMs: 0 },
   });
   await Promise.all(
      [page.pageId, 'alias-c3d4e5f6', 'sampled-d4e5f6g7'].map(async (pageId) => {
         await mkdir(resolve(resultsDir, pageId), { recursive: true });
         await writeFile(resolve(resultsDir, pageId, 'audit.json'), envelope, 'utf8');
      }),
   );
   return { inventoryPath, resultsDir };
}

/** Couple a saved scan to a validated evidence run for report integration checks. */
export async function createSavedAssessment(roots: string[]): Promise<{
   fixture: Awaited<ReturnType<typeof createEvidenceTestAssessment>>;
   inventory: ReturnType<typeof buildReportTestInventory>;
   report: AuditReport;
   resultsDir: string;
   auditFile: string;
}> {
   const fixture = await createEvidenceTestAssessment();
   const inventory = buildReportTestInventory(),
      page = inventory.pages[0],
      report = buildReportTestAudit(),
      root = dirname(fixture.runFile);
   roots.push(root);
   if (!page) {
      throw new Error('Missing report page fixture.');
   }
   inventory.startUrl = fixture.run.target.value;
   Object.assign(inventory.run, {
      runId: fixture.run.runId,
      profile: fixture.run.profile,
      assessmentFile: fixture.runFile,
   });
   Object.assign(page, {
      url: fixture.run.target.value,
      finalUrl: fixture.run.target.value,
   });
   Object.assign(report.axe, {
      url: fixture.run.target.value,
      wcagVersion: fixture.run.profile.wcagVersion,
   });
   Object.assign(report.relevance.matrix, {
      version: fixture.run.profile.wcagVersion,
      target: fixture.run.target,
   });
   const resultsDir = join(root, 'custom', 'pages');
   const auditFile = join(resultsDir, page.pageId, 'audit.json');
   await mkdir(dirname(auditFile), { recursive: true });
   return { fixture, inventory, report, resultsDir, auditFile };
}

/** Store a real CLI envelope so report tests exercise the saved artifact boundary. */
export async function saveAudit(auditFile: string, report: AuditReport): Promise<void> {
   const now = new Date().toISOString();
   await writeFile(
      auditFile,
      JSON.stringify({
         ok: true,
         command: { family: 'audit', subcommand: '', version: '0.1.0' },
         result: report,
         warnings: [],
         errors: [],
         meta: { schemaVersion: '1', startedAt: now, completedAt: now, durationMs: 0 },
      }),
   );
}

/** Bind saved inventory and evidence to the same run for report integration checks. */
export async function createCoupledReport(roots: string[]): Promise<
   Awaited<ReturnType<typeof createSavedAssessment>> & {
      inventoryPath: string;
      outDir: string;
   }
> {
   const saved = await createSavedAssessment(roots);
   const root = dirname(saved.fixture.runFile);
   const inventoryPath = join(root, 'inventory.json');
   await updateAuditRun({
      file: saved.fixture.runFile,
      change(run) {
         run.inventoryPath = inventoryPath;
         return run;
      },
   });
   await writeInventoryAtomic(saved.inventory, inventoryPath);
   await saveAudit(saved.auditFile, saved.report);
   return { ...saved, inventoryPath, outDir: join(root, 'report') };
}

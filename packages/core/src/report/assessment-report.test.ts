import { readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ReportModel } from '@a11ied/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearEvidence, recordEvidence } from '../evidence/store.js';
import { transitionAssessmentCheck } from '../audit/run-state.js';
import * as lifecycle from '../audit/run-lifecycle.js';
import * as criteriaRollup from '../audit/criteria-rollup.js';
import { writeInventoryAtomic } from '../discovery/inventory.js';
import { buildReportBundle } from './runtime.js';
import { renderHtmlReport } from './render-html.js';
import { createCoupledReport } from './test-fixtures.js';

const roots: string[] = [];
afterEach(async () => {
   vi.restoreAllMocks();
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function assertSharedReportSnapshot(): Promise<void> {
   const saved = await createCoupledReport(roots);
   const recorded = await recordEvidence(saved.fixture.record, saved.fixture);
   await transitionAssessmentCheck({
      file: saved.fixture.runFile,
      checkId: recorded.record.provenance?.checkId ?? '',
      status: 'evaluated',
      outcome: 'passed',
      evidenceIds: [recorded.record.evidenceId ?? ''],
   });
   const original = lifecycle.getAuditAssessmentSnapshot;
   const captured = vi
      .spyOn(lifecycle, 'getAuditAssessmentSnapshot')
      .mockImplementation(async (file) => {
         const snapshot = await original(file);
         await clearEvidence(undefined, saved.fixture);
         return snapshot;
      });
   const result = await buildReportBundle({
      ...saved,
      draft: true,
      formats: ['json'],
      version: '0.1.0',
   });
   const current = await lifecycle.getAuditAssessmentStatus(saved.fixture.runFile);

   expect(captured).toHaveBeenCalledTimes(1);
   expect(result.model.assessment?.coverage.assessed).toStrictEqual(1);
   expect(result.model.pages[0]?.recorded).toHaveLength(1);
   expect(result.model.pages[0]?.recorded[0]?.verification?.status).toStrictEqual(
      'verified',
   );
   expect(current.coverage.assessed).toStrictEqual(0);
   expect(result.model.assessment?.complete).toStrictEqual(false);
   expect(result.model.discovery.auditedPages).toStrictEqual(0);
}

async function assertScopedReportInventory(): Promise<void> {
   const saved = await createCoupledReport(roots);
   const copy = join(dirname(saved.fixture.runFile), 'other-inventory.json');
   saved.inventory.discovery.complete = false;
   await writeInventoryAtomic(saved.inventory, copy);

   await expect(
      buildReportBundle({
         ...saved,
         inventoryPath: copy,
         draft: true,
         formats: ['json'],
         version: '0.1.0',
      }),
   ).rejects.toThrow('inventory registered');
}

async function assertNormalizedReportIdentity(): Promise<void> {
   const saved = await createCoupledReport(roots);
   saved.inventory.startUrl = saved.inventory.startUrl.replace(/\/$/u, '');
   await writeInventoryAtomic(saved.inventory, saved.inventoryPath);
   const result = await buildReportBundle({
      ...saved,
      draft: true,
      formats: ['json'],
      version: '0.1.0',
   });

   expect(result.model.assessment?.runId).toStrictEqual(saved.fixture.run.runId);
   expect(result.model.assessment?.complete).toStrictEqual(false);
   expect(result.model.warnings.join(' ')).not.toContain('different identities');
}

async function assertUnavailableAssessment(kind: string): Promise<void> {
   const saved = await createCoupledReport(roots);
   await (kind === 'missing-run'
      ? rm(saved.fixture.runFile)
      : writeFile(
           kind === 'corrupt-run' ? saved.fixture.runFile : saved.fixture.file,
           'invalid JSON',
        ));
   const result = await buildReportBundle({
      ...saved,
      draft: true,
      formats: ['json'],
      version: '0.1.0',
   });

   expect(result.model.discovery.scannedPages).toStrictEqual(1);
   expect(result.model.assessment).toBeUndefined();
   expect(result.model.pages[0]?.recorded).to.eql([]);
   expect(result.model.warnings.join(' ')).toContain(
      'assessment completion could not be verified',
   );
   await expect(
      buildReportBundle({ ...saved, formats: ['json'], version: '0.1.0' }),
   ).rejects.toThrow();
}

function assertBehavioralFinding(model: ReportModel): void {
   const finding = model.pages[0]?.findings[0];

   expect(model.discovery.scannedPages).toStrictEqual(0);
   expect(model.methodology.automated).toStrictEqual(false);
   expect(finding?.source).toStrictEqual('behavioral');
   expect(finding?.impact).toStrictEqual('unknown');
   expect(finding?.title).toStrictEqual('Duplicate element IDs');
   expect(finding?.guidance).toStrictEqual('Give each element a unique ID.');
   expect(finding?.context?.states).toHaveLength(1);
   expect(finding?.reproduction).to.eql(['Validate rendered markup: checked']);
   expect(finding?.evidence?.provenance?.source).toStrictEqual('browser');
   expect(finding?.artifactLinks.length).toBeGreaterThan(0);
}

async function assertBehavioralArtifacts(
   model: ReportModel,
   outDir: string,
): Promise<void> {
   await Promise.all(
      (model.pages[0]?.findings[0]?.artifactLinks ?? []).map(async (artifact) => {
         const bytes = await readFile(join(outDir, artifact.href));

         expect(bytes.length).toBeGreaterThan(0);
      }),
   );
   const html = renderHtmlReport(model);
   const earl = await readFile(join(outDir, 'report.earl.json'), 'utf8');

   expect(html).toContain('Severity: Not assessed');
   expect(html).toContain('&lt;observed&gt;');
   expect(html).toContain('Collected through browser');
   expect(earl).toContain('earl:failed');
   expect(earl).toContain('Give each element a unique ID.');
}

async function assertArtifactSymlinkSafety(
   saved: Awaited<ReturnType<typeof createCoupledReport>>,
   model: ReportModel,
): Promise<void> {
   const artifact = model.pages[0]?.findings[0]?.artifactLinks[0];
   if (!artifact) {
      throw new Error('The behavioral fixture needs an exported artifact.');
   }
   const artifactPath = join(saved.outDir, artifact.href),
      sentinel = join(dirname(saved.outDir), 'unrelated-artifact.json');
   const original = await readFile(artifactPath);
   await writeFile(sentinel, 'Keep unrelated bytes');
   await rm(artifactPath);
   await symlink(sentinel, artifactPath);
   await buildReportBundle({
      ...saved,
      draft: true,
      formats: ['json'],
      version: '0.1.0',
   });

   expect(await readFile(sentinel, 'utf8')).toStrictEqual('Keep unrelated bytes');
   expect(await readFile(artifactPath)).to.eql(original);
}

async function assertBehavioralReport(): Promise<void> {
   const note = 'The document has duplicate IDs <observed>.',
      saved = await createCoupledReport(roots);
   Object.assign(saved.fixture.record, {
      outcome: 'failed',
      note,
      finding: {
         title: 'Duplicate element IDs',
         userImpact: note,
         remediation: 'Give each element a unique ID.',
      },
   });
   const page = saved.inventory.pages[0];
   if (!page) {
      throw new Error('The fixture needs a discovered page.');
   }
   Object.assign(page, {
      auditStatus: 'not-tested',
      url: saved.fixture.run.target.value.replace(/\/$/u, ''),
      finalUrl: `${saved.fixture.run.target.value}redirected`,
   });
   await writeInventoryAtomic(saved.inventory, saved.inventoryPath);
   const recorded = await recordEvidence(saved.fixture.record, saved.fixture);
   await transitionAssessmentCheck({
      file: saved.fixture.runFile,
      checkId: recorded.record.provenance?.checkId ?? '',
      status: 'evaluated',
      outcome: 'failed',
      evidenceIds: [recorded.record.evidenceId ?? ''],
   });
   await rm(saved.auditFile);
   const result = await buildReportBundle({
      ...saved,
      draft: true,
      formats: ['json', 'earl'],
      version: '0.1.0',
   });
   assertBehavioralFinding(result.model);
   await assertBehavioralArtifacts(result.model, saved.outDir);
   await assertArtifactSymlinkSafety(saved, result.model);
}

function isolateFailedCriterion(): void {
   const original = criteriaRollup.buildCriteriaRollup;
   vi.spyOn(criteriaRollup, 'buildCriteriaRollup').mockImplementation((input) =>
      original(input).filter((criterion) => criterion.id === '4.1.1'),
   );
}

async function assertPendingFailureCannotComplete(): Promise<void> {
   const saved = await createCoupledReport(roots);
   saved.fixture.record.outcome = 'failed';
   const recorded = await recordEvidence(saved.fixture.record, saved.fixture);
   await transitionAssessmentCheck({
      file: saved.fixture.runFile,
      checkId: recorded.record.provenance?.checkId ?? '',
      status: 'evaluated',
      outcome: 'failed',
      evidenceIds: [recorded.record.evidenceId ?? ''],
   });
   const snapshot = await lifecycle.getAuditAssessmentSnapshot(saved.fixture.runFile);
   snapshot.status.complete = true;
   snapshot.status.progress.pages = snapshot.status.progress.pages.map((page) => ({
      ...page,
      complete: true,
   }));
   vi.spyOn(lifecycle, 'getAuditAssessmentSnapshot').mockResolvedValue(snapshot);
   isolateFailedCriterion();
   const result = await buildReportBundle({
      ...saved,
      draft: true,
      formats: ['json'],
      version: '0.1.0',
   });
   const criterion = result.model.pages[0]?.criteria.find(
      (entry) => entry.criterionId === '4.1.1',
   );

   expect(result.model.pages[0]?.criteria).toHaveLength(1);
   expect(criterion).toMatchObject({ outcome: 'failed', pending: true });
   expect(result.model.pages[0]?.auditStatus).toStrictEqual('in-progress');
   expect(result.model.assessment?.complete).toStrictEqual(false);
}

describe('coordinator report snapshots', () => {
   it(
      'keeps failed criteria visible without certifying their missing scanner coverage',
      assertPendingFailureCannotComplete,
   );
   it.each(['missing-run', 'corrupt-run', 'corrupt-evidence'])(
      'preserves draft scanner results with unavailable %s data',
      assertUnavailableAssessment,
   );

   it(
      'reports accepted behavioral failures and bundles their proof when a scan is unavailable',
      assertBehavioralReport,
   );

   it('keeps a verified but unaccepted judgment out of primary findings', async () => {
      const saved = await createCoupledReport(roots);
      saved.fixture.record.outcome = 'failed';
      await recordEvidence(saved.fixture.record, saved.fixture);
      const result = await buildReportBundle({
         ...saved,
         draft: true,
         formats: ['json'],
         version: '0.1.0',
      });

      expect(
         result.model.pages[0]?.findings.some(
            (finding) => finding.source === 'behavioral',
         ),
      ).toStrictEqual(false);
      expect(result.model.pages[0]?.recorded[0]?.verification?.status).toStrictEqual(
         'unverified',
      );
      expect(result.model.warnings.join(' ')).toContain('not been accepted');
   });

   it(
      'keeps coverage and records from one capture across evidence clearing',
      assertSharedReportSnapshot,
   );
   it(
      'rejects a different inventory even when its run metadata matches',
      assertScopedReportInventory,
   );
   it(
      'uses coordinator normalization for equivalent target URLs',
      assertNormalizedReportIdentity,
   );
});

import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { ReportFormat, ReportModel, SiteInventory } from '@a11ied/contracts';

import { getCanonicalPath } from '../files/atomic-json.js';
import { readInventory } from '../discovery/runtime.js';
import {
   buildAggregateEarlReport,
   buildReportModel,
   loadPageAuditReports,
} from './aggregate.js';
import { renderHtmlReport } from './render-html.js';
import { renderPdfReport } from './render-pdf.js';
import { assertReportReady } from './readiness.js';
import { exportFindingEvidence } from './finding-evidence.js';
import type { LoadedPageAudit } from './loaded-audits.js';
import { getAuditAssessmentSnapshot } from '../audit/run-lifecycle.js';
import type { AuditAssessmentSnapshot } from '../audit/run-status.js';
import { CliUsageError } from '../errors/cli-errors.js';
import { publishReportBundle } from './publication.js';
import { isVerifiedEvidence } from '../evidence/validation.js';

const JSON_INDENT = 3;

export interface BuildReportBundleOptions {
   inventoryPath: string;
   resultsDir: string;
   outDir: string;
   title?: string | undefined;
   formats?: ReportFormat[] | undefined;
   draft?: boolean | undefined;
   version: string;
}

async function readReportSnapshot(
   file: string,
   draft: boolean,
): Promise<{
   assessment?: AuditAssessmentSnapshot;
   assessmentError?: string;
}> {
   try {
      return { assessment: await getAuditAssessmentSnapshot(file) };
   } catch (error) {
      if (!draft) {
         throw error;
      }
      return { assessmentError: error instanceof Error ? error.message : String(error) };
   }
}

async function readReportContext(
   inventoryPath: string,
   draft: boolean,
): Promise<{
   inventory: SiteInventory;
   assessment?: AuditAssessmentSnapshot;
   assessmentError?: string;
}> {
   const inventory = await readInventory(inventoryPath);
   if (!inventory.run.assessmentFile) {
      return { inventory };
   }
   const snapshot = await readReportSnapshot(inventory.run.assessmentFile, draft);
   const { assessment } = snapshot;
   if (!assessment) {
      return { inventory, ...snapshot };
   }
   const run = assessment.status.run;
   if (
      !assessment.inventory ||
      !run.inventoryPath ||
      (await getCanonicalPath(run.inventoryPath)) !==
         (await getCanonicalPath(inventoryPath)) ||
      run.runId !== inventory.run.runId
   ) {
      throw new CliUsageError(
         'audit-report-inventory-mismatch',
         'Build the report from the inventory registered with this assessment run.',
      );
   }
   return { inventory: assessment.inventory, assessment };
}

function applyReportProgress(
   model: ReportModel,
   assessment: AuditAssessmentSnapshot,
): void {
   for (const page of model.pages) {
      const progress = assessment.status.progress.pages.find(
         (entry) => entry.id === page.pageId,
      );
      if (
         progress?.complete &&
         !page.error &&
         page.criteria.length > 0 &&
         page.criteria.every(
            (criterion) =>
               !criterion.pending &&
               criterion.outcome !== 'notTested' &&
               criterion.outcome !== 'cantTell',
         ) &&
         page.auditStatus !== 'skipped-duplicate'
      ) {
         page.auditStatus = 'audited';
      } else if (
         page.auditStatus === 'audited' ||
         (page.auditStatus === 'not-tested' && (progress?.assessed ?? 0) > 0)
      ) {
         page.auditStatus = 'in-progress';
      }
   }
   model.discovery.auditedPages = model.pages.filter(
      (page) => page.auditStatus === 'audited',
   ).length;
   for (const template of model.templates) {
      const members = [...template.auditedPageIds, ...template.notTestedPageIds];
      template.auditedPageIds = members.filter((id) =>
         model.pages.some((page) => page.pageId === id && page.auditStatus === 'audited'),
      );
      template.notTestedPageIds = members.filter(
         (id) => !template.auditedPageIds.includes(id),
      );
   }
}

function applyReportAssessment(
   model: ReportModel,
   assessment?: AuditAssessmentSnapshot,
   assessmentError?: string,
): void {
   if (!assessment) {
      model.warnings.push(
         assessmentError
            ? `Assessment data is unavailable: ${assessmentError}. This draft contains saved scanner results; assessment completion could not be verified.`
            : 'No coordinated assessment was supplied. Scanner results and recorded judgments do not establish complete audit coverage.',
      );
      return;
   }
   const { status } = assessment;
   applyReportProgress(model, assessment);
   const complete =
      status.complete && model.discovery.auditedPages === model.discovery.discoveredPages;
   model.assessment = {
      runId: status.run.runId,
      revision: status.run.revision,
      complete,
      coverage: status.coverage,
      issues: [...status.issues],
      progress: status.progress,
   };
   if (!complete) {
      if (status.complete) {
         model.assessment.issues.push({
            code: 'audit-report-coverage-incomplete',
            message:
               'Scanner or procedure coverage remains unresolved for discovered pages.',
         });
      }
      model.warnings.push(
         `Assessment is incomplete: ${String(status.coverage.assessed)} of ${String(status.coverage.total)} required and additional checks are assessed.`,
      );
   }
}

async function writeJsonFile(
   outDir: string,
   name: string,
   value: unknown,
): Promise<string> {
   const path = resolve(outDir, name);
   await writeFile(path, `${JSON.stringify(value, undefined, JSON_INDENT)}\n`, 'utf8');
   return path;
}

async function writeRenderedReports(input: {
   formats: Set<ReportFormat>;
   html: string;
   outDir: string;
   finalDirectory: string;
}): Promise<string[]> {
   const { formats, html, outDir } = input,
      htmlPath = resolve(outDir, 'report.html'),
      outputFiles: string[] = [];
   if (formats.has('html') || formats.has('pdf')) {
      await writeFile(htmlPath, html, 'utf8');
   }
   if (formats.has('html')) {
      outputFiles.push(htmlPath);
   }
   if (formats.has('pdf')) {
      const pdfPath = resolve(outDir, 'report.pdf');
      await renderPdfReport(html, pdfPath, resolve(input.finalDirectory, 'report.html'));
      outputFiles.push(pdfPath);
      if (!formats.has('html')) {
         await unlink(htmlPath);
      }
   }
   return outputFiles;
}

async function buildReportData(options: BuildReportBundleOptions): Promise<{
   model: ReportModel;
   pageReports: LoadedPageAudit[];
   assessment?: AuditAssessmentSnapshot | undefined;
   runFile?: string | undefined;
}> {
   const { inventory, assessment, assessmentError } = await readReportContext(
      options.inventoryPath,
      options.draft ?? false,
   );
   const pageReports = await loadPageAuditReports(inventory, options.resultsDir, {
      draft: options.draft,
      ...(assessment ? { assessment } : {}),
   });
   if (!options.draft) {
      assertReportReady(inventory, pageReports);
   }
   const model = buildReportModel(inventory, pageReports, options.title);
   applyReportAssessment(model, assessment, assessmentError);
   model.status = options.draft ? 'draft' : 'final';
   return { model, pageReports, assessment, runFile: inventory.run.assessmentFile };
}

async function writeReportBundle(
   options: BuildReportBundleOptions,
   finalDirectory: string,
   data: Awaited<ReturnType<typeof buildReportData>>,
): Promise<{ model: ReportModel; outputFiles: string[] }> {
   const formats = new Set<ReportFormat>([
      'json',
      ...(options.formats ?? ['html', 'pdf', 'earl']),
   ]);
   const { model, pageReports } = data;
   await mkdir(options.outDir, { recursive: true });
   const artifacts = await exportFindingEvidence({ ...data, outDir: options.outDir });
   const outputFiles = [
         ...artifacts,
         await writeJsonFile(options.outDir, 'report.json', model),
      ],
      renderedFiles = await writeRenderedReports({
         formats,
         html: renderHtmlReport(model),
         outDir: options.outDir,
         finalDirectory,
      });
   outputFiles.push(...renderedFiles);
   if (formats.has('earl')) {
      outputFiles.push(
         await writeJsonFile(
            options.outDir,
            'report.earl.json',
            buildAggregateEarlReport(pageReports, {
               profile: 'report',
               version: options.version,
            }),
         ),
      );
   }
   return { model, outputFiles };
}

/** Stage and verify a whole report generation before replacing its published directory. */
export async function buildReportBundle(
   options: BuildReportBundleOptions,
): Promise<{ model: ReportModel; outputFiles: string[] }> {
   const data = await buildReportData(options);
   const artifactRoot = data.runFile ? dirname(data.runFile) : undefined,
      protectedPaths = [
         options.inventoryPath,
         options.resultsDir,
         ...(data.runFile ? [data.runFile] : []),
      ];
   if (data.assessment && artifactRoot) {
      protectedPaths.push(
         ...data.assessment.records
            .filter(isVerifiedEvidence)
            .flatMap(
               (record) =>
                  record.provenance?.artifacts.map((artifact) =>
                     resolve(artifactRoot, artifact.path),
                  ) ?? [],
            ),
      );
   }
   return publishReportBundle({
      outDir: options.outDir,
      protectedPaths,
      build: (stage, finalDirectory) =>
         writeReportBundle({ ...options, outDir: stage }, finalDirectory, data),
   });
}

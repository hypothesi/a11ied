import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ReportFormat, ReportModel } from '@a11ied/contracts';

import { readInventory } from '../discovery/runtime.js';
import {
   buildAggregateEarlReport,
   buildReportModel,
   loadPageAuditReports,
} from './aggregate.js';
import { renderHtmlReport } from './render-html.js';
import { renderPdfReport } from './render-pdf.js';

const JSON_INDENT = 3;

export interface BuildReportBundleOptions {
   inventoryPath: string;
   resultsDir: string;
   outDir: string;
   title?: string | undefined;
   formats?: ReportFormat[] | undefined;
   version: string;
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
      await renderPdfReport(html, pdfPath);
      outputFiles.push(pdfPath);
      if (!formats.has('html')) {
         await unlink(htmlPath);
      }
   }
   return outputFiles;
}

/** Builds the selected report files. JSON is always included as the render contract. */
export async function buildReportBundle(
   options: BuildReportBundleOptions,
): Promise<{ model: ReportModel; outputFiles: string[] }> {
   const formats = new Set<ReportFormat>([
      'json',
      ...(options.formats ?? ['html', 'pdf', 'earl']),
   ]);
   const inventory = await readInventory(options.inventoryPath),
      pageReports = await loadPageAuditReports(inventory, options.resultsDir);
   const model = buildReportModel(inventory, pageReports, options.title);
   await mkdir(options.outDir, { recursive: true });
   const outputFiles = [await writeJsonFile(options.outDir, 'report.json', model)],
      renderedFiles = await writeRenderedReports({
         formats,
         html: renderHtmlReport(model),
         outDir: options.outDir,
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

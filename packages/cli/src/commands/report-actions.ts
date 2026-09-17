import {
   axeFailOnImpactSchema,
   cliExitCodes,
   reportFormatSchema,
   type ReportFormat,
   type ReportModel,
} from '#contracts';
import { buildReportBundle } from '#core';
import { CLI_VERSION } from '../lib/constants.js';

const IMPACTS = ['minor', 'moderate', 'serious', 'critical'] as const;

export interface ReportBuildActionOptions {
   inventory: string;
   resultsDir: string;
   out: string;
   title?: string;
   formats?: string;
   failOn?: string;
   wcag?: string;
}

function resolveFormats(value: string | undefined): Set<ReportFormat> {
   const formats = (value ?? 'html,pdf,earl,json')
      .split(',')
      .map((format) => reportFormatSchema.parse(format.trim()));
   return new Set([...formats, 'json']);
}

function hasFailure(model: ReportModel, failOn: string | undefined): boolean {
   if (!failOn) {
      return Object.values(model.totals.violations).some((count) => count > 0);
   }
   const threshold = IMPACTS.indexOf(axeFailOnImpactSchema.parse(failOn));
   return IMPACTS.slice(threshold).some((impact) => model.totals.violations[impact] > 0);
}

export async function handleReportBuildAction(
   options: ReportBuildActionOptions,
): Promise<{ result: ReportModel & { outputFiles: string[] }; exitCode: number }> {
   const { model, outputFiles } = await buildReportBundle({
      inventoryPath: options.inventory,
      resultsDir: options.resultsDir,
      outDir: options.out,
      ...(options.title ? { title: options.title } : {}),
      formats: [...resolveFormats(options.formats)],
      version: CLI_VERSION,
   });
   return {
      result: { ...model, outputFiles },
      exitCode: hasFailure(model, options.failOn)
         ? cliExitCodes.assertion
         : cliExitCodes.success,
   };
}

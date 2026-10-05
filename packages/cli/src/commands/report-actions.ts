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
   draft?: boolean;
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
   const threshold = IMPACTS.indexOf(axeFailOnImpactSchema.parse(failOn ?? 'minor'));
   return model.pages.some((page) =>
      page.findings.some(
         (finding) =>
            finding.impact === 'unknown' || IMPACTS.indexOf(finding.impact) >= threshold,
      ),
   );
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
      draft: options.draft,
      version: CLI_VERSION,
   });
   return {
      result: { ...model, outputFiles },
      exitCode: hasFailure(model, options.failOn)
         ? cliExitCodes.assertion
         : cliExitCodes.success,
   };
}

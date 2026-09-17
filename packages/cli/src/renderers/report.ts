import { reportModelSchema, type CliOutputEnvelope } from '#contracts';

export function renderReportText(envelope: CliOutputEnvelope): string {
   const model = reportModelSchema.passthrough().parse(envelope.result);
   const files = Array.isArray(model.outputFiles)
      ? model.outputFiles.filter((file): file is string => typeof file === 'string')
      : [];
   return [
      `Built report for ${String(model.discovery.auditedPages)} audited pages.`,
      ...files.map((file) => `Wrote ${file}`),
   ].join('\n');
}

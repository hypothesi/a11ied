import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import type { Audit } from '../db.js';
import { renderHtmlReport, type EvidenceLink } from './html.js';
import { renderMarkdownReport } from './markdown.js';
import { buildAuditReport, type AuditReport } from './model.js';

const JSON_INDENT = 3;

export const REPORT_FORMATS = ['html', 'md', 'json'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

const IMAGE_TYPES: Readonly<Record<string, string>> = {
   '.png': 'image/png',
   '.jpg': 'image/jpeg',
   '.jpeg': 'image/jpeg',
   '.gif': 'image/gif',
   '.webp': 'image/webp',
};

export interface WriteReportOptions {
   formats?: readonly ReportFormat[] | undefined;
   /** Where to write. Defaults to `report/` inside the audit directory. */
   outDir?: string | undefined;
   /**
    * Inline screenshots so the HTML report is one file that can be sent on its own.
    * Defaults to true.
    */
   embedEvidence?: boolean | undefined;
}

export interface WrittenReport {
   report: AuditReport;
   files: string[];
}

/** Builds the function that turns a stored evidence path into a link for the report. */
export function createEvidenceResolver(
   audit: Audit,
   outDir: string,
   embed: boolean,
): (path: string) => EvidenceLink {
   return (path) => {
      const absolute = resolve(audit.dir, path);
      const mediaType = IMAGE_TYPES[extname(absolute).toLowerCase()];
      const label = relative(audit.dir, absolute);
      if (embed && mediaType !== undefined && existsSync(absolute)) {
         return {
            href: `data:${mediaType};base64,${readFileSync(absolute).toString('base64')}`,
            label,
            image: true,
         };
      }
      return { href: relative(outDir, absolute), label, image: mediaType !== undefined };
   };
}

/** Writes the audit report in each requested format and returns the file paths. */
export function writeAuditReport(
   audit: Audit,
   options: WriteReportOptions = {},
): WrittenReport {
   const report = buildAuditReport(audit);
   const outDir = resolve(options.outDir ?? join(audit.dir, 'report'));
   const formats = options.formats ?? REPORT_FORMATS;
   const renderers: Record<ReportFormat, () => string> = {
      html: () =>
         renderHtmlReport(report, {
            resolveEvidence: createEvidenceResolver(
               audit,
               outDir,
               options.embedEvidence ?? true,
            ),
         }),
      md: () => renderMarkdownReport(report),
      json: () => `${JSON.stringify(report, undefined, JSON_INDENT)}\n`,
   };
   mkdirSync(outDir, { recursive: true });
   const files = formats.map((format) => {
      const file = join(outDir, `audit-report.${format}`);
      writeFileSync(file, renderers[format]());
      return file;
   });
   return { report, files };
}

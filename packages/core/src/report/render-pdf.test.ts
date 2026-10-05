import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderPdfReport } from './render-pdf.js';

const BROWSER_TEST_TIMEOUT_MS = 90_000;
const PDF_MAGIC_LENGTH = 5;

describe('renderPdfReport', () => {
   it(
      'writes a PDF document',
      async () => {
         const directory = await mkdtemp(resolve(tmpdir(), 'a11ied-report-')),
            path = resolve(directory, 'staging', 'report.pdf');
         try {
            await renderPdfReport(
               '<!doctype html><html lang="en"><title>Report</title><body><main><h1>Report</h1><a href="artifacts/trace.json">Action trace</a></main></body></html>',
               path,
               resolve(directory, 'report.html'),
            );
            const bytes = await readFile(path);

            expect(bytes.subarray(0, PDF_MAGIC_LENGTH).toString()).toStrictEqual('%PDF-');
            expect(bytes.toString('latin1')).toContain(
               pathToFileURL(resolve(directory, 'artifacts/trace.json')).href,
            );
            expect(bytes.toString('latin1')).not.toContain(
               pathToFileURL(resolve(directory, 'staging', 'artifacts/trace.json')).href,
            );
         } finally {
            await rm(directory, { recursive: true, force: true });
         }
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

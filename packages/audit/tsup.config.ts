import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
   entry: ['src/index.ts'],
   format: ['esm'],
   dts: true,
   clean: true,
   // Node:sqlite exists only under the node: prefix, so the prefix must survive bundling.
   removeNodeProtocol: false,
   onSuccess: async (): Promise<void> => {
      // The report and dashboard read their stylesheets and script next to the bundle at runtime.
      await cp(
         resolve(import.meta.dirname, 'src/report/audit-report.scss'),
         resolve(import.meta.dirname, 'dist/audit-report.scss'),
      );
      await cp(
         resolve(import.meta.dirname, 'src/report/report-viewer.js'),
         resolve(import.meta.dirname, 'dist/report-viewer.js'),
      );
      await cp(
         resolve(import.meta.dirname, 'src/dashboard/audit-dashboard.scss'),
         resolve(import.meta.dirname, 'dist/audit-dashboard.scss'),
      );
   },
});

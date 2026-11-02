import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
   onSuccess: async (): Promise<void> => {
      await cp(
         resolve(import.meta.dirname, 'src/report/report.scss'),
         resolve(import.meta.dirname, 'dist/report.scss'),
      );
   },
});

import { writeFile } from 'node:fs/promises';

import { cliExitCodes } from '#contracts';
import type { AxeActionOptions } from './axe-actions.js';

const SARIF_INDENT = 2;

/**
 * Runs axe against every target and writes one merged SARIF 2.1.0 log, to `--out <file>`
 * when given or stdout otherwise. Sets `process.exitCode` from the combined verdict.
 */
export async function handleAxeSarifFormat(
   targets: string[],
   options: AxeActionOptions & { out?: string },
): Promise<void> {
   const [{ handleAxeAction }, { buildAxeSarifLog }] = await Promise.all([
      import('./axe-actions.js'),
      import('#core'),
   ]);

   const effectiveTargets = targets.length > 0 ? targets : [undefined];
   const reports = await Promise.all(
      effectiveTargets.map((target) => handleAxeAction(target, options)),
   );

   const sarifLog = buildAxeSarifLog(reports.map((report) => report.result));
   const output = `${JSON.stringify(sarifLog, undefined, SARIF_INDENT)}\n`;
   if (options.out) {
      await writeFile(options.out, output, 'utf8');
   } else {
      process.stdout.write(output);
   }

   const anyFailed = reports.some((report) => !report.result.verdict.passed);
   process.exitCode = anyFailed ? cliExitCodes.assertion : cliExitCodes.success;
}

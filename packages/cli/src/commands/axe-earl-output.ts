import { writeFile } from 'node:fs/promises';

import { cliExitCodes } from '#contracts';
import { CLI_VERSION } from '../lib/constants.js';
import type { AxeActionOptions } from './axe-actions.js';

const EARL_INDENT = 2;

/**
 * Runs axe against every target and writes one merged EARL 1.0 JSON-LD report, to `--out
 * <file>` when given or stdout otherwise. Sets `process.exitCode` from the combined
 * verdict.
 *
 * The `report` profile writes one assertion per failing element with a CSS selector in
 * `result.pointer`. A submission to the W3C uses the `act` profile instead, which the
 * conformance run produces.
 */
export async function handleAxeEarlFormat(
   targets: string[],
   options: AxeActionOptions & { out?: string },
): Promise<void> {
   const [{ handleAxeAction }, { buildAxeEarlReport }] = await Promise.all([
      import('./axe-actions.js'),
      import('#core'),
   ]);

   const effectiveTargets = targets.length > 0 ? targets : [undefined];
   const reports = await Promise.all(
      effectiveTargets.map((target) => handleAxeAction(target, options)),
   );

   const earlReport = buildAxeEarlReport(
      reports.map((report) => report.result),
      { profile: 'report', version: CLI_VERSION },
   );
   const output = `${JSON.stringify(earlReport, undefined, EARL_INDENT)}\n`;
   if (options.out) {
      await writeFile(options.out, output, 'utf8');
   } else {
      process.stdout.write(output);
   }

   const anyFailed = reports.some((report) => !report.result.verdict.passed);
   process.exitCode = anyFailed ? cliExitCodes.assertion : cliExitCodes.success;
}

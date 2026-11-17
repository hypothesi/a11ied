import { CLI_VERSION } from '../lib/constants.js';
import type { CheckActionOptions } from './check-actions.js';
import { writeOutputFile } from '../lib/write-output-file.js';

const EARL_INDENT = 2;

/**
 * Runs the check and writes one EARL 1.0 JSON-LD report of what the scan found, to `--out
 * <file>` when given or stdout otherwise. A criterion axe cannot decide is reported as
 * untested, never as passed.
 */
export async function handleCheckEarlFormat(
   target: string | undefined,
   options: CheckActionOptions & { out?: string },
): Promise<void> {
   const [{ runCheck }, { buildCheckEarlReport }] = await Promise.all([
      import('./check-actions.js'),
      import('#core'),
   ]);

   const run = await runCheck(target, options);
   const report = buildCheckEarlReport(run.check, {
      profile: 'report',
      version: CLI_VERSION,
   });
   const output = `${JSON.stringify(report, undefined, EARL_INDENT)}\n`;

   if (options.out) {
      await writeOutputFile(options.out, output);
   } else {
      process.stdout.write(output);
   }

   process.exitCode = run.exitCode;
}

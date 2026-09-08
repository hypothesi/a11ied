import { writeFile } from 'node:fs/promises';

import { CLI_VERSION } from '../lib/constants.js';
import type { AuditActionOptions } from './audit-actions.js';

const EARL_INDENT = 2;

/**
 * Runs the audit and writes one EARL 1.0 JSON-LD report holding both what axe decided and
 * what a person or an agent recorded, to `--out <file>` when given or stdout otherwise.
 *
 * This is the report to hand to someone who asked how accessible a page is. It carries
 * the manual results too, so a criterion axe cannot decide is not silently missing.
 */
export async function handleAuditEarlFormat(
   target: string | undefined,
   options: AuditActionOptions & { out?: string },
): Promise<void> {
   const [{ runAudit }, { buildAuditEarlReport }] = await Promise.all([
      import('./audit-actions.js'),
      import('#core'),
   ]);

   const run = await runAudit(target, options);
   const report = buildAuditEarlReport(run.report, {
      profile: 'report',
      version: CLI_VERSION,
   });
   const output = `${JSON.stringify(report, undefined, EARL_INDENT)}\n`;

   if (options.out) {
      await writeFile(options.out, output, 'utf8');
   } else {
      process.stdout.write(output);
   }

   process.exitCode = run.exitCode;
}

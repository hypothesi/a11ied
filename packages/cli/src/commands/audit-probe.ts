import type { Command } from 'commander';
import { z } from 'zod';
import type { CliOutputEnvelope } from '#contracts';
import { CliUsageError, runAuditProbes } from '#core';
import { executeCommand } from '../lib/execute.js';
import { addJsonOption, addVerboseOption } from '../lib/options.js';

interface ProbeOptions {
   json?: boolean;
   verbose?: boolean;
   limit?: string;
}

const probeResultSchema = z.object({
   attempted: z.number(),
   outcomes: z.record(z.string(), z.number()),
});

function renderProbeText(envelope: CliOutputEnvelope): string {
   const { attempted, outcomes } = probeResultSchema.parse(envelope.result);
   const counts = Object.entries(outcomes)
      .filter(([, count]) => count > 0)
      .map(([outcome, count]) => `${String(count)} ${outcome}`);
   return `Recorded ${String(attempted)} checks${counts.length > 0 ? `: ${counts.join(', ')}` : ''}.`;
}

function writeProgress(line: string): void {
   process.stderr.write(`${line}\n`);
}

function parseLimit(limit: string | undefined): number | undefined {
   if (limit === undefined) {
      return undefined;
   }
   const parsed = Number(limit);
   if (!Number.isInteger(parsed) || parsed < 1) {
      throw new CliUsageError(
         'audit-limit-invalid',
         '--limit must be a positive integer.',
      );
   }
   return parsed;
}

/** Lets a browser decide the checks it can, so an agent keeps only the judgments left. */
export function registerAuditProbeCommand(auditCommand: Command): void {
   const command = auditCommand
      .command('probe <run>')
      .summary('Decide the checks a browser can settle and record their evidence.')
      .description(
         'Claim each check the run environment supports, probe the page in a browser, and record verified evidence with its outcome. Criteria that need a screen reader, or a person, are left unclaimed.',
      )
      .option('--limit <n>', 'Stop after this many checks.')
      .addHelpText('after', '\nExample:\n  a1 audit probe .a11ied/site/run.json');
   addVerboseOption(addJsonOption(command)).action(
      async (file: string, options: ProbeOptions) => {
         await executeCommand(
            {
               family: 'audit',
               subcommand: 'probe',
               wcagVersion: undefined,
               json: options.json,
               verbose: options.verbose,
            },
            async () => {
               const result = await runAuditProbes({
                  file,
                  limit: parseLimit(options.limit),
                  onProgress: options.json ? undefined : writeProgress,
               });
               return { target: { kind: 'file', value: file }, result: { ...result } };
            },
            renderProbeText,
         );
      },
   );
}

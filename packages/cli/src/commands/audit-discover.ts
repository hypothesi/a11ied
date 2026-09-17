import type { Command } from 'commander';

import {
   addJsonOption,
   addStorageStateOption,
   addVerboseOption,
} from '../lib/options.js';
import {
   handleAuditDiscoverAction,
   type AuditDiscoverActionOptions,
} from './audit-discover-actions.js';

function buildAuditDiscoverCommand(auditCommand: Command): Command {
   return addStorageStateOption(
      addVerboseOption(
         addJsonOption(
            auditCommand
               .command('discover <url>')
               .summary('Discover pages for an accessibility audit.')
               .description(
                  'Build a deduplicated, resumable page inventory from sitemaps and rendered links.',
               )
               .option('--scope <scope>', 'page, section, or site. Defaults to site.')
               .option(
                  '--sitemap <url>',
                  'Use this sitemap URL in addition to robots.txt.',
               )
               .option('--sitemap-only', 'Do not follow rendered links.')
               .option('--max-pages <n>', 'Maximum rendered pages. Defaults to 2000.')
               .option('--max-sitemaps <n>', 'Maximum sitemap files. Defaults to 50.')
               .option(
                  '--concurrency <n>',
                  'Maximum concurrent page visits. Defaults to 5.',
               )
               .option('--timeout <ms>', 'Timeout for each request or page load.')
               .option(
                  '--include <glob...>',
                  'Include paths matching one of these globs.',
               )
               .option(
                  '--exclude <glob...>',
                  'Exclude paths matching one of these globs.',
               )
               .option(
                  '--probe-error-pages',
                  'Add one synthetic not-found page to the inventory.',
               )
               .option(
                  '--resume-from <file>',
                  'Continue from an existing inventory JSON file.',
               )
               .option(
                  '--artifacts-dir <dir>',
                  'Save approved HTML and accessibility tree artifacts here.',
               )
               .option(
                  '--out <file>',
                  'Write and incrementally update the inventory JSON file.',
               ),
         ),
      ),
   );
}

export function registerAuditDiscoverCommand(auditCommand: Command): void {
   const command = buildAuditDiscoverCommand(auditCommand);

   command.action(async (url: string, options: AuditDiscoverActionOptions) => {
      const [{ executeCommand }, renderers] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/index.js'),
      ]);
      await executeCommand(
         {
            family: 'audit',
            subcommand: 'discover',
            wcagVersion: undefined,
            json: options.json,
            verbose: options.verbose,
         },
         () => handleAuditDiscoverAction(url, options),
         renderers.renderAuditDiscoverText,
      );
   });
}

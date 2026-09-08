import type { Command } from 'commander';

import { searchResultKindSchema, type SearchResultKind } from '#contracts';

import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import { addLookupOptions } from '../lib/options.js';
import { runLookupCommand } from '../lib/run-lookup.js';

const DEFAULT_LIMIT = '10';
const RADIX = 10;

const SEARCH_EXAMPLES = `
Examples:
  a1 search combobox
  a1 search "focus order"
  a1 search "color contrast" --kind criterion
`;

interface SearchCommandOptions {
   json?: boolean;
   verbose?: boolean;
   limit: string;
   kind?: string;
}

function parseKind(value: string | undefined): SearchResultKind | undefined {
   if (value === undefined) {
      return undefined;
   }
   return searchResultKindSchema.parse(value);
}

/**
 * One search across both pinned corpora.
 *
 * A person searching for "combobox" wants the ARIA pattern, the criteria it bears on, and
 * the axe rule together, so there is one command rather than one per corpus. `--kind`
 * scopes it, and `--kind criterion` is what `a1 wcag search` used to do.
 */
export function registerSearchCommand(program: Command): void {
   addLookupOptions(
      program
         .command('search <query>')
         .helpGroup(TOP_LEVEL_GROUPS.lookUp)
         .summary('Search WCAG criteria and ARIA patterns together.')
         .description(
            'Search the pinned WCAG corpus and the ARIA Authoring Practices Guide, ranked, in one list.',
         )
         .option('--limit <count>', 'Limit the number of returned rows.', DEFAULT_LIMIT)
         .option(
            '--kind <kind>',
            `Only return rows of one kind: ${searchResultKindSchema.options.join(', ')}.`,
         )
         .addHelpText('after', SEARCH_EXAMPLES),
   ).action(async (query: string, options: SearchCommandOptions) => {
      const kind = parseKind(options.kind);
      await runLookupCommand({
         family: 'search',
         subcommand: 'search',
         json: options.json,
         verbose: options.verbose,
         buildResult: (core) =>
            core.searchAll(query, {
               limit: Number.parseInt(options.limit, RADIX),
               ...(kind === undefined ? {} : { kind }),
            }),
         renderText: (renderers) => renderers.renderUnifiedSearchText,
      });
   });
}

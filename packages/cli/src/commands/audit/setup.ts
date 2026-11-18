import {
   addPage,
   closeAudit,
   conformanceLevelSchema,
   excludePage,
   getAuditStatus,
   includePage,
   listAuditDirs,
   listPages,
   openAudit,
   platformSchema,
   startAudit,
   pageKindSchema,
   type Audit,
   type AuditStatus,
   type AuditPage,
} from '@a11ied/audit';
import type { Command } from 'commander';
import {
   addAuditOptions,
   collect,
   runAuditCommand,
   runCommand,
   splitList,
   type AuditBaseOptions,
} from './run.js';
import { table } from '../../lib/format.js';
import { renderPages } from './render.js';

const DEFAULT_MAX_PAGES = 50;

interface InitOptions {
   json?: boolean;
   name?: string;
   id?: string;
   platform?: string;
   level?: string;
   wcag?: string;
   criteria?: string;
   passes?: string;
   rule: string[];
   access?: string;
   page?: boolean;
}

interface PageAddOptions extends AuditBaseOptions {
   name?: string;
   kind?: string;
   notes?: string;
   group?: string;
   passes?: string;
}

interface DiscoverOptions extends AuditBaseOptions {
   maxPages?: string;
   include: string[];
   exclude: string[];
   storageState?: string;
   dryRun?: boolean;
}

interface ScanCommandOptions extends AuditBaseOptions {
   page: string[];
   concurrency?: string;
   timeout?: string;
   storageState?: string;
}

function describeNextSteps(status: AuditStatus): string[] {
   const { id, platform } = status.config;
   const discover =
      platform === 'web'
         ? "  a1 audit discover                 find the site's pages and add them"
         : '  a1 audit page add "<screen>"   add each screen or flow to audit';
   return [
      '',
      'Next:',
      ...(status.pages.active === 0 ? [discover] : []),
      ...(platform === 'web'
         ? ['  a1 audit scan                     run the automated checks on every page']
         : []),
      '  a1 audit next --worker <name>     claim a unit of work (run one per parallel worker)',
      '  a1 audit status                   check progress',
      `With several audits in one workspace, select this one: export A11IED_AUDIT=${id}`,
   ];
}

function initAudit(
   target: string,
   options: InitOptions,
): { dir: string; status: AuditStatus } {
   const audit = startAudit({
      target,
      name: options.name,
      id: options.id,
      platform: options.platform ? platformSchema.parse(options.platform) : undefined,
      level: options.level
         ? conformanceLevelSchema.parse(options.level.toUpperCase())
         : undefined,
      wcagVersion: options.wcag,
      criteria: splitList(options.criteria),
      passes: splitList(options.passes),
      rules: options.rule,
      access: options.access,
   });
   try {
      if (options.page) {
         addPage(audit, { locator: target });
      }
      return { dir: audit.dir, status: getAuditStatus(audit) };
   } finally {
      closeAudit(audit);
   }
}

function registerInit(parent: Command): void {
   parent
      .command('init <target>')
      .summary('Start an audit with a fixed scope.')
      .description(
         'Create an audit of a website, page, feature, or mobile app. The target is a URL, an ' +
            'app name, or a short description. The scope is every criterion at the chosen level ' +
            'unless --criteria or --passes narrows it.',
      )
      .option('--name <name>', 'Name shown in status and the report.')
      .option(
         '--id <id>',
         'Audit id and directory name. Defaults to a slug plus the date.',
      )
      .option('--platform <platform>', 'web, ios, or android. Defaults to web.')
      .option('--level <level>', 'Conformance level: A, AA, or AAA. Defaults to AA.')
      .option('--wcag <version>', 'WCAG version. Defaults to 2.2.')
      .option(
         '--criteria <list>',
         'Audit only these criteria, comma-separated, such as 1.4.3,2.4.7.',
      )
      .option(
         '--passes <list>',
         'Audit only the criteria of these test passes: semantics, keyboard, visual, media, forms, pointer, consistency.',
      )
      .option(
         '--rule <text>',
         'A restriction every worker must follow, such as "Do not submit the contact form". Repeatable.',
         collect,
         [],
      )
      .option(
         '--access <text>',
         'How to reach the target: environment, test account location, build, or device.',
      )
      .option('--page', 'Audit just this one page: add the target as the only page.')
      .option('--json', 'Print JSON instead of human-readable text.')
      .action(async (target: string, options: InitOptions) => {
         await runCommand({
            subcommand: 'init',
            json: options.json,
            work: () => initAudit(target, options),
            text: ({ dir, status }) =>
               [
                  `Created audit ${status.config.id} in ${dir}`,
                  `Scope: WCAG ${status.config.wcagVersion} ${status.config.level}, ${String(status.config.criteria.length)} criteria, ${String(status.units.total)} work units`,
                  ...describeNextSteps(status),
               ].join('\n'),
         });
      });
}

function registerList(parent: Command): void {
   parent
      .command('list')
      .summary('List the audits in this workspace.')
      .option('--json', 'Print JSON instead of human-readable text.')
      .action(async (options: { json?: boolean }) => {
         await runCommand({
            subcommand: 'list',
            json: options.json,
            work: () => ({
               audits: listAuditDirs().map((dir) => {
                  const audit = openAudit(dir);
                  try {
                     const status = getAuditStatus(audit, 1);
                     return {
                        id: status.config.id,
                        name: status.config.name,
                        phase: status.phase,
                        percentDone: status.units.percentDone,
                        findings: status.findings.total,
                        dir,
                     };
                  } finally {
                     closeAudit(audit);
                  }
               }),
            }),
            text: (result) =>
               result.audits.length === 0
                  ? 'No audits here. Start one with a1 audit init <target>.'
                  : table(
                       ['ID', 'Name', 'Phase', 'Done', 'Findings'],
                       result.audits.map((audit) => [
                          audit.id,
                          audit.name,
                          audit.phase,
                          `${String(audit.percentDone)}%`,
                          String(audit.findings),
                       ]),
                    ).join('\n'),
         });
      });
}

function addPageFromOptions(
   audit: Audit,
   locator: string,
   options: PageAddOptions,
): { page: AuditPage; units: AuditStatus['units'] } {
   const page = addPage(audit, {
      locator,
      name: options.name,
      kind: options.kind ? pageKindSchema.parse(options.kind) : undefined,
      notes: options.notes,
      group: options.group,
      passes: splitList(options.passes),
   });
   return { page, units: getAuditStatus(audit, 1).units };
}

function registerPage(parent: Command): void {
   const page = parent
      .command('page')
      .summary('Add, list, or exclude the pages, screens, states, and flows to audit.');
   addAuditOptions(
      page
         .command('add <locator>')
         .summary('Add a page, screen, state, or flow.')
         .description(
            'Add one thing to audit. The locator is a URL for a web page, or how to reach a ' +
               'screen, state, or flow. Use --notes for setup steps a worker must follow, ' +
               'such as "open the Filters dialog" or the steps of a checkout flow.',
         )
         .option('--name <name>', 'Short name shown in status and the report.')
         .option('--kind <kind>', 'page, screen, state, or flow. Defaults by platform.')
         .option('--notes <text>', 'Setup or flow steps a worker needs.')
         .option('--group <name>', 'Template or feature this page belongs to.')
         .option('--passes <list>', 'Run only these test passes on this page.'),
   ).action(async (locator: string, options: PageAddOptions) => {
      await runAuditCommand({
         subcommand: 'page add',
         options,
         work: (audit) => addPageFromOptions(audit, locator, options),
         text: ({ page: added }) => `Added ${added.id}: ${added.name}`,
      });
   });
   addAuditOptions(page.command('list').summary('List every page.')).action(
      async (options: AuditBaseOptions) => {
         await runAuditCommand({
            subcommand: 'page list',
            options,
            work: (audit) => ({ pages: listPages(audit) }),
            text: (result) => renderPages(result.pages),
         });
      },
   );
   addAuditOptions(
      page
         .command('exclude <page>')
         .summary('Take a page out of the audit, with the reason.')
         .requiredOption(
            '--reason <text>',
            'Why it is out of scope. Shown in the report.',
         ),
   ).action(async (pageId: string, options: AuditBaseOptions & { reason: string }) => {
      await runAuditCommand({
         subcommand: 'page exclude',
         options,
         work: (audit) => ({
            page: excludePage(audit, { pageId, reason: options.reason }),
         }),
         text: (result) => `Excluded ${result.page.id}: ${result.page.excludeReason}`,
      });
   });
   addAuditOptions(
      page.command('include <page>').summary('Put an excluded page back.'),
   ).action(async (pageId: string, options: AuditBaseOptions) => {
      await runAuditCommand({
         subcommand: 'page include',
         options,
         work: (audit) => ({ page: includePage(audit, pageId) }),
         text: (result) => `Included ${result.page.id}: ${result.page.name}`,
      });
   });
}

function registerDiscover(parent: Command): void {
   addAuditOptions(
      parent
         .command('discover [url]')
         .summary('Find the pages of a website and add them to the audit.')
         .description(
            'Read the sitemap and crawl same-origin links from the audit target or the given ' +
               'URL, then add each reachable page as a page. Review the list afterwards and ' +
               'exclude what is out of scope. For a large site, keep one page per template.',
         )
         .option(
            '--max-pages <count>',
            `Stop after this many pages. Defaults to ${String(DEFAULT_MAX_PAGES)}.`,
         )
         .option(
            '--include <pattern>',
            'Only URLs matching this pattern. Repeatable.',
            collect,
            [],
         )
         .option(
            '--exclude <pattern>',
            'Skip URLs matching this pattern. Repeatable.',
            collect,
            [],
         )
         .option(
            '--storage-state <file>',
            'Playwright authentication state for signed-in pages.',
         )
         .option('--dry-run', 'List what would be added without adding it.'),
   ).action(async (url: string | undefined, options: DiscoverOptions) => {
      await runAuditCommand({
         subcommand: 'discover',
         options,
         work: async (audit) => {
            const { discoverAuditPages } = await import('#core');
            const discovered = await discoverAuditPages(audit, {
               url,
               maxPages: options.maxPages
                  ? Number.parseInt(options.maxPages, 10)
                  : undefined,
               include: options.include,
               exclude: options.exclude,
               storageStatePath: options.storageState,
               dryRun: options.dryRun,
            });
            return { ...discovered };
         },
         text: (result) =>
            [
               `Found ${String(result.found)} pages; ${options.dryRun ? 'would add' : 'added'} ${String(result.added.length)}, ${String(result.alreadyPresent)} already in the audit.`,
               ...result.added.map((each) => `  + ${each}`),
               ...result.skipped.map((each) => `  - skipped ${each}`),
               ...(result.unloaded.length > 0
                  ? [
                       '',
                       'Added, but did not load during discovery. Check each is a real page:',
                       ...result.unloaded.map((each) => `  ! ${each}`),
                    ]
                  : []),
               '',
               'Review with a1 audit page list, then run a1 audit scan.',
            ].join('\n'),
      });
   });
}

function registerScan(parent: Command): void {
   addAuditOptions(
      parent
         .command('scan')
         .summary('Run the automated checks on every web page, in parallel.')
         .description(
            'Run axe-core and page measurements on each web page. Failures axe is certain of ' +
               'become findings. Everything else is stored as signals that workers see in their ' +
               'work packets. The scan never passes a criterion. Safe to run again.',
         )
         .option('--page <id>', 'Scan only this page. Repeatable.', collect, [])
         .option('--concurrency <count>', 'Pages to scan at once. Defaults to 4.')
         .option(
            '--timeout <ms>',
            'Page load timeout in milliseconds. Defaults to 30000.',
         )
         .option(
            '--storage-state <file>',
            'Playwright authentication state for signed-in pages.',
         ),
   ).action(async (options: ScanCommandOptions) => {
      await runAuditCommand({
         subcommand: 'scan',
         options,
         work: async (audit) => {
            const { scanAuditPages } = await import('#core');
            const pages = await scanAuditPages(audit, {
               pageIds: options.page.length > 0 ? options.page : undefined,
               concurrency: options.concurrency
                  ? Number.parseInt(options.concurrency, 10)
                  : undefined,
               timeoutMs: options.timeout
                  ? Number.parseInt(options.timeout, 10)
                  : undefined,
               storageStatePath: options.storageState,
            });
            return { pages, findings: getAuditStatus(audit, 1).findings };
         },
         text: (result) =>
            result.pages.length === 0
               ? 'No web pages to scan. The scan needs pages with http(s) locators.'
               : [
                    ...result.pages.map((page) =>
                       page.ok
                          ? `  ok     ${page.pageId} ${page.name}: ${String(page.findings)} automated finding(s)`
                          : `  FAILED ${page.pageId} ${page.name}: ${page.error ?? ''}`,
                    ),
                    `Findings so far: ${String(result.findings.total)}. Workers verify these and test what a scanner cannot.`,
                 ].join('\n'),
      });
   });
}

/** Registers the commands that create an audit and decide what it covers. */
export function registerSetupCommands(parent: Command): void {
   registerInit(parent);
   registerList(parent);
   registerPage(parent);
   registerDiscover(parent);
   registerScan(parent);
}

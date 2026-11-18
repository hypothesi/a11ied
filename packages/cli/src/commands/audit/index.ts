import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../../lib/help.js';
import { registerInspectCommands } from './inspect.js';
import { registerSetupCommands } from './setup.js';
import { registerWorkCommands } from './work.js';

const AUDIT_EXAMPLES = `
A full audit, start to finish:
  a1 audit init https://example.com --rule "Do not submit the contact form"
  a1 audit discover                      add the site's pages to the audit
  a1 audit scan                          automated checks, all pages in parallel
  a1 audit next --worker w1              each parallel worker claims and tests units
  a1 audit submit P1.keyboard --worker w1 --file result.json
  a1 audit status                        progress at any time; a1 audit dashboard for a live page
  a1 audit report                        HTML, Markdown, and JSON report

Narrower scopes:
  a1 audit init https://example.com/pricing --page                 one page
  a1 audit init https://example.com --criteria 1.4.3,2.4.7         chosen criteria
  a1 audit init "Acme iOS app" --platform ios --passes semantics   a mobile app, one pass
`;

/** Registers `a1 audit`: one workflow to start, run, track, and report an audit. */
export function registerAuditCommand(program: Command): void {
   const audit = program
      .command('audit')
      .helpGroup(TOP_LEVEL_GROUPS.fix)
      .summary('Run, track, and report a WCAG audit of a site, page, or app.')
      .description(
         'Run an agent-driven WCAG audit with durable progress. An audit is a set of pages ' +
            '(pages, screens, states, flows) and the success criteria in scope. Work is split ' +
            'into units, one test pass on one page, that parallel workers claim, test, and ' +
            'submit. Everything is stored in .a11ied/audits/<id>, so an audit survives crashes ' +
            'and restarts.',
      )
      .addHelpText('after', AUDIT_EXAMPLES);
   registerSetupCommands(audit);
   registerWorkCommands(audit);
   registerInspectCommands(audit);
}

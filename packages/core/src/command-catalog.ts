import type { CliCommand } from '@a11ied/contracts';

const cliCommands: CliCommand[] = [
   {
      name: 'wcag',
      summary: 'Query pinned WCAG criteria, test methods, and testing strategy data.',
      maturity: 'ready',
   },
   {
      name: 'pattern',
      summary:
         'Query the ARIA Authoring Practices Guide keyboard and attribute tables, and check a page against one.',
      maturity: 'ready',
   },
   {
      name: 'sr',
      summary:
         'Control VoiceOver, NVDA, or the virtual screen reader through stable screen-reader sessions.',
      maturity: 'ready',
   },
   {
      name: 'axe',
      summary: 'Run axe-core accessibility scans.',
      maturity: 'ready',
   },
   {
      name: 'tree',
      summary: 'Print the accessibility tree for a target.',
      maturity: 'ready',
   },
   {
      name: 'audit',
      summary:
         'Run axe, the accessibility tree, and the relevant criteria scan against a target.',
      maturity: 'ready',
   },
   {
      name: 'doctor',
      summary: 'Check the host for browser and screen reader readiness.',
      maturity: 'ready',
   },
   {
      name: 'setup',
      summary: 'Run the Guidepup setup steps this host still needs.',
      maturity: 'ready',
   },
   {
      name: 'mcp',
      summary: 'Expose the runtime over an MCP stdio server.',
      maturity: 'ready',
   },
];

/** Lists the shipped top-level CLI command families and their maturity labels. */
export function listCliCommands(): CliCommand[] {
   return cliCommands;
}

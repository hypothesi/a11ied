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
      name: 'talkback',
      summary:
         'Turn TalkBack on or off on an Android device over adb and record what it says.',
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
      name: 'check',
      summary:
         'Run axe, the accessibility tree, and the relevant criteria scan against one page.',
      maturity: 'ready',
   },
   {
      name: 'capture',
      summary: 'Screenshot a page at a viewport, zoom, focus stop, or opened state.',
      maturity: 'ready',
   },
   {
      name: 'audit',
      summary: 'Run, track, and report an agent-driven WCAG audit.',
      maturity: 'ready',
   },
   {
      name: 'doctor',
      summary: 'Check the host for browser and screen reader readiness.',
      maturity: 'ready',
   },
   {
      name: 'setup',
      summary:
         'Install a1 globally, add the skills and MCP server to AI agents, and run the Guidepup setup steps.',
      maturity: 'ready',
   },
   {
      name: 'update',
      summary: 'Check the npm registry for a newer a11ied and install it.',
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

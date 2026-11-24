interface DocLink {
   href: string;
   label: string;
}

interface DocSection {
   title: string;
   links: DocLink[];
}

export const REPOSITORY_URL = 'https://github.com/hypothesi/a11ied';

/** The order here is also the order of the previous and next links on each page. */
export const docsLinks: DocSection[] = [
   {
      title: 'Start',
      links: [
         { href: '/overview', label: 'Overview' },
         { href: '/quickstart', label: 'Quickstart' },
         { href: '/guides/demo', label: 'Practice on a broken page' },
      ],
   },
   {
      title: 'Concepts',
      links: [
         { href: '/screen-readers', label: 'Screen readers' },
         { href: '/test-methods', label: 'Test methods' },
         { href: '/relevant-criteria', label: 'Relevant criteria' },
      ],
   },
   {
      title: 'AI agents',
      links: [
         { href: '/guides/agents', label: 'Use with an AI agent' },
         { href: '/guides/agent-skill', label: 'Install the agent skill' },
         { href: '/guides/audit', label: 'Run an audit' },
      ],
   },
   {
      title: 'Test from the terminal',
      links: [
         { href: '/guides/screen-reader', label: 'Test with a screen reader' },
         { href: '/guides/violations', label: 'Fix an axe violation' },
         { href: '/guides/recording', label: 'Record a session' },
         { href: '/guides/troubleshooting', label: 'Troubleshooting' },
      ],
   },
   {
      title: 'Automate',
      links: [
         { href: '/guides/testing', label: 'Write screen reader tests' },
         { href: '/guides/vitest', label: 'Test with Vitest' },
         { href: '/guides/scripting', label: 'Script the CLI' },
         { href: '/guides/ci', label: 'Run in CI' },
      ],
   },
   {
      title: 'Reference',
      links: [
         { href: '/reference/cli', label: 'CLI' },
         { href: '/reference/mcp', label: 'MCP tools' },
         { href: '/reference/api', label: 'TypeScript API' },
         { href: '/reference/wcag-data', label: 'WCAG data' },
         { href: '/support', label: 'Feature support' },
      ],
   },
];

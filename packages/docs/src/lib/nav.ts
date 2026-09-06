interface DocLink {
   href: string;
   label: string;
}

interface DocSection {
   title: string;
   links: DocLink[];
}

export const docsLinks: DocSection[] = [
   {
      title: 'Start',
      links: [
         { href: '/', label: 'Overview' },
         { href: '/quickstart', label: 'Quickstart' },
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
      title: 'Guides',
      links: [
         { href: '/guides/screen-reader', label: 'Test with a screen reader' },
         { href: '/guides/testing', label: 'Write screen reader tests' },
         { href: '/guides/agents', label: 'Test from an AI agent' },
         { href: '/guides/agent-skill', label: 'Install the agent skill' },
         { href: '/guides/recording', label: 'Record a session' },
         { href: '/guides/violations', label: 'Understand a violation' },
         { href: '/guides/scripting', label: 'Script the CLI' },
         { href: '/guides/ci', label: 'Run in CI' },
         { href: '/guides/troubleshooting', label: 'Troubleshooting' },
      ],
   },
   {
      title: 'Reference',
      links: [
         { href: '/reference/cli', label: 'CLI' },
         { href: '/reference/mcp', label: 'MCP tools' },
         { href: '/reference/api', label: 'TypeScript API' },
         { href: '/reference/wcag-data', label: 'WCAG data' },
      ],
   },
];

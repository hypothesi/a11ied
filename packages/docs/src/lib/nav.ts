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
      title: 'Practical guides',
      links: [
         { href: '/', label: 'Overview' },
         { href: '/driver-usage', label: 'Test with a screen reader' },
         { href: '/agent-workflows', label: 'Automate with an AI agent' },
         { href: '/workflows', label: 'Test a web page' },
         { href: '/agent-skill', label: 'Install the agent skill' },
         { href: '/recording-sessions', label: 'Record a test' },
      ],
   },
   {
      title: 'Reference',
      links: [
         { href: '/mcp-usage', label: 'MCP tools' },
         { href: '/cli-reference', label: 'CLI commands' },
         { href: '/api-reference', label: 'TypeScript API' },
         { href: '/criterion-lookup', label: 'WCAG lookup' },
         { href: '/applicability', label: 'Applicability states' },
         { href: '/wcag-data-sources', label: 'Data sources' },
      ],
   },
];

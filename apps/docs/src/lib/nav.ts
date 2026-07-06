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
      title: 'Start here',
      links: [
         { href: '/', label: 'Overview' },
         { href: '/workflows', label: 'Workflows' },
         { href: '/cli-reference', label: 'CLI reference' },
         { href: '/mcp-usage', label: 'MCP usage' },
      ],
   },
   {
      title: 'WCAG model',
      links: [
         { href: '/wcag-data-sources', label: 'WCAG data sources' },
         { href: '/criterion-lookup', label: 'Criterion lookup' },
         { href: '/applicability', label: 'Applicability' },
      ],
   },
   {
      title: 'Execution',
      links: [
         { href: '/driver-usage', label: 'Driver usage' },
         { href: '/recording-sessions', label: 'Recording sessions' },
      ],
   },
   {
      title: 'Packages',
      links: [{ href: '/api-reference', label: 'API reference' }],
   },
];

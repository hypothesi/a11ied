import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const docsPagesDir = resolve(repoRoot, 'packages/docs/src/pages');
const docShellPath = resolve(repoRoot, 'packages/docs/src/layouts/doc-shell.astro');
const navPath = resolve(repoRoot, 'packages/docs/src/lib/nav.ts');

function readDocsFile(relativePath: string): string {
   return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function readDocsPage(page: string): string {
   return readFileSync(resolve(docsPagesDir, page), 'utf8');
}

function expectShellNavigationModel(shell: string): void {
   expect(shell).toContain('route-drawer');
   expect(shell).toContain('Browse docs');
   expect(shell).toContain('mobile-bar');
   expect(shell).toContain('field-note');
   expect(shell).not.toContain('Fraunces');
   expect(shell).not.toContain('IBM Plex');
}

function expectTaskFirstEntryPoints(homePage: string, workflowsPage: string): void {
   expect(homePage).toContain('/workflows#check-one-criterion');
   expect(homePage).toContain('/workflows#gather-evidence');
   expect(homePage).toContain('/workflows#drive-a-session');
   expect(homePage).toContain('/agent-workflows');
   expect(workflowsPage).toContain('Check one WCAG criterion');
   expect(workflowsPage).toContain('Scan a page with axe');
   expect(workflowsPage).toContain('Drive a screen reader');
   expect(workflowsPage).toContain('Run the tools from an agent');
}

function expectDocsFilesFreeOfLegacyCallouts(files: readonly string[]): void {
   for (const file of files) {
      const source = readDocsFile(file);
      expect(source).not.toContain('class="callout"');
   }
}

describe('docs UX remediation guardrails', () => {
   it('keeps the shell on the new mobile-first navigation model', () => {
      const shell = readFileSync(docShellPath, 'utf8');

      expectShellNavigationModel(shell);
   });

   it('keeps task-first entry points in the docs IA', () => {
      const nav = readFileSync(navPath, 'utf8');
      const homePage = readDocsPage('index.astro');
      const workflowsPage = readDocsPage('workflows.astro');

      expect(nav).toContain("{ href: '/workflows', label: 'Test a web page' }");
      expect(nav).toContain("{ href: '/agent-workflows', label: 'Automate with an AI agent' }");
      expect(nav).toContain("{ href: '/agent-skill', label: 'Install the agent skill' }");
      expectTaskFirstEntryPoints(homePage, workflowsPage);
   });

   it('keeps the updated reference pages tied back to the task-first route', () => {
      const driverPage = readDocsPage('driver-usage.astro');

      expect(driverPage).toContain('/workflows#drive-a-session');
   });

   it('keeps the docs surfaces free of stale callout styling and placeholder routes', () => {
      const docsFiles = [
         'packages/docs/src/layouts/doc-shell.astro',
         'packages/docs/src/pages/index.astro',
         'packages/docs/src/pages/workflows.astro',
         'packages/docs/src/pages/cli-reference.astro',
         'packages/docs/src/pages/mcp-usage.astro',
      ] as const;

      expectDocsFilesFreeOfLegacyCallouts(docsFiles);
   });
});

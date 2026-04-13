import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const docsPagesDir = resolve(repoRoot, 'apps/docs/src/pages');
const docShellPath = resolve(repoRoot, 'apps/docs/src/layouts/doc-shell.astro');
const navPath = resolve(repoRoot, 'apps/docs/src/lib/nav.ts');

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
   expect(homePage).toContain('/workflows#drive-a-session');
   expect(homePage).toContain('/workflows#agent-and-mcp');
   expect(workflowsPage).toContain('Check one criterion');
   expect(workflowsPage).toContain('Verify a target level');
   expect(workflowsPage).toContain('Drive a session manually');
   expect(workflowsPage).toContain('Use it from an agent');
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

      expect(nav).toContain("{ href: '/workflows', label: 'Workflows' }");
      expectTaskFirstEntryPoints(homePage, workflowsPage);
   });

   it('keeps the updated reference pages tied back to the task-first route', () => {
      const driverPage = readDocsPage('driver-usage.astro');
      const verificationPage = readDocsPage('verification-semantics.astro');

      expect(driverPage).toContain('/workflows#drive-a-session');
      expect(verificationPage).toContain('/workflows#verify-a-level');
   });

   it('keeps the docs surfaces free of stale callout styling and placeholder routes', () => {
      const docsFiles = [
         'apps/docs/src/layouts/doc-shell.astro',
         'apps/docs/src/pages/index.astro',
         'apps/docs/src/pages/workflows.astro',
         'apps/docs/src/pages/cli-reference.astro',
         'apps/docs/src/pages/mcp-usage.astro',
      ] as const;

      expectDocsFilesFreeOfLegacyCallouts(docsFiles);
   });
});

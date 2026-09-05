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

function expectShellWayfinding(shell: string): void {
   expect(shell).toContain('toc-rail');
   expect(shell).toContain('On this page');
   expect(shell).toContain('page-nav');
   expect(shell).toContain('Previous');
   expect(shell).toContain('Next');
   expect(shell).toContain('normalizePath');
}

function expectNavSections(nav: string): void {
   expect(nav).toContain("title: 'Start'");
   expect(nav).toContain("title: 'Concepts'");
   expect(nav).toContain("title: 'Guides'");
   expect(nav).toContain("title: 'Reference'");
   expect(nav).toContain("label: 'Test with a screen reader'");
   expect(nav).toContain("label: 'Test from an AI agent'");
   expect(nav).toContain("label: 'Install the agent skill'");
}

function expectTaskFirstEntryPoints(homePage: string): void {
   expect(homePage).toContain('/quickstart');
   expect(homePage).toContain('/coverage');
   expect(homePage).toContain('/targets');
   expect(homePage).toContain('/guides/agent-skill');
   expect(homePage).toContain('a1 doctor');
   expect(homePage).toContain('a1 axe http://localhost:3000');
   expect(homePage).toContain('a1 sr start');
   expect(homePage).toContain('a1 wcag 2.4.3');
}

function expectGuidesLinkToConcepts(): void {
   expect(readDocsPage('quickstart.astro')).toContain('/coverage');
   expect(readDocsPage('guides/screen-reader.astro')).toContain('/coverage');
   expect(readDocsPage('guides/agents.astro')).toContain('/guides/agent-skill');
   expect(readDocsPage('guides/agent-skill.astro')).toContain('/reference/mcp');
   expect(readDocsPage('install.astro')).toContain('/quickstart');
}

function expectDocsFilesFreeOfLegacyCallouts(files: readonly string[]): void {
   for (const file of files) {
      expect(readDocsFile(file)).not.toContain('class="callout"');
   }
}

describe('docs UX remediation guardrails', () => {
   it('keeps the shell on the new mobile-first navigation model', () => {
      const shell = readFileSync(docShellPath, 'utf8');

      expectShellNavigationModel(shell);
      expectShellWayfinding(shell);
   });

   it('keeps task-first entry points in the docs IA', () => {
      const nav = readFileSync(navPath, 'utf8');

      expectNavSections(nav);
      expectTaskFirstEntryPoints(readDocsPage('index.astro'));
   });

   it('keeps the guides tied back to the concept pages', () => {
      expectGuidesLinkToConcepts();
   });

   it('keeps the docs surfaces free of stale callout styling and placeholder routes', () => {
      const docsFiles = [
         'packages/docs/src/layouts/doc-shell.astro',
         'packages/docs/src/pages/index.astro',
         'packages/docs/src/pages/quickstart.astro',
         'packages/docs/src/pages/reference/cli.astro',
         'packages/docs/src/pages/reference/mcp.astro',
      ] as const;

      expectDocsFilesFreeOfLegacyCallouts(docsFiles);
   });
});

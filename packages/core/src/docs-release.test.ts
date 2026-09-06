import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '../../..');
const docsPagesDir = resolve(rootDir, 'packages/docs/src/pages');
const maintainerReleaseChecklistPath = resolve(
   rootDir,
   'internal-docs/maintainer-release-checklist.md',
);
const skillPath = resolve(rootDir, 'packages/skills/a11ied/SKILL.md');
const skillInstallConfigPath = resolve(rootDir, 'packages/skills/ai.json');
const ciWorkflowPath = resolve(rootDir, '.github/workflows/ci.yml');
const publishWorkflowPath = resolve(rootDir, '.github/workflows/publish.yml');
const releaseReadinessPath = resolve(
   rootDir,
   'internal-docs/releases/v0.1.0-readiness.md',
);
const requiredRuntimePages = [
   'index.astro',
   'quickstart.astro',
   'screen-readers.astro',
   'test-methods.astro',
   'relevant-criteria.astro',
   'guides/screen-reader.astro',
   'guides/testing.astro',
   'guides/agents.astro',
   'guides/agent-skill.astro',
   'guides/recording.astro',
   'guides/violations.astro',
   'guides/scripting.astro',
   'guides/ci.astro',
   'guides/troubleshooting.astro',
   'reference/cli.astro',
   'reference/mcp.astro',
   'reference/api.astro',
   'reference/wcag-data.astro',
] as const;
const requiredNavRoutes = [
   '/quickstart',
   '/screen-readers',
   '/test-methods',
   '/relevant-criteria',
   '/guides/screen-reader',
   '/guides/testing',
   '/guides/agents',
   '/guides/agent-skill',
   '/guides/recording',
   '/guides/violations',
   '/guides/scripting',
   '/guides/ci',
   '/guides/troubleshooting',
   '/reference/cli',
   '/reference/mcp',
   '/reference/api',
   '/reference/wcag-data',
] as const;
/*
 * The overview sends a reader to one place. Every other page is reachable through the
 * nav, which `requiredNavRoutes` above covers.
 */
const requiredHomeRoutes = ['/quickstart'] as const;
const requiredCiWorkflowSteps = [
   'name: Data validation',
   'name: Standards',
   'name: Prose',
   'name: Test',
   'name: Pack public workspaces',
] as const;
const requiredPublishWorkflowSteps = [
   'name: Data validation',
   'name: Standards',
   'name: Test',
   'name: Pack public workspaces',
   'name: Publish public workspaces',
] as const;

function readDocsPage(page: string): string {
   return readFileSync(resolve(docsPagesDir, page), 'utf8');
}

function expectRuntimePages(): void {
   for (const page of requiredRuntimePages) {
      expect(existsSync(resolve(docsPagesDir, page))).toBe(true);
   }
}

function expectHomeRoutes(): void {
   const homePage = readDocsPage('index.astro');
   for (const route of requiredHomeRoutes) {
      expect(homePage).toContain(route);
   }
}

function expectNavRoutes(): void {
   const nav = readFileSync(resolve(rootDir, 'packages/docs/src/lib/nav.ts'), 'utf8');
   for (const route of requiredNavRoutes) {
      expect(nav).toContain(`'${route}'`);
   }
}

function expectSkillGuardrails(): void {
   const skill = readFileSync(skillPath, 'utf8');
   const installConfig = readFileSync(skillInstallConfigPath, 'utf8');
   expect(skill).toContain('resolve the criterion or target level before testing');
   expect(skill).toContain('automated');
   expect(skill).toContain('hybrid');
   expect(skill).toContain('manual');
   expect(skill).toContain('Do not confuse raw driver transcripts with WCAG claims');
   expect(installConfig).toContain('"a11ied"');
   expect(installConfig).toContain('"./a11ied/"');
   expect(readDocsPage('guides/agent-skill.astro')).toContain('--only skills --user');
}

function expectWorkflowSteps(): void {
   const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8');
   const publishWorkflow = readFileSync(publishWorkflowPath, 'utf8');
   for (const step of requiredCiWorkflowSteps) {
      expect(ciWorkflow).toContain(step);
   }
   for (const step of requiredPublishWorkflowSteps) {
      expect(publishWorkflow).toContain(step);
   }
}

function expectReleaseChecklist(): void {
   const releaseChecklist = readFileSync(maintainerReleaseChecklistPath, 'utf8');
   expect(releaseChecklist).toContain('manual macOS VoiceOver smoke pass');
   expect(releaseChecklist).toContain('manual Windows NVDA smoke pass');
   expect(releaseChecklist).toContain('Wait for all CI checks to pass');
   expect(releaseChecklist).toContain('npm test');
   expect(releaseChecklist).toContain('npm run pack:check');
   expect(releaseChecklist).toContain('Publish order');
   expect(releaseChecklist).toContain('deferred items');
}

function expectSurfaceDoc(page: string, requiredText: string): void {
   expect(readDocsPage(page)).toContain(requiredText);
}

function expectCliSurfaceDocs(): void {
   expectSurfaceDoc('reference/cli.astro', 'Command families');
   expectSurfaceDoc('reference/cli.astro', 'a1 wcag show status-messages');
   expectSurfaceDoc('reference/cli.astro', 'npx playwright install chromium');
   expectSurfaceDoc('reference/cli.astro', 'Chrome, Edge, Brave, or Chromium');
   expectSurfaceDoc('reference/cli.astro', 'A11IED_STATE_DIR');
   expectSurfaceDoc('reference/cli.astro', 'One session is active at a time');
}

function expectConceptSurfaceDocs(): void {
   expectSurfaceDoc('relevant-criteria.astro', 'applicable');
   expectSurfaceDoc('relevant-criteria.astro', 'not-detected');
   expectSurfaceDoc('relevant-criteria.astro', 'out-of-scope');
   expectSurfaceDoc('test-methods.astro', 'automated');
   expectSurfaceDoc('test-methods.astro', 'hybrid');
   expectSurfaceDoc('test-methods.astro', 'manual');
   expectSurfaceDoc('screen-readers.astro', '--allow-virtual');
   expectSurfaceDoc('screen-readers.astro', 'targetType');
}

function expectMcpAndApiSurfaceDocs(): void {
   expectSurfaceDoc('reference/mcp.astro', 'MCP tools');
   expectSurfaceDoc('reference/mcp.astro', 'runs every mapped rule, matching');
   expectSurfaceDoc('reference/mcp.astro', 'sr_session');
   expectSurfaceDoc('reference/mcp.astro', 'sr_action');
   expectSurfaceDoc('reference/mcp.astro', 'npx -y a11ied mcp');
   expectSurfaceDoc('reference/api.astro', 'The @a11ied packages');
   expectSurfaceDoc('reference/api.astro', 'Export map');
}

function expectGuideSurfaceDocs(): void {
   expectSurfaceDoc('guides/recording.astro', 'Record a session');
   expectSurfaceDoc('guides/recording.astro', '.mov');
   expectSurfaceDoc('guides/recording.astro', '.mp4');
   expectSurfaceDoc('guides/recording.astro', 'sr start --sr voiceover --recording');
   expectSurfaceDoc('guides/recording.astro', 'transcript');
   expectSurfaceDoc('guides/recording.astro', 'Install Chrome, Edge, Brave, or Chromium');
   expectSurfaceDoc('guides/screen-reader.astro', 'a1 sr stop');
   expectSurfaceDoc('screen-readers.astro', 'npx -y @guidepup/setup setup');
   expectSurfaceDoc('screen-readers.astro', 'npx -y @guidepup/setup install');
   expectSurfaceDoc('screen-readers.astro', 'a1 setup');
   expectSurfaceDoc('guides/ci.astro', 'a1 doctor --strict');
   expectSurfaceDoc('reference/cli.astro', 'a1 setup');
   expectSurfaceDoc('quickstart.astro', 'a1 sr stop');
}

function expectNewGuideSurfaceDocs(): void {
   expectSurfaceDoc('guides/violations.astro', 'critical');
   expectSurfaceDoc('guides/violations.astro', 'a1 wcag rule');
   expectSurfaceDoc('guides/violations.astro', 'failureSummary');
   expectSurfaceDoc('guides/scripting.astro', '"ok": true');
   expectSurfaceDoc('guides/scripting.astro', 'exit code');
   expectSurfaceDoc('guides/scripting.astro', '--baseline');
   expectSurfaceDoc('guides/ci.astro', '--sr virtual --allow-virtual');
   expectSurfaceDoc('guides/ci.astro', 'npx playwright install chromium');
   expectSurfaceDoc('guides/ci.astro', 'a1 doctor --strict');
   expectSurfaceDoc('guides/troubleshooting.astro', 'missing-session');
   expectSurfaceDoc('guides/troubleshooting.astro', 'browser-unavailable');
}

function expectTestApiDocs(): void {
   expectSurfaceDoc('guides/testing.astro', 'await using sr = await screenReader');
   expectSurfaceDoc('guides/testing.astro', 'toHaveSpokenInOrder');
   expectSurfaceDoc('guides/testing.astro', '@vitest/browser-playwright');
   expectSurfaceDoc('screen-readers.astro', 'jsdom');
   expectSurfaceDoc('reference/api.astro', 'a11ied/test');
}

function expectNoStaleAxeExample(): void {
   for (const page of requiredRuntimePages) {
      expect(readDocsPage(page)).not.toContain('a1 axe --criterion 4.1.3');
   }
}

function expectPublicSurfaceDocs(): void {
   expectCliSurfaceDocs();
   expectConceptSurfaceDocs();
   expectMcpAndApiSurfaceDocs();
   expectGuideSurfaceDocs();
   expectNewGuideSurfaceDocs();
   expectTestApiDocs();
   expectNoStaleAxeExample();
   expect(existsSync(resolve(docsPagesDir, 'release-checklist.astro'))).toBe(false);
}

function expectReleaseReadinessRecord(): void {
   const releaseReadiness = readFileSync(releaseReadinessPath, 'utf8');
   expect(releaseReadiness).toContain('## release path');
   expect(releaseReadiness).toContain('### packages');
   expect(releaseReadiness).toContain('### docs');
   expect(releaseReadiness).toContain('### agent skill');
   expect(releaseReadiness).toContain('## deferred items');
   expect(releaseReadiness).toContain('publish-packages');
   expect(releaseReadiness).toContain('npm run pack:check');
}

describe('docs, skill guidance, CI, and release checks', () => {
   it('covers the required runtime topics through docs routes', () => {
      expectRuntimePages();
      expectNavRoutes();
      expectHomeRoutes();
      expectPublicSurfaceDocs();
   });

   it('keeps the skill guardrails explicit', () => {
      expectSkillGuardrails();
   });

   it('requires CI and release checks that match the shipping policy', () => {
      expectWorkflowSteps();
      expectReleaseChecklist();
      expectReleaseReadinessRecord();
   });
});

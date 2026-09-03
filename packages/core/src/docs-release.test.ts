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
   'internal-docs/releases/v0.3.0-readiness.md',
);
const requiredRuntimePages = [
   'wcag-data-sources.astro',
   'criterion-lookup.astro',
   'applicability.astro',
   'driver-usage.astro',
   'cli-reference.astro',
   'mcp-usage.astro',
   'agent-workflows.astro',
   'agent-skill.astro',
   'workflows.astro',
   'api-reference.astro',
   'recording-sessions.astro',
] as const;
const requiredHomeRoutes = [
   '/workflows',
   '/wcag-data-sources',
   '/criterion-lookup',
   '/applicability',
   '/driver-usage',
   '/cli-reference',
   '/mcp-usage',
   '/agent-workflows',
   '/agent-skill',
   '/api-reference',
   '/recording-sessions',
] as const;
const requiredCiWorkflowSteps = [
   'name: Data validation',
   'name: Standards',
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

function expectRuntimePages(): void {
   for (const page of requiredRuntimePages) {
      expect(existsSync(resolve(docsPagesDir, page))).toBe(true);
   }
}

function expectHomeRoutes(): void {
   const homePage = readFileSync(resolve(docsPagesDir, 'index.astro'), 'utf8');
   for (const route of requiredHomeRoutes) {
      expect(homePage).toContain(route);
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
   expect(readDocsPage('agent-skill.astro')).toContain('--only skills --user');
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

function readDocsPage(page: string): string {
   return readFileSync(resolve(docsPagesDir, page), 'utf8');
}

function expectSurfaceDoc(page: string, requiredText: string): void {
   expect(readDocsPage(page)).toContain(requiredText);
}

function expectCliSurfaceDocs(): void {
   expectSurfaceDoc('cli-reference.astro', 'Command families');
   expectSurfaceDoc('cli-reference.astro', 'a1 wcag coverage 1.1.1');
   expectSurfaceDoc('cli-reference.astro', 'npx playwright install chromium');
   expectSurfaceDoc('cli-reference.astro', 'Chrome, Edge, Brave, or Chromium');
   expect(readDocsPage('cli-reference.astro')).not.toContain('a1 axe --criterion 4.1.3');
}

function expectApplicabilitySurfaceDocs(): void {
   expectSurfaceDoc('applicability.astro', 'likely-applicable');
   expectSurfaceDoc('applicability.astro', 'not-detected');
   expect(readDocsPage('applicability.astro')).not.toContain('Needs review');
}

function expectMcpAndApiSurfaceDocs(): void {
   expectSurfaceDoc('mcp-usage.astro', 'What MCP exposes');
   expectSurfaceDoc('mcp-usage.astro', 'requires exactly one selector');
   expectSurfaceDoc('mcp-usage.astro', 'npx -y a11ied mcp');
   expectSurfaceDoc('api-reference.astro', 'Packages');
   expectSurfaceDoc('api-reference.astro', 'Exported helper groups');
}

function expectRecordingSurfaceDocs(): void {
   expectSurfaceDoc('recording-sessions.astro', 'Supported targets');
   expectSurfaceDoc('recording-sessions.astro', '.mov');
   expectSurfaceDoc('recording-sessions.astro', '.mp4');
   expectSurfaceDoc('recording-sessions.astro', 'sr start --recording');
   expectSurfaceDoc('recording-sessions.astro', 'doctor');
   expectSurfaceDoc('recording-sessions.astro', 'npx playwright install chromium');
}

function expectPublicSurfaceDocs(): void {
   expectCliSurfaceDocs();
   expectApplicabilitySurfaceDocs();
   expectMcpAndApiSurfaceDocs();
   expectRecordingSurfaceDocs();
   expect(readDocsPage('workflows.astro')).not.toContain('a1 axe --criterion 4.1.3');
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

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '../../..');
const docsPagesDir = resolve(rootDir, 'apps/docs/src/pages');
const skillPath = resolve(rootDir, 'skills/a11ied/SKILL.md');
const ciWorkflowPath = resolve(rootDir, '.github/workflows/ci.yml');
const publishWorkflowPath = resolve(rootDir, '.github/workflows/publish.yml');
const releaseReadinessPath = resolve(rootDir, 'releases/v0.3.0-readiness.md');
const requiredRuntimePages = [
   'wcag-data-sources.astro',
   'criterion-lookup.astro',
   'applicability.astro',
   'driver-usage.astro',
   'pattern-execution.astro',
   'verification-semantics.astro',
   'cli-reference.astro',
   'mcp-usage.astro',
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
   '/pattern-execution',
   '/verification-semantics',
   '/cli-reference',
   '/mcp-usage',
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
   expect(skill).toContain('resolve the criterion or target level before testing');
   expect(skill).toContain('automated');
   expect(skill).toContain('hybrid');
   expect(skill).toContain('manual');
   expect(skill).toContain(
      'Do not confuse raw driver transcripts with criterion verdicts',
   );
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
   const releaseChecklist = readFileSync(
      resolve(docsPagesDir, 'release-checklist.astro'),
      'utf8',
   );
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

function expectPublicSurfaceDocs(): void {
   expectSurfaceDoc('cli-reference.astro', 'Command families');
   expectSurfaceDoc('cli-reference.astro', 'npx playwright install chromium');
   expectSurfaceDoc('cli-reference.astro', 'Chrome, Edge, Brave, or Chromium');
   expectSurfaceDoc('mcp-usage.astro', 'What MCP exposes');
   expectSurfaceDoc('api-reference.astro', 'Packages');
   expectSurfaceDoc('recording-sessions.astro', 'Supported targets');
   expectSurfaceDoc('recording-sessions.astro', 'voiceover');
   expectSurfaceDoc('recording-sessions.astro', 'doctor');
   expectSurfaceDoc('recording-sessions.astro', 'npx playwright install chromium');
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

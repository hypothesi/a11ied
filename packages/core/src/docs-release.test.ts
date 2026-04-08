import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '../../..');
const docsPagesDir = resolve(rootDir, 'apps/docs/src/pages');
const skillPath = resolve(rootDir, 'skills/a11lied/SKILL.md');
const workflowPath = resolve(rootDir, '.github/workflows/ci.yml');
const releaseReadinessPath = resolve(rootDir, 'releases/v0.3.0-readiness.md');
const requiredRuntimePages = [
   'wcag-data-sources.astro',
   'criterion-lookup.astro',
   'applicability.astro',
   'driver-usage.astro',
   'pattern-execution.astro',
   'verification-semantics.astro',
] as const;
const requiredHomeRoutes = [
   '/wcag-data-sources',
   '/criterion-lookup',
   '/applicability',
   '/driver-usage',
   '/pattern-execution',
   '/verification-semantics',
] as const;
const requiredWorkflowSteps = [
   'name: Data validation',
   'name: Contract tests',
   'name: CLI smoke tests',
   'name: Virtual-target verification smoke tests',
   'name: Docs build',
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
   const workflow = readFileSync(workflowPath, 'utf8');
   for (const step of requiredWorkflowSteps) {
      expect(workflow).toContain(step);
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
   expect(releaseChecklist).toContain('Package, docs, and skill flow');
   expect(releaseChecklist).toContain('Deferred items');
}

function expectReleaseReadinessRecord(): void {
   const releaseReadiness = readFileSync(releaseReadinessPath, 'utf8');
   expect(releaseReadiness).toContain('## release path');
   expect(releaseReadiness).toContain('### packages');
   expect(releaseReadiness).toContain('### docs');
   expect(releaseReadiness).toContain('### agent skill');
   expect(releaseReadiness).toContain('## deferred items');
   expect(releaseReadiness).toContain('Package publication is still a manual sequence');
}

describe('docs, skill guidance, CI, and release checks', () => {
   it('covers the required runtime topics through docs routes', () => {
      expectRuntimePages();
      expectHomeRoutes();
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

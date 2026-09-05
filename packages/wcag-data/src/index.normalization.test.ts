import type { NormalizedCriterion } from '@a11ied/contracts';

import { describe, expect, it } from 'vitest';

import { normalizeCriteriaArtifacts } from './index.js';

import { createWcagPayload } from './testing/fixtures.js';

import { createTestQuickrefTags, LEVEL_A } from './testing/helpers.js';

function assertCriteriaKeysAreCorrect(
   artifacts: ReturnType<typeof normalizeCriteriaArtifacts>,
): void {
   expect(Object.keys(artifacts.criteriaArtifact.criteria)).toEqual([
      '1.1.1',
      '2.4.1',
      '2.4.7',
      '2.5.7',
      '2.5.8',
      '3.3.8',
      '4.1.3',
   ]);
}

/**
 * Regression coverage for the WCAG 2.4.1 shape: a `sufficient` entry with no `{title,
 * techniques}` wrapper must still return its `using` children's real ids.
 */
function assertBypassBlocksTechniquesSurviveNormalization(
   criterion: NormalizedCriterion | undefined,
): void {
   expect(criterion?.techniques.map((tech) => tech.id).filter(Boolean)).toEqual([
      'G1',
      'G123',
   ]);
   expect(criterion?.advisoryTechniques.map((tech) => tech.id).filter(Boolean)).toEqual([
      'C6',
   ]);
}

function assertLevelIndexIsCorrect(
   artifacts: ReturnType<typeof normalizeCriteriaArtifacts>,
): void {
   expect(artifacts.criteriaByLevelArtifact.levels).toEqual({
      [LEVEL_A]: ['1.1.1', '2.4.1'],
      AA: ['2.4.7', '2.5.7', '2.5.8', '3.3.8', '4.1.3'],
      AAA: [],
   });
   expect(artifacts.slugIndexArtifact.slugs['status-messages']).toBe('4.1.3');
}

function assertStatusMessagesCriterionShape(
   criterion: NormalizedCriterion | undefined,
): void {
   expect(criterion).toBeDefined();
   expect(criterion).toMatchObject({
      id: '4.1.3',
      slug: 'status-messages',
      title: 'Status Messages',
      level: 'AA',
      wcagVersion: '2.2',
      altIds: ['status-message'],
      tags: ['announcements', 'aria-live', 'notifications', 'status-messages'],
   });
   expect(criterion?.techniques.map((tech) => tech.key)).toEqual([
      '4.1.3:sufficient:set-an-aria-live-polite-region-before-the-message-appears:0.0.0',
      'ARIA22',
   ]);
   expect(criterion?.advisoryTechniques[0]).toMatchObject({
      isSynthetic: true,
      kind: 'advisory',
      suffix: 'Authoring advice',
   });
   expect(criterion?.failures[0]?.key).toBe('F104');
}

function assertTechniqueAndFailureCrossRefs(
   artifacts: ReturnType<typeof normalizeCriteriaArtifacts>,
): void {
   const aria22 = artifacts.techniqueIndexArtifact.techniques.ARIA22;
   const f104 = artifacts.failureIndexArtifact.failures.F104;
   expect(aria22).toBeDefined();
   expect(f104).toBeDefined();
   expect(aria22?.criterionIds).toEqual(['4.1.3']);
   expect(aria22?.url).toBe('https://www.w3.org/WAI/WCAG22/Techniques/ARIA/ARIA22');
   expect(f104?.criterionIds).toEqual(['4.1.3']);
   expect(f104?.url).toBe('https://www.w3.org/WAI/WCAG22/Techniques/ARIA/F104');
}

function createNormalizationInput(
   version: '2.1' | '2.2',
): Parameters<typeof normalizeCriteriaArtifacts>[0] {
   return {
      version,
      wcag: createWcagPayload(version) as Parameters<
         typeof normalizeCriteriaArtifacts
      >[0]['wcag'],
      quickrefTags: createTestQuickrefTags(),
   };
}

describe('wcag-data normalization / criteria artifact shape', () => {
   it('normalizes canonical criterion fields and lookup indexes for WCAG 2.2', () => {
      const artifacts = normalizeCriteriaArtifacts(createNormalizationInput('2.2'));

      assertCriteriaKeysAreCorrect(artifacts);
      assertLevelIndexIsCorrect(artifacts);
      assertStatusMessagesCriterionShape(artifacts.criteriaArtifact.criteria['4.1.3']);
      assertTechniqueAndFailureCrossRefs(artifacts);
      assertBypassBlocksTechniquesSurviveNormalization(
         artifacts.criteriaArtifact.criteria['2.4.1'],
      );
   });
});

describe('wcag-data normalization / byte stability', () => {
   it('generates byte-stable outputs for unchanged source content', () => {
      const input = createNormalizationInput('2.2');

      expect(JSON.stringify(normalizeCriteriaArtifacts(input))).toBe(
         JSON.stringify(normalizeCriteriaArtifacts(input)),
      );
   });
});

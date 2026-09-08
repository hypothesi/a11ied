import type {
   ApgExample,
   ApgLookupKey,
   ApgPattern,
   ApgPatternSummary,
   ApgPatternsArtifact,
   W3cDocumentSource,
} from '@a11ied/contracts';

import { WcagEngineNotFoundError } from '../errors/index.js';
import { apgPatternsCache } from '../shared/data.js';
import { loadApgPatterns } from './load.js';

function getArtifact(): ApgPatternsArtifact {
   apgPatternsCache.artifact ??= loadApgPatterns();
   return apgPatternsCache.artifact;
}

/** The APG's own attribution block, printed wherever a command prints APG material. */
export function getApgDocument(): W3cDocumentSource {
   return getArtifact().document;
}

export function getApgPattern(patternId: string): ApgPattern {
   const pattern = getArtifact().patterns[patternId];
   if (!pattern) {
      throw new WcagEngineNotFoundError(patternId, 'APG pattern');
   }
   return pattern;
}

export function getApgExample(exampleId: string): ApgExample {
   const example = getArtifact().examples[exampleId];
   if (!example) {
      throw new WcagEngineNotFoundError(exampleId, 'APG example');
   }
   return example;
}

export function listApgPatterns(): ApgPatternSummary[] {
   return Object.values(getArtifact().patterns).map((pattern) => ({
      id: pattern.id,
      title: pattern.title,
      pageUrl: pattern.pageUrl,
      exampleCount: pattern.exampleIds.length,
   }));
}

function findIndexed(index: Record<string, string[]>, key: string): ApgExample[] {
   const artifact = getArtifact();
   const wanted = key.trim().toLowerCase();
   const matched = Object.entries(index).find(
      ([indexKey]) => indexKey.toLowerCase() === wanted,
   );
   return (matched?.[1] ?? [])
      .map((exampleId) => artifact.examples[exampleId])
      .filter((example) => example !== undefined);
}

/**
 * The examples the APG's example index files under one role. Roles are matched
 * case-insensitively, so `Combobox` and `combobox` both resolve.
 */
export function findApgExamplesByRole(role: string): ApgExample[] {
   return findIndexed(getArtifact().roleIndex, role);
}

/** The examples the APG's example index files under one property or state. */
export function findApgExamplesByAttribute(attribute: string): ApgExample[] {
   return findIndexed(getArtifact().attributeIndex, attribute);
}

export function listApgExamplesForPattern(patternId: string): ApgExample[] {
   const artifact = getArtifact();
   return getApgPattern(patternId)
      .exampleIds.map((exampleId) => artifact.examples[exampleId])
      .filter((example) => example !== undefined);
}

/**
 * Resolves a bare `a1 pattern <name>` argument to the pattern or the example it names, so
 * the command can dispatch the way `a1 wcag` dispatches a criterion from a technique id.
 *
 * A pattern wins a tie. The APG gives one example the same id as its pattern in several
 * places, such as `checkbox` and `accordion`, and the pattern view lists the examples
 * anyway.
 */
export function resolveApgLookupKey(key: string): ApgLookupKey | undefined {
   const artifact = getArtifact(),
      trimmed = key.trim();

   if (artifact.patterns[trimmed]) {
      return { kind: 'pattern', id: trimmed };
   }
   if (artifact.examples[trimmed]) {
      return { kind: 'example', id: trimmed };
   }
   return undefined;
}

/** Every role and attribute the example index files something under. */
export function listApgIndexKeys(): { roles: string[]; attributes: string[] } {
   const artifact = getArtifact();
   return {
      roles: Object.keys(artifact.roleIndex),
      attributes: Object.keys(artifact.attributeIndex),
   };
}

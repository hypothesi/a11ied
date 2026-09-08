import { describe, expect, it } from 'vitest';

import type { AxeRunResult } from '@a11ied/contracts';

import type { AuditCriterionRollup } from './criteria-rollup.js';
import { buildNextCommands } from './next-commands.js';

function buildAxeResult(violationRuleIds: string[]): AxeRunResult {
   return {
      url: 'https://example.com',
      wcagVersion: '2.2',
      selection: { kind: 'all', resolvedRuleIds: violationRuleIds },
      ruleIds: violationRuleIds,
      violations: violationRuleIds.map((id) => ({
         id,
         impact: 'serious',
         description: id,
         help: id,
         helpUrl: 'https://example.com/rule',
         tags: [],
         nodes: [{ target: ['div'], html: '<div></div>' }],
      })),
      passes: [],
      incomplete: [],
      inapplicable: [],
   };
}

function buildCriterion(overrides: Partial<AuditCriterionRollup>): AuditCriterionRollup {
   return {
      id: '1.1.1',
      title: 'Criterion',
      level: 'A',
      axeVerdict: 'not-covered',
      relevance: 'not-detected',
      testMethod: 'unknown',
      evidenceMode: 'automated',
      procedureIds: ['axe_scan'],
      pending: false,
      ...overrides,
   };
}

describe('buildNextCommands', () => {
   it('lists one wcag rule command per unique failing axe rule', () => {
      const commands = buildNextCommands({
         axe: buildAxeResult(['button-name', 'button-name', 'link-name']),
         criteria: [],
         target: 'https://example.com',
      });

      expect(commands).toEqual(['a1 wcag rule button-name', 'a1 wcag rule link-name']);
   });

   it('adds a walk command when a relevant criterion needs a person', () => {
      const commands = buildNextCommands({
         axe: buildAxeResult([]),
         criteria: [buildCriterion({ relevance: 'relevant', testMethod: 'manual' })],
         target: 'https://example.com',
      });

      expect(commands).toContain('a1 sr walk https://example.com');
   });

   it('skips the walk command when no relevant criterion needs a person', () => {
      const commands = buildNextCommands({
         axe: buildAxeResult([]),
         criteria: [
            buildCriterion({ relevance: 'relevant', testMethod: 'automated' }),
            buildCriterion({ relevance: 'not-detected', testMethod: 'manual' }),
         ],
         target: 'https://example.com',
      });

      expect(commands).toEqual([]);
   });
});

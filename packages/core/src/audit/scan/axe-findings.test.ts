import type { AxeRunResult } from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';

import {
   buildAxeSignal,
   getCriteriaFromAxeTags,
   listAxeFindings,
} from './axe-findings.js';

const SELECTOR_COUNT = 7;

function buildRun(): AxeRunResult {
   return {
      url: 'https://example.test/',
      wcagVersion: '2.2',
      selection: { kind: 'level', level: 'AA', resolvedRuleIds: [] },
      ruleIds: [],
      violations: [
         {
            id: 'color-contrast',
            impact: 'serious',
            description: 'Ensures contrast',
            help: 'Elements must meet minimum color contrast ratio thresholds',
            helpUrl: 'https://example.test/rule',
            tags: ['wcag2aa', 'wcag143', 'cat.color'],
            nodes: Array.from({ length: SELECTOR_COUNT }, (_unused, index) => ({
               target: [`p.item-${String(index)}`],
               html: '<p></p>',
               failureSummary: 'Fix any of the following:\n  Increase the contrast',
            })),
         },
         {
            id: 'region',
            impact: 'moderate',
            description: 'Best practice',
            help: 'Content should be in landmarks',
            helpUrl: 'https://example.test/region',
            tags: ['best-practice'],
            nodes: [{ target: ['div'], html: '<div></div>' }],
         },
      ],
      passes: [],
      incomplete: [],
      inapplicable: [],
   };
}

describe('axe findings for an audit', () => {
   it('reads criteria from wcag tags, including two-digit criterion numbers', () => {
      expect(
         getCriteriaFromAxeTags(['wcag143', 'wcag1410', 'wcag2aa', 'best-practice']),
      ).toEqual(['1.4.3', '1.4.10']);
   });

   it('reports one finding per rule and criterion, summarizing many elements', () => {
      const [finding, ...rest] = listAxeFindings(buildRun(), ['1.4.3']);

      expect(rest).toHaveLength(0);
      expect(finding).toMatchObject({
         criterion: '1.4.3',
         key: 'axe:color-contrast:p',
         title: 'Elements must meet minimum color contrast ratio thresholds (<p>)',
         severity: 'serious',
         detail: '7 elements; 2 more not listed',
      });
      expect(finding?.recommendation).toContain('Increase the contrast');
   });

   it('files a separate finding for each type of failing element', () => {
      const run = buildRun();
      const [contrast] = run.violations;
      const mixed = {
         ...run,
         violations: contrast
            ? [
                 {
                    ...contrast,
                    nodes: [
                       { target: ['a.button--cta'], html: '<a class="button--cta">' },
                       {
                          target: ['figcaption'],
                          html: '<FIGCAPTION>Services</FIGCAPTION>',
                       },
                    ],
                 },
              ]
            : [],
      };

      const keys = listAxeFindings(mixed, ['1.4.3']).map((finding) => finding.key);

      expect(keys).toEqual(['axe:color-contrast:a', 'axe:color-contrast:figcaption']);
   });

   it('ignores violations outside the audit scope and rules with no criterion', () => {
      expect(listAxeFindings(buildRun(), ['2.4.7'])).toEqual([]);
   });

   it('never reports a pass: the signal lists violations and undecided checks only', () => {
      expect(buildAxeSignal(buildRun())).toMatchObject({
         violations: [
            { rule: 'color-contrast', elements: SELECTOR_COUNT },
            { rule: 'region' },
         ],
         needsReview: [],
         rulesPassed: 0,
      });
   });
});

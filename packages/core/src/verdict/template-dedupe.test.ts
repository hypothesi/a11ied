import { verdictSchema, type Verdict } from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';

import {
   createExclusionVerdict,
   expandStateObligations,
   matchScopeExclusion,
   revokeStaleMemberObligations,
   type ScopeExclusionRule,
   type StateObligation,
   type TemplateStateDescriptor,
} from './template-dedupe.js';

const BASE_COMPONENT = 10,
   BUDGET_FRACTION = 0.35,
   CRITERION_COUNT = 55,
   EXPECTED_FIVE_PAGE_COUNT = 64,
   EXPECTED_FR_4_SMOKE_COUNT = 4,
   EXPECTED_REP_OBLIGATIONS = 56,
   EXPECTED_TWENTY_FOUR_PAGE_TOTAL = 318,
   MEMBER_GROUP_COUNT = 19,
   SITE_PAGE_COUNT = 24,
   TEMPLATE_GROUP_COUNT = 5;

const REQUIRED_CRITICAL_IDS: readonly string[] = ['1.1.1', '1.4.3'];
const FILL_CRITICAL_ID_COUNT = CRITERION_COUNT - REQUIRED_CRITICAL_IDS.length;

const GENERATED_CRITICAL_IDS: readonly string[] = Array.from(
   { length: FILL_CRITICAL_ID_COUNT },
   (_ignored, fillIndex) => {
      const minor = String(fillIndex % BASE_COMPONENT).padStart(1, '0');
      const major = String(
         (Math.floor(fillIndex / BASE_COMPONENT) + 1) % BASE_COMPONENT,
      ).padStart(1, '0');
      return `2.${minor}.${major}`;
   },
);

const CRITERIA: readonly string[] = [...REQUIRED_CRITICAL_IDS, ...GENERATED_CRITICAL_IDS];

function makeGroup(
   templateGroupId: string,
   representativeStateId: string,
   role: 'representative' | 'member',
): TemplateStateDescriptor['templateGroup'] {
   return { templateGroupId, representativeStateId, memberRole: role };
}

describe('expandStateObligations — FR-4 template-group dedupe', () => {
   it('reduces a 5-page / 5-template site from 280 obligations to 64 (~75% reduction)', () => {
      const states: TemplateStateDescriptor[] = [
         {
            stateId: 'rep-1',
            targetUrl: 'https://example.com/landing',
            templateGroup: makeGroup('tg-1', 'rep-1', 'representative'),
         },
         {
            stateId: 'm-1',
            targetUrl: 'https://example.com/home',
            templateGroup: makeGroup('tg-1', 'rep-1', 'member'),
         },
         {
            stateId: 'm-2',
            targetUrl: 'https://example.com/about',
            templateGroup: makeGroup('tg-1', 'rep-1', 'member'),
         },
         {
            stateId: 'm-3',
            targetUrl: 'https://example.com/contact',
            templateGroup: makeGroup('tg-1', 'rep-1', 'member'),
         },
         {
            stateId: 'm-4',
            targetUrl: 'https://example.com/terms',
            templateGroup: makeGroup('tg-1', 'rep-1', 'member'),
         },
      ];

      const obligations = expandStateObligations(states, CRITERIA, []);

      // Baseline if every state carried full checks: 5 * (1 axe_scan + 55 criteria) = 280
      expect(obligations).toHaveLength(EXPECTED_FIVE_PAGE_COUNT);
      // Representative: 1 axe_scan + 55 criterion_check = 56
      expect(
         obligations.filter((obligation) => obligation.stateId === 'rep-1').length,
      ).toBe(EXPECTED_REP_OBLIGATIONS);
      const nonRepresentativeAxeScans = obligations.filter(
         (obligation) => obligation.kind === 'axe_scan' && obligation.stateId !== 'rep-1',
      );
      expect(nonRepresentativeAxeScans.length).toBe(EXPECTED_FR_4_SMOKE_COUNT);
      // Each member: axe_scan + template_smoke = 2; four members = 8; only the four smoke probes appear here
      expect(
         obligations.filter((obligation) => obligation.kind === 'template_smoke'),
      ).toHaveLength(EXPECTED_FR_4_SMOKE_COUNT);
   });

   it('keeps a 24-page / 5-template site under 35% of full obligations', () => {
      const base = Math.floor(MEMBER_GROUP_COUNT / TEMPLATE_GROUP_COUNT),
         remainder = MEMBER_GROUP_COUNT % TEMPLATE_GROUP_COUNT;
      const memberDistribution: readonly number[] = Array.from(
         { length: TEMPLATE_GROUP_COUNT },
         (_fillIndex, templateIndex) => base + (templateIndex < remainder ? 1 : 0),
      );
      const states: TemplateStateDescriptor[] = [];

      for (
         let templateIndex = 0;
         templateIndex < TEMPLATE_GROUP_COUNT;
         templateIndex += 1
      ) {
         states.push({
            stateId: `rep-${templateIndex}`,
            targetUrl: `https://example.com/page-${templateIndex}`,
            templateGroup: makeGroup(
               `tg-${templateIndex}`,
               `rep-${templateIndex}`,
               'representative',
            ),
         });
         const count = memberDistribution[templateIndex] ?? 0;
         for (let memberIndex = 0; memberIndex < count; memberIndex += 1) {
            states.push({
               stateId: `mem-${templateIndex}-${memberIndex}`,
               targetUrl: `https://example.com/page-${templateIndex}/section-${memberIndex}`,
               templateGroup: makeGroup(
                  `tg-${templateIndex}`,
                  `rep-${templateIndex}`,
                  'member',
               ),
            });
         }
      }

      expect(states).toHaveLength(SITE_PAGE_COUNT);

      const obligations = expandStateObligations(states, CRITERIA, []);
      // 24 pages * 56 full obligations; accept <= 35%, i.e. <= 470
      const budget = Math.round(
         SITE_PAGE_COUNT * EXPECTED_REP_OBLIGATIONS * BUDGET_FRACTION,
      );
      expect(obligations.length).toBeLessThanOrEqual(budget);
      expect(obligations.length).toBe(EXPECTED_TWENTY_FOUR_PAGE_TOTAL);
   });
});

describe('revokeStaleMemberObligations — FR-4 fingerprint revocation', () => {
   function buildMemberObligations(): StateObligation[] {
      const obligations: StateObligation[] = [
         {
            id: 'rep-home:axe_scan',
            stateId: 'rep-home',
            targetUrl: 'https://example.com/home',
            kind: 'axe_scan',
            status: 'pending',
         },
         {
            id: 'rep-home:criterion_check',
            stateId: 'rep-home',
            targetUrl: 'https://example.com/home',
            kind: 'criterion_check',
            criterionId: '1.1.1',
            status: 'passed',
         },
      ];

      for (const memberId of ['child-1', 'child-2', 'child-3', 'child-4']) {
         obligations.push({
            id: `${memberId}:template_smoke`,
            stateId: memberId,
            targetUrl: `https://example.com/${memberId}`,
            kind: 'template_smoke',
            representativeStateId: 'rep-home',
            templateGroupId: 'tg-home',
            status: 'passed',
         });
      }

      return obligations;
   }

   it('transitions member template_smoke obligations to stale when the representative fingerprint changes', () => {
      const obligations = buildMemberObligations();

      const revoked = revokeStaleMemberObligations(
         obligations,
         { 'rep-home': 'fp-v1' },
         { 'rep-home': 'fp-v2' },
      );

      expect(
         revoked
            .filter((obligation) => obligation.kind === 'template_smoke')
            .every((obligation) => obligation.status === 'stale'),
      ).toBe(true);

      expect(
         revoked
            .filter((obligation) => obligation.kind === 'template_smoke')
            .every((obligation) => obligation.status !== 'passed'),
      ).toBe(true);
   });

   it('leaves obligations untouched when the representative fingerprint is unchanged', () => {
      const obligations = buildMemberObligations();

      const revoked = revokeStaleMemberObligations(
         obligations,
         { 'rep-home': 'fp-v1' },
         { 'rep-home': 'fp-v1' },
      );

      expect(
         revoked
            .filter((obligation) => obligation.kind === 'template_smoke')
            .every((obligation) => obligation.status === 'passed'),
      ).toBe(true);
   });
});

describe('createExclusionVerdict — FR-5 scope exclusions', () => {
   it('produces a schema-valid excluded verdict carrying the exclusion reason', () => {
      const rule: ScopeExclusionRule = {
         ruleId: 'r-scope-1',
         reason: 'third-party widget lives on /widgets/*',
      };

      const verdict = createExclusionVerdict({
         stateId: 'st-widget',
         criterionId: '1.4.3',
         rule,
         recordedAt: '2026-11-10T00:00:00.000Z',
      });

      expect(verdict.method).toBe('scope-exclusion');
      expect(verdict.tier).toBe(0);
      expect(verdict.outcome).toBe('excluded');
      expect(verdict.confidence).toBe(1);
      expect(verdict.exclusionReason).toBe('third-party widget lives on /widgets/*');
      expect(verdict.evidence).toEqual([]);
      expect(verdict.repro).toEqual([]);

      const parsed: Verdict = verdictSchema.parse(verdict);
      expect(parsed.exclusionReason).toBe('third-party widget lives on /widgets/*');
      expect(typeof parsed.id).toBe('string');
      expect(parsed.id.length).toBeGreaterThan(0);
      expect(parsed.recordedAt).toBe('2026-11-10T00:00:00.000Z');
   });

   it('marks matching representative criterion_check obligations as excluded by criterionId filter', () => {
      const criteriaRule: ScopeExclusionRule = {
         ruleId: 'crit-rule',
         reason: 'criterion 1.4.3 applies to a template we did not evaluate',
         criterionIds: ['1.4.3'],
      };

      const states: TemplateStateDescriptor[] = [
         {
            stateId: 'rep-home',
            targetUrl: 'https://example.com/home',
            templateGroup: makeGroup('tg-h', 'rep-home', 'representative'),
         },
      ];

      const obligations = expandStateObligations(states, CRITERIA, [criteriaRule]);
      const targeted = obligations.filter(
         (obligation) => obligation.criterionId === '1.4.3',
      );

      expect(
         targeted.every(
            (obligation) =>
               obligation.status === 'excluded' &&
               obligation.exclusionReason ===
                  'criterion 1.4.3 applies to a template we did not evaluate',
         ),
      ).toBe(true);
      expect(
         obligations
            .filter((obligation) => obligation.criterionId === '1.1.1')
            .every((obligation) => obligation.status !== 'excluded'),
      ).toBe(true);
   });
});

describe('expandStateObligations — FR-5 stateIds and urlPatterns exclusions', () => {
   it('marks a whole member state excluded when matched by stateIds', () => {
      const stateIdsRule: ScopeExclusionRule = {
         ruleId: 'state-rule',
         reason: 'internal section is out of scope',
         stateIds: ['m-contact'],
      };

      const states: TemplateStateDescriptor[] = [
         {
            stateId: 'rep-home',
            targetUrl: 'https://example.com/home',
            templateGroup: makeGroup('tg-h', 'rep-home', 'representative'),
         },
         {
            stateId: 'm-contact',
            targetUrl: 'https://example.com/contact',
            templateGroup: makeGroup('tg-h', 'rep-home', 'member'),
         },
      ];

      const obligations = expandStateObligations(states, CRITERIA, [stateIdsRule]);

      expect(
         obligations
            .filter((obligation) => obligation.stateId === 'rep-home')
            .every((obligation) => obligation.status !== 'excluded'),
      ).toBe(true);
      expect(
         obligations
            .filter((obligation) => obligation.stateId === 'm-contact')
            .every(
               (obligation) =>
                  obligation.status === 'excluded' &&
                  obligation.exclusionReason === 'internal section is out of scope',
            ),
      ).toBe(true);
   });

   it('marks a member state excluded when matched by urlPatterns', () => {
      const urlPatternsRule: ScopeExclusionRule = {
         ruleId: 'url-rule',
         reason: '/login is an external tenant surface',
         urlPatterns: ['/login'],
      };

      const states: TemplateStateDescriptor[] = [
         {
            stateId: 'rep-home',
            targetUrl: 'https://example.com/home',
            templateGroup: makeGroup('tg-h', 'rep-home', 'representative'),
         },
         {
            stateId: 'm-login',
            targetUrl: 'https://example.com/login',
            templateGroup: makeGroup('tg-h', 'rep-home', 'member'),
         },
      ];

      const obligations = expandStateObligations(states, CRITERIA, [urlPatternsRule]);

      expect(
         obligations
            .filter((obligation) => obligation.stateId === 'rep-home')
            .every((obligation) => obligation.status !== 'excluded'),
      ).toBe(true);
      expect(
         obligations
            .filter((obligation) => obligation.stateId === 'm-login')
            .every(
               (obligation) =>
                  obligation.status === 'excluded' &&
                  obligation.exclusionReason === '/login is an external tenant surface',
            ),
      ).toBe(true);
   });
});

describe('matchScopeExclusion — FR-5 selector, URL pattern and regex fallback', () => {
   it('returns the first rule whose filters all match', () => {
      const rules: readonly ScopeExclusionRule[] = [
         {
            ruleId: 'first-state-and-url',
            stateIds: ['s-1'],
            urlPatterns: ['example.com/api'],
            reason: 'first wins',
         },
         { ruleId: 'second-state-only', stateIds: ['s-1'], reason: 'second' },
      ];

      const matched = matchScopeExclusion(
         { stateId: 's-1', targetUrl: 'https://example.com/api/users' },
         rules,
      );

      expect(matched?.ruleId).toBe('first-state-and-url');
   });

   it('skips a rule whose filters are not all satisfied and falls through', () => {
      const rules: readonly ScopeExclusionRule[] = [
         {
            ruleId: 'both-required',
            stateIds: ['s-1'],
            urlPatterns: ['example.com/api'],
            reason: 'both required',
         },
         { ruleId: 'state-only', stateIds: ['s-1'], reason: 'just state' },
      ];

      const matched = matchScopeExclusion(
         { stateId: 's-1', targetUrl: 'https://example.com/other' },
         rules,
      );

      expect(matched?.ruleId).toBe('state-only');
   });

   it('does not match a rule with no filters', () => {
      const rules: readonly ScopeExclusionRule[] = [
         { ruleId: 'empty', reason: 'no filters' },
      ];
      const matched = matchScopeExclusion(
         { stateId: 's-1', targetUrl: 'https://example.com/home' },
         rules,
      );

      expect(matched).toBeUndefined();
   });

   it('returns undefined for an invalid regex that is not a substring, without throwing', () => {
      const rules: readonly ScopeExclusionRule[] = [
         { ruleId: 'bad-regex', urlPatterns: ['unterminated['], reason: 'fallback' },
      ];

      const matched = matchScopeExclusion(
         { stateId: 's-1', targetUrl: 'https://example.com/home' },
         rules,
      );

      expect(matched).toBeUndefined();
   });
});

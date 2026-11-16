import { verdictSchema, type Verdict, type VerdictImpact } from '@a11ied/contracts';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { admitReviewVerdict } from '@a11ied/verdict';
import {
   createCompletedAssessment,
   createMockBundle,
   seedObservationFixture,
} from '../review/review-test-fixtures.js';
import {
   type BuildVerdictAuditReportInput,
   buildVerdictAuditReport,
   DEFAULT_WCAG_22_AA_CRITERIA,
   getCriterionLevel,
   renderVerdictAuditHtml,
   renderVerdictAuditMarkdown,
   writeVerdictAuditReportFiles,
} from './verdict-report.js';

const AGENT_TIER = 2,
   TOTAL_CRITERIA = 55;
const states = [
   { stateId: 'one', targetUrl: 'https://example.com/one' },
   { stateId: 'two', targetUrl: 'https://example.com/two' },
];
let runDir = '';

beforeEach(async () => {
   runDir = await mkdtemp(join(tmpdir(), 'verdict-report-test-'));
});

afterEach(async () => {
   await rm(runDir, { recursive: true, force: true });
});

async function createAcceptedVerdict(input: {
   stateId: string;
   outcome?: 'passed' | 'failed';
   impact?: VerdictImpact;
   partial?: boolean;
}): Promise<Verdict> {
   const bundle = createMockBundle({
      stateId: input.stateId,
      targetUrl: `https://example.com/${input.stateId}`,
      fingerprint: `fp-${input.stateId}`,
   });
   await seedObservationFixture(runDir, bundle);
   const proposed = verdictSchema.parse({
      ...createCompletedAssessment('1.3.2', bundle),
      id: `result-${input.stateId}`,
      criterionId: '1.3.2',
      stateId: input.stateId,
      tier: AGENT_TIER,
      outcome: input.outcome ?? 'passed',
      impact: input.impact,
      confidence: 0.9,
      method: 'agent-judgment',
      rationale:
         input.outcome === 'failed'
            ? 'The fixture sequence loses its intended meaning.'
            : 'The fixture order preserves meaning.',
      repro: ['Read fixture content in order'],
      recordedAt: bundle.capturedAt,
   });
   if (!proposed.assessment) {
      throw new Error('Expected procedure assessment');
   }
   if (input.outcome === 'failed') {
      const action = proposed.assessment.actions[0];
      if (!action) {
         throw new Error('Expected first procedure action');
      }
      action.outcome = 'failed';
   }
   if (input.partial) {
      proposed.assessment.actions = proposed.assessment.actions.slice(0, 1);
   }
   return admitReviewVerdict({
      runDir,
      scope: {
         states: [
            {
               stateId: bundle.stateId,
               targetUrl: bundle.targetUrl,
               fingerprint: bundle.fingerprint,
            },
         ],
         criterionIds: ['1.3.2'],
         exclusions: [],
      },
      verdict: proposed,
   });
}

function getGroupedState(
   state: (typeof states)[number],
): BuildVerdictAuditReportInput['states'][number] {
   return {
      ...state,
      templateGroup: {
         templateGroupId: 'shared',
         representativeStateId: 'one',
         memberRole: 'member',
      },
   };
}

describe('Report criterion data', () => {
   it('uses the shared complete WCAG 2.2 A/AA criterion list and correct levels', () => {
      expect(DEFAULT_WCAG_22_AA_CRITERIA).toHaveLength(TOTAL_CRITERIA);
      expect(getCriterionLevel('1.1.1')).toStrictEqual('A');
      expect(getCriterionLevel('1.4.3')).toStrictEqual('AA');
      expect(getCriterionLevel('2.4.11')).toStrictEqual('AA');
   });
});

describe('Report completeness and provenance', () => {
   it('includes missing state checks instead of extrapolating one assessed state', async () => {
      const verdict = await createAcceptedVerdict({ stateId: 'one' });
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states,
         criterionIds: ['1.3.2'],
         verdicts: [verdict],
      });

      expect(report.isDraft).toStrictEqual(true);
      expect(report.vpatTable[0]?.needsReviewStates).to.eql(['two']);
      expect(report.snapshot.unresolvedChecks).toStrictEqual(1);
      expect(
         report.pageVerdicts.find((page) => page.stateId === 'two')?.status,
      ).toStrictEqual('unstarted');
   });

   it('requires revalidation for copied or imported data and cannot rebind evidence to another target', async () => {
      const accepted = await createAcceptedVerdict({ stateId: 'one' });
      const serialized = verdictSchema.parse(structuredClone(accepted));
      const rawReport = buildVerdictAuditReport({
            targetOrigin: 'https://example.com',
            states: states.slice(0, 1),
            criterionIds: ['1.3.2'],
            verdicts: [serialized],
         }),
         rebound = buildVerdictAuditReport({
            targetOrigin: 'https://other.example',
            states: [{ stateId: 'one', targetUrl: 'https://other.example/one' }],
            criterionIds: ['1.3.2'],
            verdicts: [accepted],
         });

      expect(rawReport.isDraft).toStrictEqual(true);
      expect(rebound.isDraft).toStrictEqual(true);
      expect(rawReport.executiveSummary.overallConformance).toStrictEqual(
         'Draft / Incomplete',
      );
   });

   it('keeps confirmed partial failures visible without marking their assessment complete', async () => {
      const verdict = await createAcceptedVerdict({
         stateId: 'one',
         outcome: 'failed',
         partial: true,
         impact: 'serious',
      });
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states: states.slice(0, 1),
         criterionIds: ['1.3.2'],
         verdicts: [verdict],
      });

      expect(report.isDraft).toStrictEqual(true);
      expect(report.vpatTable[0]?.conformance).toStrictEqual('Does Not Support');
      expect(report.vpatTable[0]?.needsReviewStates).to.eql(['one']);
      expect(report.pageVerdicts[0]?.status).toStrictEqual('failing');
      expect(report.snapshot.unresolvedChecks).toStrictEqual(1);
   });

   it('refuses finalization when declared page checks are complete but a known journey is missing', async () => {
      const verdict = await createAcceptedVerdict({ stateId: 'one' });
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states: states.slice(0, 1),
         criterionIds: ['1.3.2'],
         verdicts: [verdict],
         scopeGaps: ['Checkout journey not assessed'],
      });

      expect(report.snapshot.unresolvedChecks).toBe(0);
      expect(report.isDraft).toBe(true);
      expect(report.snapshot.scopeGaps).toEqual(['Checkout journey not assessed']);
      expect(renderVerdictAuditHtml(report)).toContain('Checkout journey not assessed');
      expect(renderVerdictAuditMarkdown(report)).toContain(
         'Checkout journey not assessed',
      );
   });

   it('finalizes a complete scoped assessment and preserves scope and evidence identifiers', async () => {
      const verdict = await createAcceptedVerdict({ stateId: 'one' });
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states: states.slice(0, 1),
         criterionIds: ['1.3.2'],
         verdicts: [verdict],
      });

      expect(report.isDraft).toStrictEqual(false);
      expect(report.vpatTable[0]?.conformance).toStrictEqual('Supports');
      expect(report.snapshot.unresolvedChecks).toStrictEqual(0);
      expect(report.snapshot.assessments[0]?.assessment?.version).toStrictEqual(
         verdict.assessment?.version,
      );
      expect(report.snapshot.states[0]?.targetUrl).toStrictEqual(states[0]?.targetUrl);
      expect(report.executiveSummary.scopeStatement).toContain('only the listed');
   });
});

describe('Report aggregation and disclosures', () => {
   it('groups independently assessed template members and prioritizes their actual impact', async () => {
      const verdicts = await Promise.all([
         createAcceptedVerdict({ stateId: 'one', outcome: 'failed', impact: 'serious' }),
         createAcceptedVerdict({ stateId: 'two', outcome: 'failed', impact: 'critical' }),
      ]);
      const groupedStates = states.map((state) => getGroupedState(state));
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states: groupedStates,
         criterionIds: ['1.3.2'],
         verdicts,
      });

      expect(report.isDraft).toStrictEqual(false);
      expect(report.remediationRoadmap).toHaveLength(1);
      expect(report.remediationRoadmap[0]?.affectedStateIds).to.eql(['one', 'two']);
      expect(report.remediationRoadmap[0]?.impact).toStrictEqual('critical');
      expect(report.vpatTable[0]?.conformance).toStrictEqual('Does Not Support');
   });

   it('discloses exclusions without treating an entirely excluded audit as conformance', () => {
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states: [{ stateId: 'chat', targetUrl: 'https://example.com', excluded: true }],
         criterionIds: ['1.3.2'],
         verdicts: [],
         exclusions: [
            { ruleId: 'chat', stateIds: ['chat'], reason: 'User excluded chat.' },
         ],
      });

      expect(report.isDraft).toStrictEqual(true);
      expect(report.snapshot.excludedChecks).toStrictEqual(1);
      expect(report.methodologyDisclosure.tierCounts.tier0).toStrictEqual(0);
      expect(report.executiveSummary.overallConformance).toStrictEqual(
         'Draft / Incomplete',
      );
      expect(report.methodologyDisclosure.scopeExclusions[0]?.reason).toStrictEqual(
         'User excluded chat.',
      );
   });

   it('does not publish unsupported native-reader claims as verified observations', async () => {
      const verified = await createAcceptedVerdict({ stateId: 'one' });
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states: states.slice(0, 1),
         criterionIds: ['1.3.2'],
         verdicts: [{ ...verified, method: 'native-sr' }],
      });

      expect(report.isDraft).toStrictEqual(true);
      expect(
         report.methodologyDisclosure.assistiveTechnology.nativeSrCount,
      ).toStrictEqual(0);
   });
});

describe('Report rendering and files', () => {
   it('renders the required accessible HTML and Markdown sections with confirmed findings', async () => {
      const verdict = await createAcceptedVerdict({
         stateId: 'one',
         outcome: 'failed',
         impact: 'serious',
      });
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states: states.slice(0, 1),
         criterionIds: ['1.3.2'],
         verdicts: [verdict],
      });
      const html = renderVerdictAuditHtml(report),
         markdown = renderVerdictAuditMarkdown(report);

      expect(html).toContain('<html lang="en">');
      expect(html).toContain('id="executive-summary"');
      expect(html).toContain('id="remediation-roadmap"');
      expect(html).toContain('id="vpat-table"');
      expect(html).toContain('id="methodology-disclosure"');
      expect(markdown).toContain('## Executive Summary');
      expect(markdown).toContain('## WCAG 2.2 Level A & AA Conformance Table');
      expect(markdown).toContain('### Template groups');
      expect(markdown).toContain(verdict.rationale);
   });

   it('writes an internally consistent report snapshot to JSON, HTML and Markdown', async () => {
      const verdict = await createAcceptedVerdict({ stateId: 'one' });
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states: states.slice(0, 1),
         criterionIds: ['1.3.2'],
         verdicts: [verdict],
      });
      const paths = await writeVerdictAuditReportFiles(runDir, report);
      const json: unknown = JSON.parse(await readFile(paths.jsonPath, 'utf8'));

      expect(json).toMatchObject({ isDraft: false, snapshot: { unresolvedChecks: 0 } });
      expect(await readFile(paths.htmlPath, 'utf8')).toContain('Final');
      expect(await readFile(paths.markdownPath, 'utf8')).toContain('**Status:** Final');
   });
});

describe('finding counts and retained proof', () => {
   it('counts each remediation group once at its highest severity while retaining both assessments', async () => {
      const first = await createAcceptedVerdict({
         stateId: 'one',
         outcome: 'failed',
         impact: 'serious',
      });
      const second = await createAcceptedVerdict({
         stateId: 'two',
         outcome: 'failed',
         impact: 'critical',
      });
      const report = buildVerdictAuditReport({
         targetOrigin: 'https://example.com',
         states: states.map((state) => getGroupedState(state)),
         verdicts: [first, second],
         criterionIds: ['1.3.2'],
      });

      expect(report.remediationRoadmap).toHaveLength(1);
      expect(report.executiveSummary.criticalFindingsCount).toStrictEqual(1);
      expect(report.executiveSummary.seriousFindingsCount).toStrictEqual(0);
      expect(report.snapshot.assessments).toHaveLength(states.length);
      expect(report.remediationRoadmap[0]?.affectedStateIds).to.eql(['one', 'two']);
   });
});

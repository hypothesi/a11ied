import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
   accessibilityDriverSessionSchema,
   axeRunResultSchema,
   cliExitCodeSchema,
   cliOutputEnvelopeSchema,
   applicabilityInputSchema,
   applicabilityMatrixSchema,
   coverageArtifactSchema,
   coverageLookupResultSchema,
   coverageSummaryArtifactSchema,
   criteriaByLevelArtifactSchema,
   criteriaByLevelResultSchema,
   criterionApplicabilityLookupResultSchema,
   criterionLookupKeySchema,
   criterionLookupResultSchema,
   criterionSearchResponseSchema,
   driverActionResultSchema,
   driverReadinessSchema,
   driverStateSnapshotSchema,
   engineQueryErrorSchema,
   interactionPatternResultSchema,
   levelVerificationResultSchema,
   normalizedCriteriaArtifactSchema,
   quickrefTagLookupResultSchema,
   strategyArtifactSchema,
   verificationCriterionResultSchema,
   verificationExecutionPlanSchema,
   verificationEvidenceRecordSchema,
   verificationReportSchema,
   verificationRequestedScopeSchema,
   verificationStrategyLookupResultSchema,
} from './index.js';

const generatedRoot = resolve(import.meta.dirname, '../../wcag-data/data/generated');
const fixtureRoot = resolve(import.meta.dirname, '../test-fixtures');

async function loadGeneratedJson<T>(fileName: string): Promise<T> {
   return JSON.parse(await readFile(resolve(generatedRoot, fileName), 'utf8')) as T;
}

async function loadFixtureJson<T>(fileName: string): Promise<T> {
   return JSON.parse(await readFile(resolve(fixtureRoot, fileName), 'utf8')) as T;
}

describe('contracts artifact schemas', () => {
   it('round-trips committed WCAG, coverage, and strategy artifacts for both supported versions', async () => {
      for (const version of ['2.2', '2.1'] as const) {
         const criteria = normalizedCriteriaArtifactSchema.parse(
            await loadGeneratedJson(`criteria.${version}.json`),
         );
         const levels = criteriaByLevelArtifactSchema.parse(
            await loadGeneratedJson(`criteria-by-level.${version}.json`),
         );
         const coverage = coverageArtifactSchema.parse(
            await loadGeneratedJson(`coverage.${version}.json`),
         );
         const strategy = strategyArtifactSchema.parse(
            await loadGeneratedJson(`strategy.${version}.json`),
         );
         const summary = coverageSummaryArtifactSchema.parse(
            await loadGeneratedJson(`coverage-summary.${version}.json`),
         );

         expect(criteria.version).toBe(version);
         expect(levels.version).toBe(version);
         expect(coverage.version).toBe(version);
         expect(strategy.version).toBe(version);
         expect(summary.version).toBe(version);

         expect(JSON.parse(JSON.stringify(criteria))).toEqual(criteria);
         expect(JSON.parse(JSON.stringify(coverage))).toEqual(coverage);
         expect(JSON.parse(JSON.stringify(strategy))).toEqual(strategy);
         expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
      }
   });
});

describe('contracts lookup helpers', () => {
   it('accepts criterion ids and slugs as lookup keys', () => {
      expect(criterionLookupKeySchema.parse('4.1.3')).toBe('4.1.3');
      expect(criterionLookupKeySchema.parse('status-messages')).toBe('status-messages');
   });

   it('rejects malformed lookup keys deterministically', () => {
      expect(() => criterionLookupKeySchema.parse('status message')).toThrow();
      expect(() => criterionLookupKeySchema.parse('')).toThrow();
   });
});

describe('contracts cli payloads', () => {
   it('parses the shared CLI JSON envelope and frozen exit-code map', () => {
      const envelope = cliOutputEnvelopeSchema.parse({
         ok: true,
         command: {
            family: 'wcag',
            subcommand: 'show',
            version: '0.1.0',
            wcagVersion: '2.2',
         },
         target: null,
         result: {
            criterionId: '4.1.3',
         },
         warnings: [],
         errors: [],
         meta: {
            schemaVersion: '1',
            startedAt: '2026-04-07T12:00:00.000Z',
            completedAt: '2026-04-07T12:00:00.250Z',
            durationMs: 250,
         },
      });

      expect(envelope.command.family).toBe('wcag');
      expect(envelope.command.wcagVersion).toBe('2.2');
      expect(cliExitCodeSchema.parse(0)).toBe(0);
      expect(cliExitCodeSchema.parse(2)).toBe(2);
      expect(cliExitCodeSchema.parse(3)).toBe(3);
      expect(cliExitCodeSchema.parse(4)).toBe(4);
      expect(cliExitCodeSchema.parse(5)).toBe(5);
      expect(() => cliExitCodeSchema.parse(1)).toThrow();
   });
});

describe('contracts driver payloads', () => {
   it('parses driver readiness, session metadata, and action results', () => {
      const readiness = driverReadinessSchema.parse({
         target: 'virtual',
         status: 'ready',
         summary: 'Virtual screen reader is ready.',
         details: ['Uses an in-memory DOM when no live target is attached.'],
         debug: {
            adapter: 'virtual',
         },
      });

      const session = accessibilityDriverSessionSchema.parse({
         sessionId: 'drv_123',
         target: 'virtual',
         startedAt: '2026-04-07T16:00:00.000Z',
         capabilities: [
            'start',
            'stop',
            'status',
            'next',
            'previous',
            'read',
            'logs',
            'clear-logs',
         ],
         logCursor: 2,
         brokerPid: 4242,
         socketPath: '/tmp/a11lied/driver.sock',
         metadataFile: '/tmp/a11lied/session.json',
      });

      const state = driverStateSnapshotSchema.parse({
         lastSpokenPhrase: 'heading, Sample page, level 1',
         currentItemText: 'Sample page',
         spokenPhraseLog: ['document', 'heading, Sample page, level 1'],
         itemTextLog: ['Sample page'],
         logCursor: 2,
         checkpoints: [
            {
               label: 'initial',
               createdAt: '2026-04-07T16:00:01.000Z',
            },
         ],
      });

      const result = driverActionResultSchema.parse({
         session,
         action: 'status',
         state,
         details: {
            readiness,
         },
      });

      expect(result.session.target).toBe('virtual');
      expect(result.state.logCursor).toBe(2);
      expect(readiness.status).toBe('ready');
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
   });
});

describe('contracts axe payloads', () => {
   it('parses normalized axe run output', () => {
      const result = axeRunResultSchema.parse({
         url: 'http://127.0.0.1:4173/button-name-failure.html',
         wcagVersion: '2.2',
         selection: {
            kind: 'criterion',
            criterion: '4.1.2',
            resolvedRuleIds: ['button-name'],
         },
         ruleIds: ['button-name'],
         violations: [
            {
               id: 'button-name',
               impact: 'critical',
               description: 'Ensures buttons have discernible text',
               help: 'Buttons must have discernible text',
               helpUrl: 'https://dequeuniversity.com/rules/axe/4.11/button-name',
               tags: ['wcag412'],
               nodes: [
                  {
                     target: ['button'],
                     html: '<button></button>',
                     failureSummary: 'Fix any of the following:',
                  },
               ],
            },
         ],
         passes: [],
         incomplete: [],
         inapplicable: [],
      });

      expect(result.selection.kind).toBe('criterion');
      expect(result.violations[0]?.id).toBe('button-name');
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
   });
});

describe('contracts interaction pattern payloads', () => {
   it('parses normalized interaction pattern output', () => {
      const result = interactionPatternResultSchema.parse({
         patternId: 'heading_sequence',
         url: 'http://127.0.0.1:4173/basic-page.html',
         target: 'virtual',
         sessionId: 'drv_123',
         managedSession: true,
         stepLog: [
            {
               id: 'attach-target',
               label: 'Attach target HTML to the session',
               status: 'completed',
            },
         ],
         spokenPhraseLog: ['document', 'heading, Basic content page, level 1'],
         itemTextLog: ['Basic content page'],
         assertions: [
            {
               id: 'heading-order',
               status: 'passed',
               message: 'Headings stayed in document order.',
            },
         ],
         targetMetadata: {
            headings: ['Basic content page'],
         },
         browserEvidence: [
            {
               kind: 'structure',
               summary: 'Collected heading order from the rendered DOM.',
            },
         ],
      });

      expect(result.patternId).toBe('heading_sequence');
      expect(result.assertions[0]?.status).toBe('passed');
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
   });
});

describe('contracts engine payloads', () => {
   it('parses lookup and coverage result payloads built from the generated artifacts', async () => {
      const criteriaArtifact = normalizedCriteriaArtifactSchema.parse(
         await loadGeneratedJson('criteria.2.2.json'),
      );
      const coverageArtifact = coverageArtifactSchema.parse(
         await loadGeneratedJson('coverage.2.2.json'),
      );
      const strategyArtifact = strategyArtifactSchema.parse(
         await loadGeneratedJson('strategy.2.2.json'),
      );
      const levelsArtifact = criteriaByLevelArtifactSchema.parse(
         await loadGeneratedJson('criteria-by-level.2.2.json'),
      );

      const criterion = criteriaArtifact.criteria['4.1.3'];
      const coverage = coverageArtifact.coverage['4.1.3'];
      const strategy = strategyArtifact.strategies['4.1.3'];

      expect(criterion).toBeDefined();
      expect(coverage).toBeDefined();
      expect(strategy).toBeDefined();

      const criterionLookup = criterionLookupResultSchema.parse({
         lookupKey: 'status-messages',
         criterion,
      });
      const levelListing = criteriaByLevelResultSchema.parse({
         version: '2.2',
         level: 'AA',
         criteria: levelsArtifact.levels.AA.map(
            (criterionId) => criteriaArtifact.criteria[criterionId],
         ),
      });
      const tagLookup = quickrefTagLookupResultSchema.parse({
         lookupKey: 'status-messages',
         criterionId: '4.1.3',
         tags: criterion?.tags ?? [],
      });
      const coverageLookup = coverageLookupResultSchema.parse({
         lookupKey: '4.1.3',
         criterion,
         coverage,
         strategy,
      });
      const strategyLookup = verificationStrategyLookupResultSchema.parse({
         lookupKey: 'status-messages',
         criterionId: '4.1.3',
         strategy,
      });

      expect(criterionLookup.criterion.id).toBe('4.1.3');
      expect(
         levelListing.criteria.every(
            (entry) => entry.level === 'AA' && entry.wcagVersion === '2.2',
         ),
      ).toBe(true);
      expect(tagLookup.tags.length).toBeGreaterThan(0);
      expect(coverageLookup.coverage.coverageState).toBe('hybrid');
      expect(strategyLookup.strategy.procedureIds).toContain('status_message_probe');
   });

   it('round-trips search and applicability payloads', () => {
      const criterion = normalizedCriteriaArtifactSchema.parse({
         version: '2.2',
         criteria: {
            '4.1.3': {
               id: '4.1.3',
               slug: 'status-messages',
               title: 'Status Messages',
               summary:
                  'In content implemented using markup languages, status messages can be programmatically determined.',
               level: 'AA',
               wcagVersion: '2.2',
               normativeText: 'Status messages can be programmatically determined.',
               understandingUrl:
                  'https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html',
               versions: ['2.2'],
               altIds: [],
               details: ['Status updates should be exposed without moving focus.'],
               tags: ['forms', 'messaging'],
               principle: {
                  id: 'principle-4',
                  number: '4',
                  title: 'Robust',
               },
               guideline: {
                  id: 'guideline-4.1',
                  number: '4.1',
                  title: 'Compatible',
               },
               techniques: [],
               advisoryTechniques: [],
               failures: [],
            },
         },
      }).criteria['4.1.3'];

      const searchResponse = criterionSearchResponseSchema.parse({
         query: 'status message',
         results: [
            {
               criterionId: '4.1.3',
               slug: 'status-messages',
               title: 'Status Messages',
               level: 'AA',
               wcagVersion: '2.2',
               score: 0.98,
               matches: [
                  {
                     field: 'title',
                     text: 'Status Messages',
                     score: 0.7,
                  },
                  {
                     field: 'technique',
                     text: 'Using role=status to present status messages',
                     score: 0.28,
                  },
               ],
            },
         ],
      });

      const applicabilityInput = applicabilityInputSchema.parse({
         target: {
            kind: 'url',
            value: 'https://example.test/status',
         },
         signals: [
            {
               category: 'live-region',
               source: 'dom',
               value: 'role=status',
               confidence: 'high',
            },
            {
               category: 'form',
               source: 'metadata',
               value: 'toast validation',
               confidence: 'medium',
            },
         ],
         metadata: {
            component: 'status-toast',
         },
         userHints: ['status update flow'],
      });

      const applicabilityMatrix = applicabilityMatrixSchema.parse({
         version: '2.2',
         target: applicabilityInput.target,
         assessments: {
            '4.1.3': {
               criterionId: '4.1.3',
               state: 'applicable',
               reasons: ['Detected a live region and a status-update signal.'],
               matchedSignalCategories: ['live-region', 'form'],
               matchedTags: ['forms', 'messaging'],
            },
         },
      });
      const applicabilityLookup = criterionApplicabilityLookupResultSchema.parse({
         lookupKey: '4.1.3',
         version: '2.2',
         target: applicabilityInput.target,
         criterion,
         assessment: applicabilityMatrix.assessments['4.1.3'],
      });

      expect(JSON.parse(JSON.stringify(searchResponse))).toEqual(searchResponse);
      expect(JSON.parse(JSON.stringify(applicabilityInput))).toEqual(applicabilityInput);
      expect(JSON.parse(JSON.stringify(applicabilityMatrix))).toEqual(
         applicabilityMatrix,
      );
      expect(applicabilityLookup.lookupKey).toBe('4.1.3');
   });

   it('parses typed not-found and validation errors for engine consumers', () => {
      const notFound = engineQueryErrorSchema.parse({
         type: 'not-found',
         message: 'Criterion lookup failed for "9.9.9".',
         lookupKey: '9.9.9',
      });
      const validationError = engineQueryErrorSchema.parse({
         type: 'validation-error',
         message: 'WCAG version "2.0" is unsupported.',
         field: 'version',
         value: '2.0',
         supportedVersions: ['2.2', '2.1'],
      });

      expect(notFound.type).toBe('not-found');
      expect(validationError.type).toBe('validation-error');
      if (validationError.type !== 'validation-error') {
         throw new Error('expected a validation error payload');
      }
      expect(validationError.supportedVersions).toEqual(['2.2', '2.1']);
   });
});

describe('contracts verification payloads', () => {
   it('round-trips the passing and mixed verification report fixtures', async () => {
      const passFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.pass.json'),
      );
      const mixedFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.mixed.json'),
      );

      expect(JSON.parse(JSON.stringify(passFixture))).toEqual(passFixture);
      expect(JSON.parse(JSON.stringify(mixedFixture))).toEqual(mixedFixture);
      expect(passFixture.requestedScope.kind).toBe('criterion');
      expect(mixedFixture.requestedScope.kind).toBe('level');
   });

   it('locks the criterion verification row shape for automated, hybrid, manual-only, and uncovered outcomes', async () => {
      const passFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.pass.json'),
      );
      const mixedFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.mixed.json'),
      );

      const hybridCriterion = verificationCriterionResultSchema.parse(
         passFixture.criteria[0],
      );
      const automatedCriterion = verificationCriterionResultSchema.parse(
         mixedFixture.criteria.find((criterion) => criterion.criterionId === '4.1.2'),
      );
      const manualCriterion = verificationCriterionResultSchema.parse(
         mixedFixture.criteria.find((criterion) => criterion.criterionId === '3.3.8'),
      );
      const uncoveredCriterion = verificationCriterionResultSchema.parse(
         mixedFixture.criteria.find((criterion) => criterion.criterionId === '2.4.3'),
      );

      expect(hybridCriterion.verdict).toBe('pass');
      expect(hybridCriterion.evidenceMode).toBe('hybrid');
      expect(hybridCriterion.procedureIds).toContain('status_message_probe');
      expect(
         hybridCriterion.evidence[0]?.patternResult?.spokenPhraseLog.includes(
            'Profile saved successfully.',
         ),
      ).toBe(true);

      expect(automatedCriterion.verdict).toBe('fail');
      expect(automatedCriterion.evidenceMode).toBe('automated');
      expect(automatedCriterion.evidence[0]?.axeResult?.violations[0]?.id).toBe(
         'button-name',
      );

      expect(manualCriterion.verdict).toBe('needs-manual-review');
      expect(manualCriterion.evidenceMode).toBe('manual');
      expect(
         manualCriterion.uncoveredWork.some((entry) => entry.kind === 'manual-only'),
      ).toBe(true);

      expect(uncoveredCriterion.verdict).toBe('not-covered');
      expect(uncoveredCriterion.evidenceMode).toBe('unknown');
      expect(
         uncoveredCriterion.uncoveredWork.some((entry) => entry.kind === 'not-covered'),
      ).toBe(true);
   });

   it('locks the top-level verification report and level result structure used by CLI, Storybook, and MCP', async () => {
      const mixedFixture = verificationReportSchema.parse(
         await loadFixtureJson('verification-report.mixed.json'),
      );

      const requestedScope = verificationRequestedScopeSchema.parse(
         mixedFixture.requestedScope,
      );
      const firstExecutionPlan = verificationExecutionPlanSchema.parse(
         mixedFixture.criteria[0]?.executionPlan,
      );
      const firstEvidence = verificationEvidenceRecordSchema.parse(
         mixedFixture.criteria[0]?.evidence[0],
      );
      const levelResult = levelVerificationResultSchema.parse({
         level: 'AA',
         wcagVersion: mixedFixture.wcagVersion,
         summary: mixedFixture.summary,
         criteria: mixedFixture.criteria,
         uncoveredCriterionIds: ['3.3.8', '2.4.3'],
         manualOnlyCriterionIds: ['3.3.8'],
      });

      expect(requestedScope.kind).toBe('level');
      expect(firstExecutionPlan.strategyId).toBe('wcag-2.2:4.1.2');
      expect(firstEvidence.kind).toBe('axe');
      expect(mixedFixture.summary.failedCount).toBe(3);
      expect(levelResult.summary.manualOnlyCount).toBe(1);
      expect(levelResult.uncoveredCriterionIds).toEqual(['3.3.8', '2.4.3']);
   });
});

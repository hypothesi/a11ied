import { describe, expect, it } from 'vitest';

import {
   accessibilityDriverSessionSchema,
   axeRunResultSchema,
   cliExitCodeSchema,
   cliOutputEnvelopeSchema,
   criterionApplicabilityLookupResultSchema,
   criterionLookupKeySchema,
   criterionSearchResponseSchema,
   driverActionResultSchema,
   driverReadinessSchema,
   driverStateSnapshotSchema,
   engineQueryErrorSchema,
   interactionPatternResultSchema,
   normalizedCriteriaArtifactSchema,
   applicabilityInputSchema,
   applicabilityMatrixSchema,
} from './index.js';

import {
   EXIT_VIOLATIONS,
   EXIT_ENVIRONMENT,
   EXIT_CONFIGURATION,
   EXIT_INTERNAL,
   EXPECTED_LOG_CURSOR,
   validateVersionArtifacts,
   createReadinessPayload,
   createSessionPayload,
   createStatePayload,
   loadEngineTestArtifacts,
   assertLookupPayloads,
   createTestCriterionArtifactPayload,
   createSearchResponsePayload,
   createApplicabilityInputPayload,
   createApplicabilityMatrixPayload,
} from './index.test-helpers.js';

describe('contracts artifact schemas', () => {
   it('round-trips committed WCAG, coverage, and strategy artifacts for both supported versions', async () => {
      await validateVersionArtifacts('2.2');
      await validateVersionArtifacts('2.1');
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
         target: undefined,
         result: { criterionId: '4.1.3' },
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
      expect(cliExitCodeSchema.parse(EXIT_VIOLATIONS)).toBe(EXIT_VIOLATIONS);
      expect(cliExitCodeSchema.parse(EXIT_ENVIRONMENT)).toBe(EXIT_ENVIRONMENT);
      expect(cliExitCodeSchema.parse(EXIT_CONFIGURATION)).toBe(EXIT_CONFIGURATION);
      expect(cliExitCodeSchema.parse(EXIT_INTERNAL)).toBe(EXIT_INTERNAL);
      expect(() => cliExitCodeSchema.parse(1)).toThrow();
   });
});

describe('contracts driver payloads - readiness and session', () => {
   it('parses driver readiness and session metadata', () => {
      const readiness = driverReadinessSchema.parse(createReadinessPayload());
      const session = accessibilityDriverSessionSchema.parse(createSessionPayload());

      expect(readiness.status).toBe('ready');
      expect(session.target).toBe('virtual');
   });
});

describe('contracts driver payloads - action results', () => {
   it('parses state snapshots and composed action results', () => {
      const readiness = driverReadinessSchema.parse(createReadinessPayload());
      const session = accessibilityDriverSessionSchema.parse(createSessionPayload());
      const state = driverStateSnapshotSchema.parse(createStatePayload());
      const result = driverActionResultSchema.parse({
         session,
         action: 'status',
         state,
         details: { readiness },
      });

      expect(result.session.target).toBe('virtual');
      expect(result.state.logCursor).toBe(EXPECTED_LOG_CURSOR);
      expect(structuredClone(result)).toEqual(result);
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
      expect(structuredClone(result)).toEqual(result);
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
         targetMetadata: { headings: ['Basic content page'] },
         browserEvidence: [
            {
               kind: 'structure',
               summary: 'Collected heading order from the rendered DOM.',
            },
         ],
      });

      expect(result.patternId).toBe('heading_sequence');
      expect(result.assertions[0]?.status).toBe('passed');
      expect(structuredClone(result)).toEqual(result);
   });
});

describe('contracts engine payloads - lookup and coverage', () => {
   it('parses lookup and coverage result payloads built from generated artifacts', async () => {
      const artifacts = await loadEngineTestArtifacts();
      expect(artifacts.criteriaArtifact.criteria['4.1.3']).toBeDefined();
      expect(artifacts.coverageArtifact.coverage['4.1.3']).toBeDefined();
      expect(artifacts.strategyArtifact.strategies['4.1.3']).toBeDefined();
      assertLookupPayloads(artifacts);
   });
});

describe('contracts engine payloads - search and applicability', () => {
   it('round-trips search and applicability payloads', () => {
      const criterion = normalizedCriteriaArtifactSchema.parse(
         createTestCriterionArtifactPayload(),
      ).criteria['4.1.3'];
      const searchResponse = criterionSearchResponseSchema.parse(
         createSearchResponsePayload(),
      );
      const applicabilityInput = applicabilityInputSchema.parse(
         createApplicabilityInputPayload(),
      );
      const applicabilityMatrix = applicabilityMatrixSchema.parse(
         createApplicabilityMatrixPayload(applicabilityInput.target),
      );
      const applicabilityLookup = criterionApplicabilityLookupResultSchema.parse({
         lookupKey: '4.1.3',
         version: '2.2',
         target: applicabilityInput.target,
         criterion,
         assessment: applicabilityMatrix.assessments['4.1.3'],
      });

      expect(structuredClone(searchResponse)).toEqual(searchResponse);
      expect(structuredClone(applicabilityInput)).toEqual(applicabilityInput);
      expect(structuredClone(applicabilityMatrix)).toEqual(applicabilityMatrix);
      expect(applicabilityLookup.lookupKey).toBe('4.1.3');
   });
});

describe('contracts engine payloads - error handling', () => {
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

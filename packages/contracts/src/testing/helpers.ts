import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect } from 'vitest';

import {
   coverageArtifactSchema,
   coverageLookupResultSchema,
   coverageSummaryArtifactSchema,
   criteriaByLevelArtifactSchema,
   criteriaByLevelResultSchema,
   criterionLookupResultSchema,
   normalizedCriteriaArtifactSchema,
   quickrefTagLookupResultSchema,
   strategyArtifactSchema,
   verificationStrategyLookupResultSchema,
} from '../index.js';

const generatedRoot = resolve(import.meta.dirname, '../../../wcag-data/data/generated');

export async function loadGeneratedJson<TData>(fileName: string): Promise<TData> {
   return JSON.parse(await readFile(resolve(generatedRoot, fileName), 'utf8')) as TData;
}

export const EXIT_VIOLATIONS = 2;
export const EXIT_ENVIRONMENT = 3;
export const EXIT_CONFIGURATION = 4;
export const EXIT_INTERNAL = 5;
export const EXPECTED_LOG_CURSOR = 2;

interface VersionArtifacts {
   criteria: ReturnType<typeof normalizedCriteriaArtifactSchema.parse>;
   levels: ReturnType<typeof criteriaByLevelArtifactSchema.parse>;
   coverage: ReturnType<typeof coverageArtifactSchema.parse>;
   strategy: ReturnType<typeof strategyArtifactSchema.parse>;
   summary: ReturnType<typeof coverageSummaryArtifactSchema.parse>;
}

async function loadVersionArtifacts(version: '2.2' | '2.1'): Promise<VersionArtifacts> {
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
   return { criteria, levels, coverage, strategy, summary };
}

function assertVersionFields(version: '2.2' | '2.1', artifacts: VersionArtifacts): void {
   expect(artifacts.criteria.version).toBe(version);
   expect(artifacts.levels.version).toBe(version);
   expect(artifacts.coverage.version).toBe(version);
   expect(artifacts.strategy.version).toBe(version);
   expect(artifacts.summary.version).toBe(version);
   expect(structuredClone(artifacts.criteria)).toEqual(artifacts.criteria);
   expect(structuredClone(artifacts.coverage)).toEqual(artifacts.coverage);
   expect(structuredClone(artifacts.strategy)).toEqual(artifacts.strategy);
   expect(structuredClone(artifacts.summary)).toEqual(artifacts.summary);
}

export async function validateVersionArtifacts(version: '2.2' | '2.1'): Promise<void> {
   const artifacts = await loadVersionArtifacts(version);
   assertVersionFields(version, artifacts);
}

type TestPayload = Record<string, unknown>;

export function createReadinessPayload(): TestPayload {
   return {
      target: 'virtual',
      status: 'ready',
      summary: 'Virtual screen reader is ready.',
      details: ['Uses an in-memory DOM when no live target is attached.'],
      debug: { adapter: 'virtual' },
   };
}

export function createSessionPayload(): TestPayload {
   return {
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
      socketPath: '/tmp/a11ied/driver.sock',
      metadataFile: '/tmp/a11ied/session.json',
   };
}

export function createStatePayload(): TestPayload {
   return {
      lastSpokenPhrase: 'heading, Sample page, level 1',
      currentItemText: 'Sample page',
      spokenPhraseLog: ['document', 'heading, Sample page, level 1'],
      itemTextLog: ['Sample page'],
      logCursor: 2,
      checkpoints: [{ label: 'initial', createdAt: '2026-04-07T16:00:01.000Z' }],
   };
}

export interface EngineTestArtifacts {
   criteriaArtifact: ReturnType<typeof normalizedCriteriaArtifactSchema.parse>;
   coverageArtifact: ReturnType<typeof coverageArtifactSchema.parse>;
   strategyArtifact: ReturnType<typeof strategyArtifactSchema.parse>;
   levelsArtifact: ReturnType<typeof criteriaByLevelArtifactSchema.parse>;
}

export async function loadEngineTestArtifacts(): Promise<EngineTestArtifacts> {
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
   return { criteriaArtifact, coverageArtifact, strategyArtifact, levelsArtifact };
}

function assertCriterionAndLevelLookups(artifacts: EngineTestArtifacts): void {
   const criterion = artifacts.criteriaArtifact.criteria['4.1.3'];
   const criterionLookup = criterionLookupResultSchema.parse({
      lookupKey: 'status-messages',
      criterion,
   });
   const levelListing = criteriaByLevelResultSchema.parse({
      version: '2.2',
      level: 'AA',
      criteria: artifacts.levelsArtifact.levels.AA.map(
         (criterionId) => artifacts.criteriaArtifact.criteria[criterionId],
      ),
   });
   const tagLookup = quickrefTagLookupResultSchema.parse({
      lookupKey: 'status-messages',
      criterionId: '4.1.3',
      tags: criterion?.tags ?? [],
   });
   expect(criterionLookup.criterion.id).toBe('4.1.3');
   expect(
      levelListing.criteria.every(
         (entry) => entry.level === 'AA' && entry.wcagVersion === '2.2',
      ),
   ).toBe(true);
   expect(tagLookup.tags.length).toBeGreaterThan(0);
}

function assertCoverageLookups(artifacts: EngineTestArtifacts): void {
   const criterion = artifacts.criteriaArtifact.criteria['4.1.3'];
   const coverage = artifacts.coverageArtifact.coverage['4.1.3'];
   const strategy = artifacts.strategyArtifact.strategies['4.1.3'];
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
   expect(coverageLookup.coverage.coverageState).toBe('hybrid');
   expect(strategyLookup.strategy.procedureIds).toContain('status_message_probe');
}

export function assertLookupPayloads(artifacts: EngineTestArtifacts): void {
   assertCriterionAndLevelLookups(artifacts);
   assertCoverageLookups(artifacts);
}

export function createTestCriterionArtifactPayload(): TestPayload {
   return {
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
            principle: { id: 'principle-4', number: '4', title: 'Robust' },
            guideline: { id: 'guideline-4.1', number: '4.1', title: 'Compatible' },
            techniques: [],
            advisoryTechniques: [],
            failures: [],
         },
      },
   };
}

export function createSearchResponsePayload(): TestPayload {
   return {
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
               { field: 'title', text: 'Status Messages', score: 0.7 },
               {
                  field: 'technique',
                  text: 'Using role=status to present status messages',
                  score: 0.28,
               },
            ],
         },
      ],
   };
}

export function createApplicabilityInputPayload(): TestPayload {
   return {
      target: { kind: 'url', value: 'https://example.test/status' },
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
      metadata: { component: 'status-toast' },
      userHints: ['status update flow'],
   };
}

export function createApplicabilityMatrixPayload(
   target: Record<string, unknown>,
): TestPayload {
   return {
      version: '2.2',
      target,
      assessments: {
         '4.1.3': {
            criterionId: '4.1.3',
            state: 'applicable',
            reasons: ['Detected a live region and a status-update signal.'],
            matchedSignalCategories: ['live-region', 'form'],
            matchedTags: ['forms', 'messaging'],
         },
      },
   };
}

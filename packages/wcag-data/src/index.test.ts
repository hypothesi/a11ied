import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { committedArtifactRegressionFixture } from '../test/regression-fixtures.js';

import {
   deriveAxeRuleMetadata,
   ensureWcagDataDirectories,
   generateNormalizedArtifacts,
   getWcagDataDirectories,
   listApprovedUpstreamSourceUrls,
   normalizeCriteriaArtifacts,
   runWcagDataSync,
   syncRawSources,
   validateGeneratedArtifacts,
   validateRawSyncState,
   type WcagDataDirectories,
} from './index.js';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const committedGeneratedRoot = resolve(import.meta.dirname, '../data/generated');

function createTestDirectories(root: string): WcagDataDirectories {
   return {
      packageRoot: root,
      raw: join(root, 'data', 'raw'),
      generated: join(root, 'data', 'generated'),
      scripts: join(root, 'scripts'),
      test: join(root, 'test'),
   };
}

function createJsonResponse(body: unknown): Response {
   return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
         'content-type': 'application/json',
         etag: '"etag-json"',
         'last-modified': 'Mon, 06 Apr 2026 18:00:00 GMT',
      },
   });
}

async function readCommittedGeneratedJson<T>(fileName: string): Promise<T> {
   return JSON.parse(await readFile(join(committedGeneratedRoot, fileName), 'utf8')) as T;
}

function createTextResponse(body: string): Response {
   return new Response(body, {
      status: 200,
      headers: {
         'content-type': 'text/yaml',
         etag: '"etag-yaml"',
         'last-modified': 'Mon, 06 Apr 2026 18:00:00 GMT',
      },
   });
}

function getFetchUrl(input: string | URL | Request): string {
   if (typeof input === 'string') {
      return input;
   }

   if (input instanceof URL) {
      return input.toString();
   }

   return input.url;
}

function createWcagPayload(version: '2.1' | '2.2'): unknown {
   const textAlternativeCriterion = {
      id: 'non-text-content',
      num: '1.1.1',
      content:
         '<p>All non-text content that is presented to the user has a text alternative.</p>',
      handle: 'Non-text Content',
      title: 'Text alternatives are available for non-text content.',
      versions: ['2.1', '2.2'],
      level: 'A',
      details: ['Applies to images, icons, and graphical buttons.'],
      techniques: {
         sufficient: [
            {
               title: 'Text alternatives',
               note: 'Prefer direct equivalent text.',
               techniques: [
                  {
                     id: 'G94',
                     title: 'Providing short text alternatives for non-text content',
                     technology: 'HTML',
                  },
               ],
            },
         ],
         failure: [
            {
               id: 'F65',
               title: 'Failure due to omitting alt text on informative images',
               technology: 'HTML',
            },
         ],
      },
   };

   const focusVisibleCriterion = {
      id: 'focus-visible',
      num: '2.4.7',
      content:
         '<p>Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible.</p>',
      handle: 'Focus Visible',
      title: 'Keyboard focus is visible.',
      versions: ['2.1', '2.2'],
      level: 'AA',
      details: ['Relevant when focus moves through controls and interactive widgets.'],
      techniques: {
         sufficient: [
            {
               title: 'Visible focus cues',
               techniques: [
                  {
                     id: 'G195',
                     title: 'Using an author-supplied visible focus indicator',
                     technology: 'CSS',
                  },
               ],
            },
         ],
      },
   };

   const statusMessagesCriterion = {
      id: 'status-messages',
      num: '4.1.3',
      alt_id: ['status-message'],
      content:
         '<p>In content implemented using markup languages, status messages can be programmatically determined through role or properties.</p>',
      handle: 'Status Messages',
      title: 'Status messages are exposed without moving focus.',
      versions: ['2.1', '2.2'],
      level: 'AA',
      details: [
         'Relevant to toast notifications, inline validation, and async loading notices.',
      ],
      techniques: {
         sufficient: [
            {
               title: 'ARIA status techniques',
               note: 'Use live regions that match the announcement semantics.',
               techniques: [
                  {
                     id: 'ARIA22',
                     title: 'Using role=status to present status messages',
                     technology: 'ARIA',
                     using: [
                        {
                           title: 'Set an aria-live polite region before the message appears',
                           technology: 'ARIA',
                        },
                     ],
                  },
               ],
            },
         ],
         advisory: [
            {
               title: 'Announcement hygiene',
               techniques: [
                  {
                     title: 'Keep repeated status messages concise',
                     suffix: 'Authoring advice',
                  },
               ],
            },
         ],
         failure: [
            {
               id: 'F104',
               title: 'Failure due to changing content without programmatic notification',
               technology: 'ARIA',
            },
         ],
      },
   };

   const versionOnlyCriteria =
      version === '2.2'
         ? [
              {
                 id: 'dragging-movements',
                 num: '2.5.7',
                 content:
                    '<p>All functionality that uses a dragging movement can be operated by a single pointer.</p>',
                 handle: 'Dragging Movements',
                 title: 'Dragging interactions have a non-drag alternative.',
                 versions: ['2.2'],
                 level: 'AA',
                 details: ['Applies to sliders, sortable lists, and map interactions.'],
                 techniques: {
                    sufficient: [
                       {
                          title: 'Alternative pointer actions',
                          techniques: [
                             {
                                id: 'G219',
                                title: 'Provide a single-pointer alternative to dragging',
                                technology: 'General',
                             },
                          ],
                       },
                    ],
                 },
              },
              {
                 id: 'target-size-minimum',
                 num: '2.5.8',
                 content:
                    '<p>The size of the target for pointer inputs is at least 24 by 24 CSS pixels.</p>',
                 handle: 'Target Size (Minimum)',
                 title: 'Pointer targets meet the minimum size threshold.',
                 versions: ['2.2'],
                 level: 'AA',
                 details: [
                    'Applies to small touch targets and densely packed action bars.',
                 ],
              },
              {
                 id: 'accessible-authentication-minimum',
                 num: '3.3.8',
                 content:
                    '<p>A cognitive function test is not required for any step in an authentication process unless that step provides an alternative.</p>',
                 handle: 'Accessible Authentication (Minimum)',
                 title: 'Authentication does not force a cognitive function test without an alternative.',
                 versions: ['2.2'],
                 level: 'AA',
                 details: ['Applies to login, sign-up, and password recovery journeys.'],
              },
           ]
         : [];

   return {
      principles: [
         {
            id: 'principle1',
            num: '1',
            handle: 'Perceivable',
            title: 'Perceivable',
            guidelines: [
               {
                  id: 'guideline1-1',
                  num: '1.1',
                  handle: 'Text Alternatives',
                  title: 'Provide text alternatives.',
                  successcriteria: [textAlternativeCriterion],
               },
            ],
         },
         {
            id: 'principle2',
            num: '2',
            handle: 'Operable',
            title: 'Operable',
            guidelines: [
               {
                  id: 'guideline2-5',
                  num: '2.4',
                  handle: 'Navigable',
                  title: 'Help users navigate and find content.',
                  successcriteria: [focusVisibleCriterion],
               },
               {
                  id: 'guideline2-5',
                  num: '2.5',
                  handle: 'Input Modalities',
                  title: 'Make input easy to operate.',
                  successcriteria: versionOnlyCriteria,
               },
            ],
         },
         {
            id: 'principle3',
            num: '3',
            handle: 'Understandable',
            title: 'Understandable',
            guidelines:
               version === '2.2'
                  ? [
                       {
                          id: 'guideline3-3',
                          num: '3.3',
                          handle: 'Input Assistance',
                          title: 'Help users avoid and correct mistakes.',
                          successcriteria: [versionOnlyCriteria[2]],
                       },
                    ]
                  : [],
         },
         {
            id: 'principle4',
            num: '4',
            handle: 'Robust',
            title: 'Robust',
            guidelines: [
               {
                  id: 'guideline4-1',
                  num: '4.1',
                  handle: 'Compatible',
                  title: 'Maximize compatibility with user agents and assistive technologies.',
                  successcriteria: [statusMessagesCriterion],
               },
            ],
         },
      ],
      terms: {},
   };
}

function createQuickrefTagsYaml(): string {
   return [
      'non-text-content:',
      '  dev: images text-alternatives images',
      '  con: text-alternatives content',
      'focus-visible:',
      '  int: keyboard focus',
      '  vis: focus-indicator',
      'status-messages:',
      '  dev: status-messages notifications status-messages',
      '  int: aria-live',
      '  con: announcements',
      'dragging-movements:',
      '  int: dragging gestures',
      'target-size-minimum:',
      '  int: pointer targets',
      'accessible-authentication-minimum:',
      '  int: authentication login',
   ].join('\n');
}

function createActMappingPayload(): unknown {
   return {
      'act-rules': [
         {
            title: 'Images have accessible text alternatives',
            permalink: '/standards-guidelines/act/rules/abc111/',
            successCriteria: ['non-text-content'],
            deprecated: false,
            proposed: false,
            frontmatter: {
               id: 'abc111',
               accessibility_requirements: {
                  'wcag20:1.1.1': {},
               },
            },
         },
         {
            title: 'Focus indicator is visible',
            permalink: '/standards-guidelines/act/rules/09f0ab/',
            successCriteria: ['focus-visible'],
            deprecated: false,
            proposed: false,
            frontmatter: {
               id: '09f0ab',
               accessibility_requirements: {
                  'wcag20:2.4.7': {},
               },
            },
         },
      ],
   };
}

function createFetchImpl(): typeof fetch {
   const quickrefFallback =
      'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/gh-pages/_data/tags-sc.yml';

   return async (input) => {
      const url = getFetchUrl(input);

      switch (url) {
         case 'https://www.w3.org/WAI/WCAG22/wcag.json': {
            return createJsonResponse(createWcagPayload('2.2'));
         }
         case 'https://www.w3.org/WAI/WCAG21/wcag.json': {
            return createJsonResponse(createWcagPayload('2.1'));
         }
         case 'https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json': {
            return createJsonResponse(createActMappingPayload());
         }
         case 'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml': {
            return new Response('Not Found', { status: 404, statusText: 'Not Found' });
         }
         case quickrefFallback: {
            return createTextResponse(createQuickrefTagsYaml());
         }
         default: {
            throw new Error(`unexpected fetch: ${url}`);
         }
      }
   };
}

describe('wcag-data sync scaffolding', () => {
   it('returns the package directories used by the sync pipeline', () => {
      const directories = getWcagDataDirectories();

      expect(relative(workspaceRoot, directories.packageRoot)).toBe('packages/wcag-data');
      expect(relative(workspaceRoot, directories.raw)).toBe(
         'packages/wcag-data/data/raw',
      );
      expect(relative(workspaceRoot, directories.generated)).toBe(
         'packages/wcag-data/data/generated',
      );
      expect(relative(workspaceRoot, directories.scripts)).toBe(
         'packages/wcag-data/scripts',
      );
      expect(relative(workspaceRoot, directories.test)).toBe('packages/wcag-data/test');
   });

   it('ensures the scaffold directories exist', async () => {
      const directories = await ensureWcagDataDirectories();

      expect(existsSync(directories.raw)).toBe(true);
      expect(existsSync(directories.generated)).toBe(true);
      expect(existsSync(directories.scripts)).toBe(true);
      expect(existsSync(directories.test)).toBe(true);
   });

   it('keeps raw sync inputs ignored while generated output stays trackable', () => {
      const rawCheck = spawnSync(
         'git',
         ['check-ignore', 'packages/wcag-data/data/raw/example.json'],
         { cwd: workspaceRoot, encoding: 'utf8' },
      );
      const generatedCheck = spawnSync(
         'git',
         ['check-ignore', 'packages/wcag-data/data/generated/example.json'],
         { cwd: workspaceRoot, encoding: 'utf8' },
      );

      expect(rawCheck.status).toBe(0);
      expect(generatedCheck.status).toBe(1);
   });
});

describe('wcag-data raw sync', () => {
   it('lists the approved upstream sources from the acceptance spec', () => {
      expect(listApprovedUpstreamSourceUrls()).toEqual([
         'https://www.w3.org/WAI/WCAG22/wcag.json',
         'https://www.w3.org/WAI/WCAG21/wcag.json',
         'https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json',
         'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
      ]);
   });

   it('fetches validated raw sources, writes provenance, and derives axe metadata locally', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'a11lied-wcag-data-'));
      const directories = createTestDirectories(tempRoot);
      const fetchCalls: string[] = [];
      const quickrefFallback =
         'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/gh-pages/_data/tags-sc.yml';
      const fetchImpl: typeof fetch = async (input) => {
         const url = getFetchUrl(input);
         fetchCalls.push(url);
         return createFetchImpl()(input);
      };

      const result = await syncRawSources({
         directories,
         fetchImpl,
         syncedAt: '2026-04-06T19:00:00.000Z',
      });

      expect(result.fetchList).toEqual(listApprovedUpstreamSourceUrls());
      expect(result.axeRuleCount).toBeGreaterThan(0);
      expect(fetchCalls).toContain('https://www.w3.org/WAI/WCAG22/wcag.json');
      expect(fetchCalls).toContain('https://www.w3.org/WAI/WCAG21/wcag.json');
      expect(fetchCalls).toContain(
         'https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json',
      );
      expect(fetchCalls).toContain(
         'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
      );
      expect(fetchCalls).toContain(quickrefFallback);
      expect(fetchCalls.some((url) => url.includes('dequeuniversity.com'))).toBe(false);

      const rawEntries = await readdir(directories.raw);

      expect(rawEntries).toEqual(
         expect.arrayContaining([
            'wcag.2.2.json',
            'wcag.2.2.provenance.json',
            'wcag.2.1.json',
            'wcag.2.1.provenance.json',
            'act-mapping.json',
            'act-mapping.provenance.json',
            'quickref-tags.yml',
            'quickref-tags.provenance.json',
            'axe-rules.json',
            'axe-rules.provenance.json',
         ]),
      );

      const quickrefProvenance = JSON.parse(
         await readFile(join(directories.raw, 'quickref-tags.provenance.json'), 'utf8'),
      ) as { sourceUrl: string; resolvedUrl: string; fallbackUsed: boolean };

      expect(quickrefProvenance.sourceUrl).toBe(
         'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
      );
      expect(quickrefProvenance.resolvedUrl).toBe(quickrefFallback);
      expect(quickrefProvenance.fallbackUsed).toBe(true);

      const axeProvenance = JSON.parse(
         await readFile(join(directories.raw, 'axe-rules.provenance.json'), 'utf8'),
      ) as { sourceUrl: string; upstreamVersion?: string };
      expect(axeProvenance.sourceUrl).toBe('npm:axe-core');
      expect(axeProvenance.upstreamVersion).toBeDefined();

      await expect(validateRawSyncState(directories)).resolves.toHaveLength(5);
   });

   it('fails fast on malformed upstream data without writing updated raw artifacts', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'a11lied-wcag-data-invalid-'));
      const directories = createTestDirectories(tempRoot);

      const fetchImpl: typeof fetch = async (input) => {
         const url = getFetchUrl(input);

         if (url === 'https://www.w3.org/WAI/WCAG22/wcag.json') {
            return createJsonResponse({ invalid: true });
         }

         return createFetchImpl()(input);
      };

      await expect(
         syncRawSources({
            directories,
            fetchImpl,
            syncedAt: '2026-04-06T19:00:00.000Z',
         }),
      ).rejects.toMatchObject({
         name: 'SyncValidationError',
         exitCode: 3,
         sourceId: 'wcag22',
         sourceUrl: 'https://www.w3.org/WAI/WCAG22/wcag.json',
      });

      await expect(readdir(directories.raw)).resolves.toEqual([]);
   });

   it('derives axe metadata locally from the installed package', () => {
      const rules = deriveAxeRuleMetadata();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0]).toMatchObject({
         ruleId: expect.any(String),
         tags: expect.any(Array),
      });
   });
});

describe('wcag-data normalization', () => {
   it('normalizes canonical criterion fields and lookup indexes for WCAG 2.2', () => {
      const artifacts = normalizeCriteriaArtifacts({
         version: '2.2',
         wcag: createWcagPayload('2.2') as Parameters<
            typeof normalizeCriteriaArtifacts
         >[0]['wcag'],
         quickrefTags: {
            'non-text-content': {
               dev: 'images text-alternatives images',
               con: 'content',
            },
            'focus-visible': {
               int: 'keyboard focus',
               vis: 'focus-indicator',
            },
            'status-messages': {
               dev: 'status-messages notifications status-messages',
               int: 'aria-live',
               con: 'announcements',
            },
            'dragging-movements': {
               int: 'dragging gestures',
            },
            'target-size-minimum': {
               int: 'pointer targets',
            },
            'accessible-authentication-minimum': {
               int: 'authentication login',
            },
         },
      });

      expect(Object.keys(artifacts.criteriaArtifact.criteria)).toEqual([
         '1.1.1',
         '2.4.7',
         '2.5.7',
         '2.5.8',
         '3.3.8',
         '4.1.3',
      ]);
      expect(artifacts.criteriaByLevelArtifact.levels).toEqual({
         A: ['1.1.1'],
         AA: ['2.4.7', '2.5.7', '2.5.8', '3.3.8', '4.1.3'],
         AAA: [],
      });
      expect(artifacts.slugIndexArtifact.slugs['status-messages']).toBe('4.1.3');
      expect(artifacts.tagIndexArtifact.tags['aria-live']).toEqual(['4.1.3']);

      const statusMessagesCriterion = artifacts.criteriaArtifact.criteria['4.1.3'];
      const aria22 = artifacts.techniqueIndexArtifact.techniques.ARIA22;
      const f104 = artifacts.failureIndexArtifact.failures.F104;

      expect(statusMessagesCriterion).toBeDefined();
      expect(aria22).toBeDefined();
      expect(f104).toBeDefined();

      expect(statusMessagesCriterion).toMatchObject({
         id: '4.1.3',
         slug: 'status-messages',
         title: 'Status Messages',
         level: 'AA',
         wcagVersion: '2.2',
         altIds: ['status-message'],
         tags: ['announcements', 'aria-live', 'notifications', 'status-messages'],
      });
      expect(
         statusMessagesCriterion?.techniques.map(
            (technique: { key: string }) => technique.key,
         ),
      ).toEqual([
         '4.1.3:sufficient:set-an-aria-live-polite-region-before-the-message-appears:0.0.0',
         'ARIA22',
      ]);
      expect(statusMessagesCriterion?.advisoryTechniques[0]).toMatchObject({
         isSynthetic: true,
         kind: 'advisory',
         suffix: 'Authoring advice',
      });
      expect(statusMessagesCriterion?.failures[0]?.key).toBe('F104');
      expect(aria22?.criterionIds).toEqual(['4.1.3']);
      expect(f104?.criterionIds).toEqual(['4.1.3']);
   });

   it('generates byte-stable outputs for unchanged source content', () => {
      const input = {
         version: '2.2' as const,
         wcag: createWcagPayload('2.2') as Parameters<
            typeof normalizeCriteriaArtifacts
         >[0]['wcag'],
         quickrefTags: {
            'non-text-content': {
               dev: 'images text-alternatives images',
               con: 'content',
            },
            'focus-visible': {
               int: 'keyboard focus',
               vis: 'focus-indicator',
            },
            'status-messages': {
               dev: 'status-messages notifications status-messages',
               int: 'aria-live',
               con: 'announcements',
            },
            'dragging-movements': {
               int: 'dragging gestures',
            },
            'target-size-minimum': {
               int: 'pointer targets',
            },
            'accessible-authentication-minimum': {
               int: 'authentication login',
            },
         },
      };

      expect(JSON.stringify(normalizeCriteriaArtifacts(input))).toBe(
         JSON.stringify(normalizeCriteriaArtifacts(input)),
      );
   });

   it('writes generated artifacts and a committed provenance manifest', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'a11lied-wcag-data-generated-'));
      const directories = createTestDirectories(tempRoot);

      await syncRawSources({
         directories,
         fetchImpl: createFetchImpl(),
         syncedAt: '2026-04-06T19:00:00.000Z',
      });

      const result = await generateNormalizedArtifacts(directories);
      const generatedEntries = await readdir(directories.generated);

      expect(result.criteriaCountByVersion).toEqual({
         '2.2': 6,
         '2.1': 3,
      });
      expect(result.coverageCountsByVersion).toEqual({
         '2.2': {
            automated: 2,
            hybrid: 2,
            manual: 2,
            unknown: 0,
         },
         '2.1': {
            automated: 1,
            hybrid: 2,
            manual: 0,
            unknown: 0,
         },
      });
      expect(generatedEntries).toEqual(
         expect.arrayContaining([
            'criteria.2.2.json',
            'criteria-by-level.2.2.json',
            'coverage.2.2.json',
            'coverage-summary.2.2.json',
            'strategy.2.2.json',
            'slug-index.2.2.json',
            'technique-index.2.2.json',
            'failure-index.2.2.json',
            'tag-index.2.2.json',
            'criteria.2.1.json',
            'criteria-by-level.2.1.json',
            'coverage.2.1.json',
            'coverage-summary.2.1.json',
            'strategy.2.1.json',
            'slug-index.2.1.json',
            'technique-index.2.1.json',
            'failure-index.2.1.json',
            'tag-index.2.1.json',
            'generated-provenance.json',
         ]),
      );

      const manifest = JSON.parse(
         await readFile(join(directories.generated, 'generated-provenance.json'), 'utf8'),
      ) as {
         generatedAt: string;
         rawSources: Array<{ fileName: string }>;
         artifacts: Array<{ fileName: string; sourceUrls: string[] }>;
      };

      expect(manifest.generatedAt).toBe('2026-04-06T19:00:00.000Z');
      expect(manifest.rawSources.map((entry) => entry.fileName)).toEqual(
         expect.arrayContaining([
            'wcag.2.2.json',
            'wcag.2.1.json',
            'quickref-tags.yml',
            'act-mapping.json',
            'axe-rules.json',
         ]),
      );
      expect(
         manifest.artifacts.find((entry) => entry.fileName === 'criteria.2.2.json')
            ?.sourceUrls,
      ).toEqual([
         'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
         'https://www.w3.org/WAI/WCAG22/wcag.json',
      ]);
      expect(
         manifest.artifacts.find((entry) => entry.fileName === 'coverage.2.2.json')
            ?.sourceUrls,
      ).toEqual([
         'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
         'https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json',
         'https://www.w3.org/WAI/WCAG22/wcag.json',
         'npm:axe-core',
      ]);

      const coverageArtifact = JSON.parse(
         await readFile(join(directories.generated, 'coverage.2.2.json'), 'utf8'),
      ) as {
         coverage: Record<
            string,
            { coverageState: string; actRuleIds: string[]; axeRuleIds: string[] }
         >;
      };
      const strategyArtifact = JSON.parse(
         await readFile(join(directories.generated, 'strategy.2.2.json'), 'utf8'),
      ) as {
         strategies: Record<
            string,
            {
               preferredEvidenceMode: string;
               procedureIds: string[];
               requiresRealTarget: boolean;
            }
         >;
      };
      const summaryArtifact = JSON.parse(
         await readFile(join(directories.generated, 'coverage-summary.2.2.json'), 'utf8'),
      ) as {
         totals: Record<string, number>;
         representativeCriterionIds: Record<string, string[]>;
      };

      expect(coverageArtifact.coverage['2.5.8']).toMatchObject({
         coverageState: 'automated',
      });
      expect(coverageArtifact.coverage['2.4.7']).toMatchObject({
         coverageState: 'hybrid',
         actRuleIds: ['09f0ab'],
         axeRuleIds: [],
      });
      expect(coverageArtifact.coverage['3.3.8']).toMatchObject({
         coverageState: 'manual',
      });
      expect(coverageArtifact.coverage['4.1.3']).toMatchObject({
         coverageState: 'hybrid',
      });
      expect(strategyArtifact.strategies['4.1.3']).toMatchObject({
         preferredEvidenceMode: 'hybrid',
         procedureIds: ['status_message_probe'],
         requiresRealTarget: true,
      });
      expect(strategyArtifact.strategies['3.3.8']).toMatchObject({
         preferredEvidenceMode: 'manual',
         procedureIds: ['auth_flow_probe', 'manual_review'],
      });
      expect(summaryArtifact.totals).toMatchObject({
         criteria: 6,
         automated: 2,
         hybrid: 2,
         manual: 2,
         unknown: 0,
      });
      expect(summaryArtifact.representativeCriterionIds.hybrid).toEqual([
         '2.4.7',
         '4.1.3',
      ]);

      await expect(validateGeneratedArtifacts(directories)).resolves.toHaveLength(19);
   });

   it('runs the end-to-end sync command deterministically across repeated executions', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'a11lied-wcag-data-run-'));
      const directories = createTestDirectories(tempRoot);

      const first = await runWcagDataSync({
         directories,
         fetchImpl: createFetchImpl(),
         syncedAt: '2026-04-06T19:00:00.000Z',
      });
      const firstGenerated = await Promise.all(
         first.generatedArtifacts.map(
            async (artifact) =>
               [artifact.fileName, await readFile(artifact.filePath, 'utf8')] as const,
         ),
      );

      const second = await runWcagDataSync({
         directories,
         fetchImpl: createFetchImpl(),
         syncedAt: '2026-04-06T19:00:00.000Z',
      });
      const secondGenerated = await Promise.all(
         second.generatedArtifacts.map(
            async (artifact) =>
               [artifact.fileName, await readFile(artifact.filePath, 'utf8')] as const,
         ),
      );

      expect(first.fetchList).toEqual(listApprovedUpstreamSourceUrls());
      expect(first.rawArtifacts).toHaveLength(5);
      expect(first.generatedArtifacts).toHaveLength(19);
      expect(first.criteriaCountByVersion).toEqual({
         '2.2': 6,
         '2.1': 3,
      });
      expect(first.coverageCountsByVersion).toEqual({
         '2.2': {
            automated: 2,
            hybrid: 2,
            manual: 2,
            unknown: 0,
         },
         '2.1': {
            automated: 1,
            hybrid: 2,
            manual: 0,
            unknown: 0,
         },
      });
      expect(firstGenerated).toEqual(secondGenerated);
      await expect(validateRawSyncState(directories)).resolves.toHaveLength(5);
      await expect(validateGeneratedArtifacts(directories)).resolves.toHaveLength(19);
   });
});

describe('wcag-data committed regression fixtures', () => {
   it('keeps committed artifact counts and provenance pinned to the expected sources', async () => {
      const criteria22 = await readCommittedGeneratedJson<{
         criteria: Record<string, unknown>;
      }>('criteria.2.2.json');
      const criteria21 = await readCommittedGeneratedJson<{
         criteria: Record<string, unknown>;
      }>('criteria.2.1.json');
      const summary22 = await readCommittedGeneratedJson<{
         totals: Record<string, number>;
      }>('coverage-summary.2.2.json');
      const summary21 = await readCommittedGeneratedJson<{
         totals: Record<string, number>;
      }>('coverage-summary.2.1.json');
      const provenance = await readCommittedGeneratedJson<{
         rawSources: Array<{ fileName: string }>;
         artifacts: Array<{ fileName: string; sourceUrls: string[] }>;
      }>('generated-provenance.json');

      expect(Object.keys(criteria22.criteria)).toHaveLength(
         committedArtifactRegressionFixture.versions['2.2'].criteriaCount,
      );
      expect(Object.keys(criteria21.criteria)).toHaveLength(
         committedArtifactRegressionFixture.versions['2.1'].criteriaCount,
      );
      expect(summary22.totals).toMatchObject(
         committedArtifactRegressionFixture.versions['2.2'].coverageTotals,
      );
      expect(summary21.totals).toMatchObject(
         committedArtifactRegressionFixture.versions['2.1'].coverageTotals,
      );
      expect(provenance.rawSources.map((entry) => entry.fileName)).toEqual(
         committedArtifactRegressionFixture.provenance.rawSourceFiles,
      );
      expect(
         provenance.artifacts.find((entry) => entry.fileName === 'criteria.2.2.json')
            ?.sourceUrls,
      ).toEqual(committedArtifactRegressionFixture.provenance.criteria22SourceUrls);
      expect(
         provenance.artifacts.find((entry) => entry.fileName === 'coverage.2.2.json')
            ?.sourceUrls,
      ).toEqual(committedArtifactRegressionFixture.provenance.coverage22SourceUrls);
   });

   it('keeps representative criteria pinned to known slugs, levels, tags, and technique counts', async () => {
      const criteriaArtifact = await readCommittedGeneratedJson<{
         criteria: Record<
            string,
            {
               slug: string;
               title: string;
               level: string;
               tags: string[];
               techniques: unknown[];
               failures: unknown[];
            }
         >;
      }>('criteria.2.2.json');

      for (const [criterionId, fixture] of Object.entries(
         committedArtifactRegressionFixture.representativeCriteria,
      )) {
         const criterion = criteriaArtifact.criteria[criterionId];

         expect(criterion).toBeDefined();
         expect(criterion?.slug).toBe(fixture.slug);
         expect(criterion?.title).toBe(fixture.title);
         expect(criterion?.level).toBe(fixture.level);
         expect(criterion?.techniques).toHaveLength(fixture.techniqueCount);
         expect(criterion?.failures).toHaveLength(fixture.failureCount);
         expect(criterion?.tags).toEqual(
            expect.arrayContaining([...fixture.requiredTags]),
         );
      }
   });
});

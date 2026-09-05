import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { expect } from 'vitest';

import {
   listApprovedUpstreamSourceUrls,
   validateGeneratedArtifacts,
   validateRawSyncState,
   type WcagDataDirectories,
} from '../index.js';

import {
   createActMappingPayload,
   createQuickrefTagsYaml,
   createWcagPayload,
} from './fixtures.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
export const EXPECTED_RAW_SOURCE_COUNT = 5;
export const EXPECTED_GENERATED_ARTIFACT_COUNT = 19;
const EXPECTED_22_CRITERIA_COUNT = 7;
const EXPECTED_21_CRITERIA_COUNT = 4;
export const LEVEL_A = 'A';
export const SYNC_TIMESTAMP = '2026-04-06T19:00:00.000Z';

export const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const committedGeneratedRoot = resolve(import.meta.dirname, '../../data/generated');

export const EXPECTED_CRITERIA_COUNTS_BY_VERSION = {
   '2.2': EXPECTED_22_CRITERIA_COUNT,
   '2.1': EXPECTED_21_CRITERIA_COUNT,
};

export const EXPECTED_22_COVERAGE_COUNTS = {
   automated: 2,
   hybrid: 3,
   manual: 2,
   unknown: 0,
};
const EXPECTED_21_COVERAGE_COUNTS = {
   automated: 1,
   hybrid: 3,
   manual: 0,
   unknown: 0,
};

export const EXPECTED_COVERAGE_COUNTS_BY_VERSION = {
   '2.2': EXPECTED_22_COVERAGE_COUNTS,
   '2.1': EXPECTED_21_COVERAGE_COUNTS,
};

export function createTestDirectories(root: string): WcagDataDirectories {
   return {
      packageRoot: root,
      raw: join(root, 'data', 'raw'),
      generated: join(root, 'data', 'generated'),
      scripts: join(root, 'scripts'),
      test: join(root, 'test'),
   };
}

export function createJsonResponse(body: unknown): Response {
   return Response.json(body, {
      status: HTTP_OK,
      headers: {
         etag: '"etag-json"',
         'last-modified': 'Mon, 06 Apr 2026 18:00:00 GMT',
      },
   });
}

function createTextResponse(body: string): Response {
   return new Response(body, {
      status: HTTP_OK,
      headers: {
         'content-type': 'text/yaml',
         etag: '"etag-yaml"',
         'last-modified': 'Mon, 06 Apr 2026 18:00:00 GMT',
      },
   });
}

export function getFetchUrl(input: string | URL | Request): string {
   if (typeof input === 'string') {
      return input;
   }
   if (input instanceof URL) {
      return input.toString();
   }
   return input.url;
}

export async function readCommittedGeneratedJson<TData>(
   fileName: string,
): Promise<TData> {
   return JSON.parse(
      await readFile(join(committedGeneratedRoot, fileName), 'utf8'),
   ) as TData;
}

export function createTestQuickrefTags(): Record<string, Record<string, string>> {
   return {
      'non-text-content': { dev: 'images text-alternatives images', con: 'content' },
      'focus-visible': { int: 'keyboard focus', vis: 'focus-indicator' },
      'status-messages': {
         dev: 'status-messages notifications status-messages',
         int: 'aria-live',
         con: 'announcements',
      },
      'dragging-movements': { int: 'dragging gestures' },
      'target-size-minimum': { int: 'pointer targets' },
      'accessible-authentication-minimum': { int: 'authentication login' },
   };
}

export function createFetchImpl(): typeof fetch {
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
            return new Response('Not Found', {
               status: HTTP_NOT_FOUND,
               statusText: 'Not Found',
            });
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

export async function assertRawAndGeneratedValidation(
   directories: WcagDataDirectories,
): Promise<void> {
   await expect(validateRawSyncState(directories)).resolves.toHaveLength(
      EXPECTED_RAW_SOURCE_COUNT,
   );
   await expect(validateGeneratedArtifacts(directories)).resolves.toHaveLength(
      EXPECTED_GENERATED_ARTIFACT_COUNT,
   );
}

export function assertEndToEndSyncResult(result: {
   fetchList: string[];
   rawArtifacts: unknown[];
   generatedArtifacts: unknown[];
   criteriaCountByVersion: Record<string, number>;
   coverageCountsByVersion: Record<string, Record<string, number>>;
}): void {
   expect(result.fetchList).toEqual(listApprovedUpstreamSourceUrls());
   expect(result.rawArtifacts).toHaveLength(EXPECTED_RAW_SOURCE_COUNT);
   expect(result.generatedArtifacts).toHaveLength(EXPECTED_GENERATED_ARTIFACT_COUNT);
   expect(result.criteriaCountByVersion).toEqual(EXPECTED_CRITERIA_COUNTS_BY_VERSION);
   expect(result.coverageCountsByVersion).toEqual(EXPECTED_COVERAGE_COUNTS_BY_VERSION);
}

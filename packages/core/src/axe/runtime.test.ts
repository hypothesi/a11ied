import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getTestMethod } from '@a11ied/wcag-engine';
import {
   createTestServer,
   type TestServerHandle,
} from '../../../cli/src/testing/fixtures.js';

import { runAxe } from './runtime.js';
import type { DocumentLoad } from '../targets/parse.js';

let baseUrl = '';
const testServer: TestServerHandle = createTestServer();
const AXE_RUNTIME_TIMEOUT_MS = 20_000;

beforeAll(async () => {
   await testServer.start();
   baseUrl = testServer.getBaseUrl();
});

afterAll(async () => {
   await testServer.stop();
});

function loadFor(path: string): DocumentLoad {
   return { kind: 'goto', url: `${baseUrl}/${path}` };
}

describe('axe runtime', () => {
   it(
      'runs all mapped axe rules when no selector is provided',
      async () => {
         const result = await runAxe(loadFor('basic-page.html'), { wcagVersion: '2.2' });

         expect(result.selection.kind).toBe('all');
         expect(result.ruleIds.length).toBeGreaterThan(10);
         expect(Array.isArray(result.passes)).toBe(true);
         expect(Array.isArray(result.incomplete)).toBe(true);
      },
      AXE_RUNTIME_TIMEOUT_MS,
   );

   it(
      'runs criterion-mapped axe rules and preserves normalized details',
      async () => {
         const result = await runAxe(loadFor('button-name-failure.html'), {
            wcagVersion: '2.2',
            criterion: '4.1.2',
         });

         expect(result.selection.kind).toBe('criterion');
         expect(result.violations.length).toBeGreaterThan(0);

         const mappedRuleIds = new Set(
            getTestMethod('4.1.2', { version: '2.2' }).testMethod.axeRuleIds,
         );
         expect(result.violations.every((entry) => mappedRuleIds.has(entry.id))).toBe(
            true,
         );
         expect(result.violations[0]?.helpUrl).toMatch(/^https:\/\//);
         expect(result.violations[0]?.nodes[0]?.target.length).toBeGreaterThan(0);
      },
      AXE_RUNTIME_TIMEOUT_MS,
   );

   it(
      'runs level-based scans and preserves result collections',
      async () => {
         const contrast = await runAxe(loadFor('contrast-failure.html'), {
            wcagVersion: '2.2',
            level: 'AA',
         });
         expect(contrast.selection.kind).toBe('level');
         expect(contrast.violations.some((entry) => entry.id === 'color-contrast')).toBe(
            true,
         );
         expect(Array.isArray(contrast.passes)).toBe(true);
         expect(Array.isArray(contrast.incomplete)).toBe(true);
      },
      AXE_RUNTIME_TIMEOUT_MS,
   );
});

describe('axe runtime explicit rules', () => {
   it(
      'preserves incomplete results when the selected rule reports them',
      async () => {
         const incomplete = await runAxe(loadFor('basic-page.html'), {
            wcagVersion: '2.2',
            ruleIds: ['frame-tested'],
         });
         expect(incomplete.incomplete.some((entry) => entry.id === 'frame-tested')).toBe(
            true,
         );
      },
      AXE_RUNTIME_TIMEOUT_MS,
   );

   it(
      'limits explicit rule execution to the requested ids',
      async () => {
         const result = await runAxe(loadFor('basic-page.html'), {
            wcagVersion: '2.2',
            ruleIds: ['color-contrast'],
         });

         const seenRuleIds = [
            ...result.violations.map((entry) => entry.id),
            ...result.passes.map((entry) => entry.id),
            ...result.incomplete.map((entry) => entry.id),
            ...result.inapplicable.map((entry) => entry.id),
         ];

         expect(new Set(seenRuleIds)).toEqual(new Set(['color-contrast']));
      },
      AXE_RUNTIME_TIMEOUT_MS,
   );
});

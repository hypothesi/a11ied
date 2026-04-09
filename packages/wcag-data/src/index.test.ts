import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
   deriveAxeRuleMetadata,
   ensureWcagDataDirectories,
   getWcagDataDirectories,
   listApprovedUpstreamSourceUrls,
   syncRawSources,
   validateRawSyncState,
   type WcagDataDirectories,
} from './index.js';

import {
   createFetchImpl,
   createJsonResponse,
   createTestDirectories,
   EXPECTED_RAW_SOURCE_COUNT,
   getFetchUrl,
   SYNC_TIMESTAMP,
   workspaceRoot,
} from './testing/helpers.js';

function assertRawSyncResultShape(result: {
   fetchList: string[];
   axeRuleCount: number;
}): void {
   expect(result.fetchList).toEqual(listApprovedUpstreamSourceUrls());
   expect(result.axeRuleCount).toBeGreaterThan(0);
}

function assertFetchCallsCoverAllSources(
   fetchCalls: string[],
   quickrefFallback: string,
): void {
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
}

function assertRawEntriesAreComplete(rawEntries: string[]): void {
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
}

async function assertQuickrefProvenanceIsCorrect(
   directories: WcagDataDirectories,
   quickrefFallback: string,
): Promise<void> {
   const provenance = JSON.parse(
      await readFile(join(directories.raw, 'quickref-tags.provenance.json'), 'utf8'),
   ) as { sourceUrl: string; resolvedUrl: string; fallbackUsed: boolean };

   expect(provenance.sourceUrl).toBe(
      'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
   );
   expect(provenance.resolvedUrl).toBe(quickrefFallback);
   expect(provenance.fallbackUsed).toBe(true);
}

async function assertAxeProvenanceIsCorrect(
   directories: WcagDataDirectories,
): Promise<void> {
   const axeProvenance = JSON.parse(
      await readFile(join(directories.raw, 'axe-rules.provenance.json'), 'utf8'),
   ) as { sourceUrl: string; upstreamVersion?: string };

   expect(axeProvenance.sourceUrl).toBe('npm:axe-core');
   expect(axeProvenance.upstreamVersion).toBeDefined();
}

function createTrackedFetchImpl(): {
   fetchCalls: string[];
   quickrefFallback: string;
   fetchImpl: typeof fetch;
} {
   const fetchCalls: string[] = [];
   const quickrefFallback =
      'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/gh-pages/_data/tags-sc.yml';
   const fetchImpl: typeof fetch = async (input) => {
      const url = getFetchUrl(input);
      fetchCalls.push(url);
      return createFetchImpl()(input);
   };
   return { fetchCalls, quickrefFallback, fetchImpl };
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

describe('wcag-data raw sync / source listing', () => {
   it('lists the approved upstream sources from the acceptance spec', () => {
      expect(listApprovedUpstreamSourceUrls()).toEqual([
         'https://www.w3.org/WAI/WCAG22/wcag.json',
         'https://www.w3.org/WAI/WCAG21/wcag.json',
         'https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json',
         'https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml',
      ]);
   });
});

describe('wcag-data raw sync / fetching and provenance', () => {
   it('fetches validated raw sources, writes provenance, and derives axe metadata locally', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'a11ied-wcag-data-'));
      const directories = createTestDirectories(tempRoot);
      const { fetchCalls, quickrefFallback, fetchImpl } = createTrackedFetchImpl();

      const result = await syncRawSources({
         directories,
         fetchImpl,
         syncedAt: SYNC_TIMESTAMP,
      });

      assertRawSyncResultShape(result);
      assertFetchCallsCoverAllSources(fetchCalls, quickrefFallback);
      assertRawEntriesAreComplete(await readdir(directories.raw));
      await assertQuickrefProvenanceIsCorrect(directories, quickrefFallback);
      await assertAxeProvenanceIsCorrect(directories);
      await expect(validateRawSyncState(directories)).resolves.toHaveLength(
         EXPECTED_RAW_SOURCE_COUNT,
      );
   });
});

describe('wcag-data raw sync / validation', () => {
   it('fails fast on malformed upstream data without writing updated raw artifacts', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'a11ied-wcag-data-invalid-'));
      const directories = createTestDirectories(tempRoot);

      const fetchImpl: typeof fetch = async (input) => {
         const url = getFetchUrl(input);
         if (url === 'https://www.w3.org/WAI/WCAG22/wcag.json') {
            return createJsonResponse({ invalid: true });
         }
         return createFetchImpl()(input);
      };

      await expect(
         syncRawSources({ directories, fetchImpl, syncedAt: SYNC_TIMESTAMP }),
      ).rejects.toMatchObject({
         name: 'SyncValidationError',
         exitCode: 3,
         sourceId: 'wcag22',
         sourceUrl: 'https://www.w3.org/WAI/WCAG22/wcag.json',
      });

      await expect(readdir(directories.raw)).resolves.toEqual([]);
   });
});

describe('wcag-data raw sync / axe metadata', () => {
   it('derives axe metadata locally from the installed package', () => {
      const rules = deriveAxeRuleMetadata();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0]).toMatchObject({
         ruleId: expect.any(String),
         tags: expect.any(Array),
      });
   });
});

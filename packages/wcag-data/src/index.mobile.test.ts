import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mobileGuidanceArtifactSchema } from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';

import {
   runWcagDataSync,
   syncMobileGuidance,
   validateMobileGuidanceArtifact,
   type WcagDataDirectories,
} from './index.js';
import { MobileGuidanceParseError, parseMobileGuidance } from './sources/mobile/parse.js';
import {
   createFetchImpl,
   createTestDirectories,
   getFetchUrl,
} from './testing/helpers.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const SOURCE_BASE = 'https://raw.githubusercontent.com/w3c/matf/main/comments/';
const EXPECTED_REQUEST_COUNT = 7;

const GUIDANCE_SOURCE = `## Success Criterion 2.5.8 Target Size (Minimum)

(Level AA)

[wcag:target-size-minimum]
[wcag2ict:applying-sc-2-5-8-target-size-minimum-to-non-web-documents-and-software]

This applies directly as written, replacing "user agent" with "user agent or platform software".

**2.5.8 Target Size (Minimum):** The size of the [target](https://www.w3.org/TR/WCAG22/#dfn-targets) is at least 24 by 24 CSS pixels.

[note1:Targets selected spatially count as one target.]

[note2:For inline targets the line-height is perpendicular to the flow of text.]

[example:Examples include sliders and color pickers.]
`;

const PLACEHOLDER_SOURCE = `## Success Criterion 4.1.3 Status Messages

(Level AA)

[wcag:status-messages]
[wcag2ict:applying-sc-4-1-3-status-messages-to-non-web-documents-and-software]

Placeholder

[issue:52]
`;

function createMobileFetchImpl(): typeof fetch {
   const bodyByUrl: Record<string, string> = {
      [`${SOURCE_BASE}2.5.8.md`]: GUIDANCE_SOURCE,
      [`${SOURCE_BASE}4.1.3.md`]: PLACEHOLDER_SOURCE,
   };

   return async (input) => {
      const body = bodyByUrl[getFetchUrl(input)];
      if (!body) {
         return new Response('Not Found', {
            status: HTTP_NOT_FOUND,
            statusText: 'Not Found',
         });
      }
      return new Response(body, { status: HTTP_OK, headers: { etag: '"etag-md"' } });
   };
}

async function createSyncedDirectories(): Promise<WcagDataDirectories> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-mobile-'));
   const directories = createTestDirectories(root);
   await runWcagDataSync({ directories, fetchImpl: createFetchImpl() });
   return directories;
}

describe('mobile guidance parsing', () => {
   it('separates the guidance prose from the notes and examples', () => {
      const parsed = parseMobileGuidance({
         fileName: '2.5.8.md',
         markdown: GUIDANCE_SOURCE,
      });

      expect(parsed.criterionId).toBe('2.5.8');
      expect(parsed.state).toBe('guidance');
      expect(parsed.guidance).toContain('"user agent or platform software"');
      expect(parsed.guidance).not.toContain('[note1:');
      expect(parsed.notes).toEqual([
         'Targets selected spatially count as one target.',
         'For inline targets the line-height is perpendicular to the flow of text.',
      ]);
      expect(parsed.examples).toEqual(['Examples include sliders and color pickers.']);
      expect(parsed.url).toBe(
         'https://w3c.github.io/matf/#success-criterion-2-5-8-target-size-minimum',
      );
      expect(parsed.wcag2ictUrl).toBe(
         'https://www.w3.org/TR/wcag2ict-22/#applying-sc-2-5-8-target-size-minimum-to-non-web-documents-and-software',
      );
      expect(parsed.openIssueUrl).toBeUndefined();
   });

   it('marks a criterion with no guidance yet as a placeholder and links its issue', () => {
      const parsed = parseMobileGuidance({
         fileName: '4.1.3.md',
         markdown: PLACEHOLDER_SOURCE,
      });

      expect(parsed.state).toBe('placeholder');
      expect(parsed.guidance).toBe('');
      expect(parsed.openIssueUrl).toBe('https://github.com/w3c/matf/issues/52');
   });

   it('rejects a source file with no success criterion heading', () => {
      expect(() =>
         parseMobileGuidance({ fileName: 'stray.md', markdown: 'no heading' }),
      ).toThrowError(MobileGuidanceParseError);
   });
});

describe('mobile guidance sync', () => {
   it('stores an entry for every covered criterion and skips the ones with no file', async () => {
      const directories = await createSyncedDirectories();

      const result = await syncMobileGuidance({
         directories,
         fetchImpl: createMobileFetchImpl(),
      });

      expect(result.requestCount).toBe(EXPECTED_REQUEST_COUNT);
      expect(result.guidanceCount).toBe(1);
      expect(result.placeholderCount).toBe(1);
      expect(result.failures).toEqual([]);

      const artifact = mobileGuidanceArtifactSchema.parse(
         JSON.parse(await readFile(result.generated.filePath, 'utf8')) as unknown,
      );
      expect(Object.keys(artifact.criteria)).toEqual(['2.5.8', '4.1.3']);
      expect(artifact.criteria['2.5.8']?.etag).toBe('"etag-md"');
      await expect(validateMobileGuidanceArtifact(directories)).resolves.toEqual({
         fileName: 'mobile-guidance.json',
         filePath: result.generated.filePath,
      });
   });

   it('keeps an entry a later run could not fetch', async () => {
      const directories = await createSyncedDirectories();
      await syncMobileGuidance({ directories, fetchImpl: createMobileFetchImpl() });

      const rerun = await syncMobileGuidance({
         directories,
         fetchImpl: async () =>
            new Response('Not Found', {
               status: HTTP_NOT_FOUND,
               statusText: 'Not Found',
            }),
      });

      const artifact = mobileGuidanceArtifactSchema.parse(
         JSON.parse(await readFile(rerun.generated.filePath, 'utf8')) as unknown,
      );
      expect(Object.keys(artifact.criteria)).toEqual(['2.5.8', '4.1.3']);
   });
});

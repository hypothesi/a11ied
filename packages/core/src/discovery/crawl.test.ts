import { describe, expect, it } from 'vitest';

import { buildArtifactKey } from './crawl.js';

describe('buildArtifactKey', () => {
   it('distinguishes URLs with a long shared prefix', () => {
      const first = buildArtifactKey('https://classifieds.fyi/privacy-policy'),
         second = buildArtifactKey('https://classifieds.fyi/terms-of-use');

      expect(first).not.toBe(second);
   });
});

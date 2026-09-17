import { describe, expect, it } from 'vitest';

import { buildRobotsCheck } from './robots.js';

describe('buildRobotsCheck', () => {
   it('honors allow, disallow, wildcard, and end anchors', () => {
      const isAllowed = buildRobotsCheck(
         'https://example.test/robots.txt',
         [
            'User-agent: a11ied-audit-discover',
            'Disallow: /private/*',
            'Allow: /private/help$',
            '',
         ].join('\n'),
      );

      expect(isAllowed('https://example.test/private/order')).toStrictEqual(false);
      expect(isAllowed('https://example.test/private/help')).toStrictEqual(true);
      expect(isAllowed('https://example.test/public')).toStrictEqual(true);
   });
});

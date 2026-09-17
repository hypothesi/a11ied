import { describe, expect, it } from 'vitest';

import { parseSitemap } from './sitemap.js';

describe('parseSitemap', () => {
   it('parses URL sets and sitemap indexes', () => {
      const index = parseSitemap(
            '<sitemapindex><sitemap><loc>/nested.xml</loc></sitemap></sitemapindex>',
            'https://example.test/sitemap-index.xml',
         ),
         urlSet = parseSitemap(
            '<urlset><url><loc>/one</loc></url><url><loc>https://example.test/two</loc></url></urlset>',
            'https://example.test/sitemap.xml',
         );

      expect(urlSet.urls).toEqual([
         'https://example.test/one',
         'https://example.test/two',
      ]);
      expect(index.childSitemaps).toEqual(['https://example.test/nested.xml']);
   });
});

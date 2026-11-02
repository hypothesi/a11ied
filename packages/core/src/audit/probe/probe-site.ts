import type { AxeRunResult } from '@a11ied/contracts';
import type { Browser } from 'playwright';
import { runAxe } from '../../axe/runtime.js';
import { collectPageFacts, openProbePage, type PageFacts } from './page-facts.js';
import type { SiteFacts } from './probe-types.js';

const PHONE_LIKE = /\d{3}/;
const SITEMAP_PATHS = ['/sitemap.xml', '/sitemap-index.xml', '/sitemap-0.xml'];

export interface PageEvidence {
   facts: PageFacts;
   axe: AxeRunResult | undefined;
}

async function readAxe(url: string): Promise<AxeRunResult | undefined> {
   try {
      return await runAxe({ kind: 'goto', url }, { wcagVersion: '2.2', level: 'AA' });
   } catch {
      // A scanner failure leaves axe-backed criteria to their own probes.
      return undefined;
   }
}

/** Collects each page once, because many checks judge the same observed page. */
export class PageEvidenceCache {
   private readonly browser: Browser;
   private readonly pages = new Map<string, Promise<PageEvidence>>();

   public constructor(browser: Browser) {
      this.browser = browser;
   }

   public get(url: string): Promise<PageEvidence> {
      const cached = this.pages.get(url);
      if (cached) {
         return cached;
      }
      const loading = this.load(url);
      this.pages.set(url, loading);
      return loading;
   }

   private async load(url: string): Promise<PageEvidence> {
      const page = await openProbePage(this.browser);
      try {
         const facts = await collectPageFacts(page, url);
         return { facts, axe: await readAxe(url) };
      } finally {
         await page.context().close();
      }
   }
}

async function hasSitemap(origin: string): Promise<boolean> {
   const answers = await Promise.all(
      SITEMAP_PATHS.map((path) =>
         fetch(new URL(path, origin)).then(
            (response) => response.ok,
            () => false,
         ),
      ),
   );
   return answers.some(Boolean);
}

/** Cross-page facts for criteria such as consistent navigation and multiple ways. */
export async function buildSiteFacts(
   cache: PageEvidenceCache,
   urls: string[],
): Promise<SiteFacts> {
   const pages = await Promise.all(urls.map((url) => cache.get(url)));
   const [first] = urls;
   return {
      hasSitemap: first ? await hasSitemap(new URL(first).origin) : false,
      navSignatures: pages.map((page) => page.facts.navLinks.join('|')),
      helpSignatures: pages.map((page) =>
         JSON.stringify(
            page.facts.helpLinks
               .filter((link) => PHONE_LIKE.test(link.txt))
               .map((link) => [link.top, link.left]),
         ),
      ),
   };
}

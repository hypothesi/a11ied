import {
   createServer,
   type IncomingMessage,
   type Server,
   type ServerResponse,
} from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';
import type { SiteInventory } from '@a11ied/contracts';

import { discoverSite } from './runtime.js';

let server: Server | undefined = globalThis.undefined;
const BROWSER_TEST_TIMEOUT_MS = 90_000;
const CHILD_COUNT = 2;
const CRAWL_PAGE_COUNT = 3;

function respondWithRedirect(response: ServerResponse, location: string): void {
   response.statusCode = 302;
   response.setHeader('location', location);
   response.end();
}

function respondToFixture(input: {
   incrementRootRequests: () => void;
   origin: string;
   request: IncomingMessage;
   response: ServerResponse;
}): void {
   const { incrementRootRequests, origin, request, response } = input;
   const path = request.url ?? '/';
   const bodies: Record<string, string> = {
      '/robots.txt': 'User-agent: *\nAllow: /\n',
      '/sitemap.xml': `<urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/redirect</loc></url><url><loc>${origin}/article</loc></url><url><loc>${origin}/article-extra</loc></url><url><loc>${origin}/canonical</loc></url><url><loc>https://outside.invalid/</loc></url></urlset>`,
      '/': '<title>Home</title><h1>Welcome</h1><input type="password"><button>Delete account</button><a href="/article">Article</a>',
      '/article': `<title>Article</title><link rel="canonical" href="${origin}/canonical"><h1>Article</h1>`,
      '/canonical': '<title>Canonical</title><h1>Canonical article</h1>',
      '/crawl-only':
         '<title>Crawl</title><h1>Crawl</h1><a href="/child-one">One</a><a href="/child-two">Two</a>',
      '/child-one': '<title>One</title><h1>One</h1><a href="/crawl-only">Home</a>',
      '/child-two': '<title>Two</title><h1>Two</h1><a href="/crawl-only">Home</a>',
   };
   response.setHeader(
      'content-type',
      path.endsWith('.xml') ? 'application/xml' : 'text/html',
   );
   if (path === '/' || path === '/crawl-only') {
      incrementRootRequests();
   }
   if (path === '/redirect') {
      respondWithRedirect(response, `${origin}/`);
      return;
   }
   if (bodies[path]) {
      response.end(bodies[path]);
      return;
   }
   response.statusCode = 404;
   response.end('<title>Not found</title><h1>404 Not found</h1>');
}

async function startFixtureServer(): Promise<{
   origin: string;
   getRootRequests: () => number;
}> {
   let boundOrigin = '',
      rootRequests = 0;
   server = createServer((request, response) => {
      if (request.url === '/connection-failure') {
         response.destroy();
         return;
      }
      respondToFixture({
         request,
         response,
         origin: boundOrigin,
         incrementRootRequests: () => {
            rootRequests += 1;
         },
      });
   });
   await new Promise<void>((resolvePromise) => {
      server?.listen(0, '127.0.0.1', resolvePromise);
   });
   const address = server.address();
   if (!address || typeof address === 'string') {
      throw new Error('Fixture server did not bind to a TCP port.');
   }
   boundOrigin = `http://127.0.0.1:${String(address.port)}`;
   return { origin: boundOrigin, getRootRequests: () => rootRequests };
}

afterEach(async () => {
   await new Promise<void>((resolvePromise, reject) => {
      if (!server) {
         resolvePromise();
         return;
      }
      server.close((error) => (error ? reject(error) : resolvePromise()));
   });
   server = undefined;
});

describe('discoverSite', () => {
   it(
      'completes page scope without following outgoing links',
      async () => {
         const { origin } = await startFixtureServer();
         const inventory = await discoverSite(`${origin}/`, {
            scope: 'page',
            timeoutMs: 5000,
         });

         expect(inventory.discovery.complete).toStrictEqual(true);
         expect(inventory.discovery.pendingUrls).to.eql([]);
         expect(inventory.pages).toHaveLength(1);
      },
      BROWSER_TEST_TIMEOUT_MS,
   );

   it(
      'filters sitemap seeds by origin, section and excluded paths',
      async () => {
         const { origin } = await startFixtureServer();
         const section = await discoverSite(`${origin}/article`, {
            scope: 'section',
            timeoutMs: 5000,
         });
         const excluded = await discoverSite(`${origin}/`, {
            exclude: ['/article'],
            timeoutMs: 5000,
         });

         expect(section.pages.map((page) => page.url)).to.eql([`${origin}/article`]);
         expect(
            excluded.pages.some((page) => page.url === `${origin}/article`),
         ).toStrictEqual(false);
         expect(
            excluded.pages.every((page) => new URL(page.url).origin === origin),
         ).toStrictEqual(true);
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

describe('discovery page limits', () => {
   it(
      'resumes a limited crawl from its saved frontier without revisiting resolved pages',
      async () => {
         const fixture = await startFixtureServer();
         const first = await discoverSite(`${fixture.origin}/crawl-only`, {
            sitemapUrl: `${fixture.origin}/missing-sitemap`,
            maxPages: 1,
            timeoutMs: 5000,
         });
         const beforeCount = fixture.getRootRequests();
         const stillLimited = await discoverSite(first.startUrl, { resumeFrom: first });
         const resumed = await discoverSite(first.startUrl, {
            resumeFrom: first,
            maxPages: 10,
            timeoutMs: 5000,
         });

         expect(first.discovery.complete).toStrictEqual(false);
         expect(first.discovery.pendingUrls).toHaveLength(CHILD_COUNT);
         expect(stillLimited.pages).toHaveLength(1);
         expect(stillLimited.discovery.complete).toStrictEqual(false);
         expect(stillLimited.discovery.pendingUrls).toHaveLength(CHILD_COUNT);
         expect(resumed.discovery.complete).toStrictEqual(true);
         expect(resumed.discovery.truncatedReason).toBeUndefined();
         expect(resumed.pages).toHaveLength(CRAWL_PAGE_COUNT);
         expect(fixture.getRootRequests()).toStrictEqual(beforeCount);
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

describe('discovery failures', () => {
   it(
      'keeps a failed page inventory incomplete after resume',
      async () => {
         const { origin } = await startFixtureServer();
         const failed = await discoverSite(`${origin}/connection-failure`, {
            scope: 'page',
            timeoutMs: 5000,
         });
         const resumed = await discoverSite(failed.startUrl, { resumeFrom: failed });

         expect(failed.pages[0]?.discoveryStatus).toStrictEqual('error');
         expect(failed.discovery.complete).toStrictEqual(false);
         expect(resumed.discovery.complete).toStrictEqual(false);
         expect(resumed.discovery.truncatedReason).toContain('Page discovery failed');
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

describe('discovery checkpoints', () => {
   it(
      'keeps the frontier in the last checkpoint when interrupted after a page',
      async () => {
         const { origin } = await startFixtureServer();
         const checkpoints: SiteInventory[] = [];
         await expect(
            discoverSite(`${origin}/crawl-only`, {
               sitemapUrl: `${origin}/missing-sitemap`,
               timeoutMs: 5000,
               onProgress: (inventory) => {
                  if (inventory.pages.length === 1) {
                     checkpoints.push(inventory);
                     throw new Error('Interrupted fixture');
                  }
               },
            }),
         ).rejects.toThrow('Interrupted fixture');
         const checkpoint = checkpoints[0];
         if (!checkpoint) {
            throw new Error('No checkpoint was captured.');
         }
         const resumed = await discoverSite(checkpoint.startUrl, {
            resumeFrom: checkpoint,
            timeoutMs: 5000,
         });

         expect(resumed.discovery.complete).toStrictEqual(true);
         expect(resumed.pages).toHaveLength(CRAWL_PAGE_COUNT);
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

describe('discovery page records', () => {
   it(
      'captures page signals, canonical duplicates, and an error probe',
      async () => {
         const { origin } = await startFixtureServer();
         const inventory = await discoverSite(`${origin}/`, {
               probeErrorPages: true,
               concurrency: 4,
               timeoutMs: 5000,
            }),
            root = inventory.pages.find((page) => page.finalUrl === `${origin}/`);

         expect(root?.error?.message).toBeUndefined();
         expect(root?.title).toStrictEqual('Home');
         expect(root?.requiresAuth).toStrictEqual(true);
         expect(root?.hasDestructiveActions).toStrictEqual(true);
         expect(
            inventory.pages.some((page) => page.isDuplicateOf !== undefined),
         ).toStrictEqual(true);
         expect(
            inventory.pages.some(
               (page) =>
                  page.isDuplicateOf !== undefined && page.isDuplicateOf !== page.pageId,
            ),
         ).toStrictEqual(true);
         expect(new Set(inventory.pages.map((page) => page.pageId)).size).toStrictEqual(
            inventory.pages.length,
         );
         expect(
            inventory.pages.some((page) => page.discoveredVia === 'error-probe'),
         ).toStrictEqual(true);
         expect(inventory.templates).toEqual([]);
      },
      BROWSER_TEST_TIMEOUT_MS,
   );

   it(
      'does not revisit a resolved page when resuming',
      async () => {
         const fixture = await startFixtureServer();
         const first = await discoverSite(`${fixture.origin}/`, {
               scope: 'page',
               timeoutMs: 5000,
            }),
            firstRequestCount = fixture.getRootRequests();
         await discoverSite(`${fixture.origin}/`, {
            scope: 'page',
            resumeFrom: first,
            timeoutMs: 5000,
         });

         expect(fixture.getRootRequests()).toStrictEqual(firstRequestCount);
         expect(first.pages[0]?.pageId).toBeTruthy();
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

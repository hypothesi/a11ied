import {
   createServer,
   type IncomingMessage,
   type Server,
   type ServerResponse,
} from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverSite } from './runtime.js';

let server: Server | undefined = globalThis.undefined;
const BROWSER_TEST_TIMEOUT_MS = 90_000;

function respondToFixture(input: {
   incrementRootRequests: () => void;
   origin: string;
   request: IncomingMessage;
   response: ServerResponse;
}): void {
   const { incrementRootRequests, origin, request, response } = input;
   const path = request.url ?? '/';
   const bodies: Record<string, string> = {
      '/robots.txt': `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
      '/sitemap.xml': `<urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/article</loc></url><url><loc>${origin}/canonical</loc></url></urlset>`,
      '/': '<title>Home</title><h1>Welcome</h1><input type="password"><button>Delete account</button><a href="/article">Article</a>',
      '/article': `<title>Article</title><link rel="canonical" href="${origin}/canonical"><h1>Article</h1>`,
      '/canonical': '<title>Canonical</title><h1>Canonical article</h1>',
   };
   response.setHeader(
      'content-type',
      path.endsWith('.xml') ? 'application/xml' : 'text/html',
   );
   if (path === '/') {
      incrementRootRequests();
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

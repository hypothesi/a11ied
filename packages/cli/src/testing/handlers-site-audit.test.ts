import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { siteInventorySchema } from '#contracts';
import { handleAuditDiscoverAction } from '../commands/audit-discover-actions.js';
import { handleReportBuildAction } from '../commands/report-actions.js';

let server: Server | undefined = globalThis.undefined;
const BROWSER_TEST_TIMEOUT_MS = 90_000;

async function startPage(): Promise<string> {
   server = createServer((request, response) => {
      if (request.url === '/robots.txt' || request.url === '/sitemap.xml') {
         response.statusCode = 404;
         response.end();
         return;
      }
      response.setHeader('content-type', 'text/html');
      response.end('<title>Fixture</title><main><h1>Fixture page</h1></main>');
   });
   await new Promise<void>((done) => {
      server?.listen(0, '127.0.0.1', done);
   });
   const address = server.address();
   if (!address || typeof address === 'string') {
      throw new Error('Fixture server did not bind.');
   }
   return `http://127.0.0.1:${String(address.port)}/`;
}

afterEach(async () => {
   await new Promise<void>((done, reject) => {
      if (!server) {
         done();
         return;
      }
      server.close((error) => (error ? reject(error) : done()));
   });
   server = undefined;
});

describe('audit discover handler', () => {
   it(
      'writes a resumable discovery inventory',
      async () => {
         const directory = await mkdtemp(resolve(tmpdir(), 'a11ied-discover-')),
            inventoryPath = resolve(directory, 'inventory.json');
         try {
            const url = await startPage();
            const first = await handleAuditDiscoverAction(url, {
                  scope: 'page',
                  timeout: '5000',
                  out: inventoryPath,
               }),
               persisted = siteInventorySchema.parse(
                  JSON.parse(await readFile(inventoryPath, 'utf8')),
               ),
               resumed = await handleAuditDiscoverAction(url, {
                  scope: 'page',
                  timeout: '5000',
                  resumeFrom: inventoryPath,
                  out: inventoryPath,
               });

            expect(first.result.pages).toHaveLength(1);
            expect(resumed.result.pages[0]?.pageId).toStrictEqual(
               first.result.pages[0]?.pageId,
            );
            expect(persisted.pages).toHaveLength(1);
         } finally {
            await rm(directory, { recursive: true, force: true });
         }
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

describe('report build handler', () => {
   it(
      'always writes report.json when formats omit it',
      async () => {
         const directory = await mkdtemp(resolve(tmpdir(), 'a11ied-report-handler-')),
            inventoryPath = resolve(directory, 'inventory.json'),
            reportDir = resolve(directory, 'report');
         try {
            const url = await startPage();
            await handleAuditDiscoverAction(url, {
               scope: 'page',
               timeout: '5000',
               out: inventoryPath,
            });
            const result = await handleReportBuildAction({
               inventory: inventoryPath,
               resultsDir: resolve(directory, 'pages'),
               out: reportDir,
               formats: 'html',
            });

            expect(result.result.outputFiles).toContain(
               resolve(reportDir, 'report.json'),
            );
            expect(
               JSON.parse(await readFile(resolve(reportDir, 'report.json'), 'utf8')),
            ).toHaveProperty('pages');
         } finally {
            await rm(directory, { recursive: true, force: true });
         }
      },
      BROWSER_TEST_TIMEOUT_MS,
   );
});

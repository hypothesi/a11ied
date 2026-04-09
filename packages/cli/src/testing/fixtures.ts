import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';

export const HTTP_STATUS_OK = 200;
export const HTTP_STATUS_NOT_FOUND = 404;

const fixtureRoot = resolve(import.meta.dirname, '../../test/fixtures');
const storybookFixtureRoot = resolve(
   import.meta.dirname,
   '../../../storybook/test-fixtures',
);

export interface TestServerHandle {
   server: ReturnType<typeof createServer>;
   getBaseUrl: () => string;
   start: () => Promise<void>;
   stop: () => Promise<void>;
}

function getContentType(pathname: string): string {
   const extension = extname(pathname).toLowerCase();
   if (extension === '.json') {
      return 'application/json; charset=utf-8';
   }
   if (extension === '.js') {
      return 'text/javascript; charset=utf-8';
   }
   if (extension === '.css') {
      return 'text/css; charset=utf-8';
   }
   return 'text/html; charset=utf-8';
}

function createStaticServer(root: string): TestServerHandle {
   let baseUrl = '';
   const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const filePath = resolve(root, `.${requestUrl.pathname}`);
      try {
         const content = readFileSync(filePath, 'utf8');
         response.writeHead(HTTP_STATUS_OK, {
            'content-type': getContentType(requestUrl.pathname),
         });
         response.end(content);
      } catch {
         response.writeHead(HTTP_STATUS_NOT_FOUND, {
            'content-type': 'text/plain; charset=utf-8',
         });
         response.end('not found');
      }
   });

   return {
      server,
      getBaseUrl: (): string => baseUrl,
      start: (): Promise<void> =>
         new Promise<void>((done) => {
            server.listen(0, '127.0.0.1', () => {
               const address = server.address();
               if (!address || typeof address === 'string') {
                  throw new Error('expected an address object');
               }
               baseUrl = `http://127.0.0.1:${address.port}`;
               done();
            });
         }),
      stop: (): Promise<void> =>
         new Promise<void>((done, fail) => {
            server.close((error) => {
               if (error) {
                  fail(error);
                  return;
               }
               done();
            });
         }),
   };
}

export function createTestServer(): TestServerHandle {
   return createStaticServer(fixtureRoot);
}

export function createStorybookTestServer(): TestServerHandle {
   return createStaticServer(storybookFixtureRoot);
}

export async function createTempRoot(tempRoots: string[]): Promise<string> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11ied-cli-'));
   tempRoots.push(root);
   return root;
}

export async function cleanupTempRoots(tempRoots: string[]): Promise<void> {
   const roots = tempRoots.splice(0);
   await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}

export async function withTempDir(
   tempRoots: string[],
   fn: (tempRoot: string) => Promise<void>,
): Promise<void> {
   const tempRoot = await createTempRoot(tempRoots);
   const previousCwd = process.cwd();
   process.chdir(tempRoot);
   try {
      await fn(tempRoot);
   } finally {
      process.chdir(previousCwd);
   }
}

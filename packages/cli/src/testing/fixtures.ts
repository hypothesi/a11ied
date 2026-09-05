import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';

import { DRIVER_MODE_ENV_VAR, STATE_DIR_ENV_VAR } from '#core';

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NOT_FOUND = 404;

const fixtureRoot = resolve(import.meta.dirname, '../../test/fixtures');
const { env: processEnv } = process;

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

export async function createTempRoot(tempRoots: string[]): Promise<string> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11ied-cli-'));
   tempRoots.push(root);
   return root;
}

export async function cleanupTempRoots(tempRoots: string[]): Promise<void> {
   const roots = tempRoots.splice(0);
   await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}

function restoreEnv(name: string, previous: string | undefined): void {
   if (previous === undefined) {
      delete processEnv[name];
      return;
   }
   processEnv[name] = previous;
}

/**
 * Runs one test against a fresh per-test state directory. Driver sessions started inside
 * this process stay in-process; CLIs spawned by `runCli` inherit the same directory and
 * run a real broker there.
 */
export async function withStateDir(
   tempRoots: string[],
   fn: (stateDir: string) => Promise<void>,
): Promise<void> {
   const stateDir = await createTempRoot(tempRoots);
   const previousStateDir = processEnv[STATE_DIR_ENV_VAR],
         previousMode = processEnv[DRIVER_MODE_ENV_VAR];
   processEnv[STATE_DIR_ENV_VAR] = stateDir;
   processEnv[DRIVER_MODE_ENV_VAR] = 'in-process';
   try {
      await fn(stateDir);
   } finally {
      restoreEnv(STATE_DIR_ENV_VAR, previousStateDir);
      restoreEnv(DRIVER_MODE_ENV_VAR, previousMode);
   }
}

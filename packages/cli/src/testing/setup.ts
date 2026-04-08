import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';

import { vi } from 'vitest';

import { buildCli } from '../program.js';

export const HTTP_STATUS_OK = 200;
export const HTTP_STATUS_NOT_FOUND = 404;
export const EXIT_SUCCESS = 0;
export const EXIT_USAGE = 2;
export const EXIT_ENVIRONMENT = 3;
export const EXIT_ASSERTION = 4;
export const MIN_AA_CRITERIA_COUNT = 24;
export const TEST_TIMEOUT_SHORT = 20_000;
export const TEST_TIMEOUT_MEDIUM = 30_000;
export const TEST_TIMEOUT_LONG = 60_000;
export const TEST_TIMEOUT_VERY_LONG = 120_000;
export const SEARCH_EXCERPT_LINES = 3;

const fixtureRoot = resolve(import.meta.dirname, '../../test/fixtures');
const storybookFixtureRoot = resolve(
   import.meta.dirname,
   '../../../storybook/test-fixtures',
);

export interface CliResult {
   status: number;
   stdout: string;
}

export interface TestServerHandle {
   server: ReturnType<typeof createServer>;
   getBaseUrl: () => string;
   start: () => Promise<void>;
   stop: () => Promise<void>;
}

function normalizeOutputChunk(chunk: string | Uint8Array): string {
   if (typeof chunk === 'string') {
      return chunk;
   }
   return Buffer.from(chunk).toString('utf8');
}

function captureCliOutput(output: string[]): { restore(): void } {
   const logSpy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      output.push(String(value ?? ''));
   });
   const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array,
   ) => {
      output.push(normalizeOutputChunk(chunk));
      return true;
   }) as typeof process.stdout.write);

   return {
      restore(): void {
         stdoutWriteSpy.mockRestore();
         logSpy.mockRestore();
      },
   };
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

export async function runCli(args: string[]): Promise<CliResult> {
   const output: string[] = [];
   const capturedOutput = captureCliOutput(output);
   const previousExitCode = process.exitCode;
   process.exitCode = 0;
   try {
      await buildCli().parseAsync(args, { from: 'user' });
      return {
         status: process.exitCode ?? 0,
         stdout: output.join('\n'),
      };
   } finally {
      process.exitCode = previousExitCode;
      capturedOutput.restore();
   }
}

export function parseJsonOutput(stdout: string): Record<string, unknown> {
   return JSON.parse(stdout) as Record<string, unknown>;
}

export async function createTempRoot(tempRoots: string[]): Promise<string> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11lied-cli-'));
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

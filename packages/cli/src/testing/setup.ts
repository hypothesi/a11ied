import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { buildCli } from '../program.js';
import { cleanupTempRoots, createTestServer, type TestServerHandle } from './fixtures.js';
export {
   HTTP_STATUS_NOT_FOUND,
   HTTP_STATUS_OK,
   createStorybookTestServer,
   createTempRoot,
   createTestServer,
   cleanupTempRoots,
   type TestServerHandle,
   withTempDir,
} from './fixtures.js';

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

export interface CliResult {
   status: number;
   stdout: string;
}

export function useTestServer(tempRoots: string[]): TestServerHandle {
   const testServer = createTestServer();

   beforeAll(async () => {
      await testServer.start();
   });

   afterAll(async () => {
      await testServer.stop();
   });

   afterEach(async () => {
      await cleanupTempRoots(tempRoots);
   });

   return testServer;
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

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { cleanupTempRoots, createTestServer, type TestServerHandle } from './fixtures.js';
export {
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
export const TEST_TIMEOUT_VERY_LONG = 300_000;
export const SEARCH_EXCERPT_LINES = 3;
const { env: processEnv } = process;

export interface CliResult {
   status: number;
   stderr: string;
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

function getBuiltCliPath(): string {
   return resolve(import.meta.dirname, '../../dist/cli.js');
}

function normalizeOutputChunk(chunk: string | Uint8Array): string {
   if (typeof chunk === 'string') {
      return chunk;
   }
   return Buffer.from(chunk).toString();
}

function captureProcessOutput(): {
   restore: () => void;
   stderrChunks: string[];
   stdoutChunks: string[];
} {
   const stdoutChunks: string[] = [];
   const stderrChunks: string[] = [];
   const stdoutWrite = process.stdout.write.bind(process.stdout);
   const stderrWrite = process.stderr.write.bind(process.stderr);

   process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(normalizeOutputChunk(chunk));
      return true;
   }) as typeof process.stdout.write;
   process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(normalizeOutputChunk(chunk));
      return true;
   }) as typeof process.stderr.write;

   return {
      stdoutChunks,
      stderrChunks,
      restore: () => {
         process.stdout.write = stdoutWrite;
         process.stderr.write = stderrWrite;
      },
   };
}

function getChildEnv(): NodeJS.ProcessEnv {
   return Object.fromEntries(
      Object.entries(processEnv).filter(([key]) => {
         if (key === 'NODE_OPTIONS') {
            return false;
         }
         if (key.startsWith('VITEST')) {
            return false;
         }
         return !key.startsWith('__VITEST');
      }),
   );
}

export async function runCli(args: string[]): Promise<CliResult> {
   return new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, [getBuiltCliPath(), ...args], {
         cwd: process.cwd(),
         env: getChildEnv(),
         stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer | string) => {
         stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
         stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
         if (code !== 0 && code !== 2) {
            console.error(
               `CLI execution failed with code ${code}.\nArgs: ${args.join(' ')}\nStdout: ${stdout}\nStderr: ${stderr}`,
            );
         }
         resolveResult({
            status: code ?? 1,
            stderr,
            stdout,
         });
      });
   });
}

export async function runCliInProcess(args: string[]): Promise<CliResult> {
   const { buildCli } = await import('../program.js');
   const capture = captureProcessOutput();
   const originalExitCode = process.exitCode;
   process.exitCode = 0;

   try {
      await buildCli().parseAsync(args, { from: 'user' });
      return {
         status: process.exitCode ?? 0,
         stderr: capture.stderrChunks.join(''),
         stdout: capture.stdoutChunks.join(''),
      };
   } finally {
      capture.restore();
      process.exitCode = originalExitCode;
   }
}

export function parseJsonOutput(stdout: string): Record<string, unknown> {
   return JSON.parse(stdout) as Record<string, unknown>;
}

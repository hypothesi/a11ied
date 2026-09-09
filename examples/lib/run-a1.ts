import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The `a1` binary npm linked into this repository's node_modules. */
const A1_BIN = fileURLToPath(new URL('../../node_modules/.bin/a1', import.meta.url));
const { env: processEnv } = process;

export interface CommandResult {
   status: number;
   stdout: string;
   stderr: string;
}

export interface CommandOptions {
   /** Text written to the command's stdin, for `a1 sr batch` with no file argument. */
   input?: string;
   /** Where `a1 sr` keeps its session, so these tests never touch a person's own. */
   stateDir?: string;
}

/** Runs `a1` with the given arguments and collects what it printed. */
export async function runA1(
   args: string[],
   options: CommandOptions = {},
): Promise<CommandResult> {
   return new Promise((resolveResult, reject) => {
      const env: NodeJS.ProcessEnv = { ...processEnv, FORCE_COLOR: '0' };
      if (options.stateDir !== undefined) {
         env.A11IED_STATE_DIR = options.stateDir;
      }
      const child = spawn(A1_BIN, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '',
         stdout = '';

      child.stdin.end(options.input ?? '');
      child.stdout.on('data', (chunk: Buffer | string) => {
         stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
         stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
         resolveResult({ status: code ?? 1, stdout, stderr });
      });
   });
}

/** Runs `a1` with `--json` and returns the `result` of its output envelope. */
export async function runA1Json(
   args: string[],
   options: CommandOptions = {},
): Promise<{ status: number; result: unknown }> {
   const run = await runA1([...args, '--json'], options);
   const envelope: unknown = JSON.parse(run.stdout);
   const result =
      typeof envelope === 'object' && envelope !== null && 'result' in envelope
         ? envelope.result
         : undefined;

   return { status: run.status, result };
}

/** A directory that is removed again when `dispose` runs. */
export async function createTempDir(): Promise<{
   path: string;
   dispose: () => Promise<void>;
}> {
   const path = await mkdtemp(join(tmpdir(), 'reka-accordion-'));
   return {
      path,
      dispose: () => rm(path, { recursive: true, force: true }),
   };
}

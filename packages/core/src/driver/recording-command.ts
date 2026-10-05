import { spawn } from 'node:child_process';

import { CliEnvironmentError } from '../errors/cli-errors.js';

const MACOS_RECORDING_ARGS = ['-v', '-C', '-k', '-T0'] as const;

interface RecordingCommandResult {
   error: unknown;
   spawnFailed: boolean;
   code: number | undefined;
   signal: NodeJS.Signals | undefined;
}

function createRecordingCommandMessage(args: {
   absolutePath: string;
   code: number | undefined;
   signal: NodeJS.Signals | undefined;
   stderr: string;
}): string {
   const stderr = args.stderr.trim();
   if (stderr) {
      return stderr;
   }

   let exitSummary = 'signal unknown';
   if (args.code !== undefined) {
      exitSummary = `exit code ${String(args.code)}`;
   } else if (args.signal) {
      exitSummary = `signal ${args.signal}`;
   }

   return `The native recorder exited with ${exitSummary} before writing "${args.absolutePath}". Check Screen Recording permission for the current host app.`;
}

function collectRecordingStderr(child: ReturnType<typeof spawn>): () => string {
   if (!child.stderr) {
      return () => '';
   }

   let stderr = '';
   child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
   });
   return () => stderr;
}

function captureRecordingCompletion(
   child: ReturnType<typeof spawn>,
): Promise<RecordingCommandResult> {
   return new Promise<RecordingCommandResult>((resolvePromise) => {
      child.on('error', (error) => {
         resolvePromise({
            error,
            spawnFailed: child.pid === undefined,
            code: undefined,
            signal: undefined,
         });
      });
      child.on('exit', (code, signal) => {
         resolvePromise({
            error: undefined,
            spawnFailed: false,
            code: code ?? undefined,
            signal: signal ?? undefined,
         });
      });
   });
}

function assertSuccessfulRecordingCommand(args: {
   absolutePath: string;
   result: RecordingCommandResult;
   stderr: string;
}): void {
   if (!args.result.error && args.result.code === 0) {
      return;
   }

   if (args.result.error instanceof Error && !args.result.spawnFailed) {
      throw args.result.error;
   }

   const failure = new CliEnvironmentError(
      'recording-command-failed',
      createRecordingCommandMessage({
         absolutePath: args.absolutePath,
         code: args.result.code,
         signal: args.result.signal,
         stderr: args.stderr,
      }),
      {
         path: args.absolutePath,
         code: args.result.code,
         signal: args.result.signal,
         stderr: args.stderr || undefined,
         reason:
            args.result.error instanceof Error ? args.result.error.message : undefined,
      },
   );
   failure.cause = args.result.error;
   throw failure;
}

export function createMacOSStopRecording(absolutePath: string): () => Promise<void> {
   const child = spawn('/usr/sbin/screencapture', [
      ...MACOS_RECORDING_ARGS,
      absolutePath,
   ]);
   const readStderr = collectRecordingStderr(child);
   const completion = captureRecordingCompletion(child);

   return async () => {
      if (child.pid !== undefined) {
         child.stdin.write('q');
         child.stdin.end();
      }
      const result = await completion;
      assertSuccessfulRecordingCommand({
         absolutePath,
         result,
         stderr: readStderr(),
      });
   };
}

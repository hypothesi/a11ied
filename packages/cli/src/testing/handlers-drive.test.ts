import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
   withTempDir,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   EXIT_USAGE,
   TEST_TIMEOUT_SHORT,
   useTestServer,
} from './setup.js';
import { expectFirstErrorMessage, expectJsonLogCursor } from './helpers.js';

const tempRoots: string[] = [];
useTestServer(tempRoots);
const virtualTargetArgs = ['--target', 'virtual', '--allow-virtual'];

function getImplicitDriveSessionFile(): string {
   return resolve(process.cwd(), '.a11ied/state/current-drive-session');
}

async function startSession(): Promise<string> {
   const started = await runCli(['sr', 'start', ...virtualTargetArgs, '--json']);
   const json = parseJsonOutput(started.stdout);
   return (json.result as { session: { sessionId: string } }).session.sessionId;
}

async function stopSession(sessionId: string): Promise<void> {
   await runCli(['sr', 'stop', '--session', sessionId, '--json']);
}

async function assertSessionStart(): Promise<string> {
   const started = await runCli(['sr', 'start', ...virtualTargetArgs, '--json']);
   const json = parseJsonOutput(started.stdout);
   const session = (
      json.result as {
         session: { sessionId: string; metadataFile: string; target: string };
      }
   ).session;
   expect(started.status).toBe(EXIT_SUCCESS);
   expect(session.sessionId).toMatch(/^drv_/);
   expect(session.target).toBe('virtual');
   return session.sessionId;
}

async function assertSessionStatus(sessionId: string): Promise<void> {
   const result = await runCli(['sr', 'status', '--session', sessionId, '--json']);
   const json = expectJsonLogCursor(result);
   expect(
      (json.result as { state: { lastSpokenPhrase: string | null } }).state
         .lastSpokenPhrase,
   ).toBeTruthy();
}

async function assertSessionStop(sessionId: string): Promise<void> {
   const result = await runCli(['sr', 'stop', '--session', sessionId, '--json']);
   const json = parseJsonOutput(result.stdout);

   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { session: { sessionId: string } }).session.sessionId).toBe(
      sessionId,
   );
}

async function assertStartTextOutput(): Promise<void> {
   const result = await runCli(['sr', 'start', ...virtualTargetArgs]);
   const sessionId = result.stdout.match(/Session ID: (drv_[a-f0-9-]+)/)?.[1];

   expect(result.status).toBe(EXIT_SUCCESS);
   expect(result.stdout).toContain('Drive session ready');
   expect(result.stdout).toMatch(/Session ID: drv_[a-f0-9-]+/);
   expect(result.stdout).toContain('Broker PID:');
   expect(sessionId).toBeTruthy();

   await runCli(['sr', 'stop', '--session', sessionId ?? '', '--json']);
}

async function assertMissingSessionError(): Promise<void> {
   const result = await runCli([
      'sr',
      'status',
      '--session',
      'missing-session',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);

   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { noSession?: boolean }).noSession).toBe(true);
}

async function assertNextRequiresSession(): Promise<void> {
   const result = await runCli(['sr', 'next', ...virtualTargetArgs, '--json']);
   expectFirstErrorMessage({
      result,
      match: /session id is required/i,
   });
}

async function assertNoSessionsDir(tempRoot: string): Promise<void> {
   const sessionsDir = resolve(tempRoot, '.a11ied/state/sessions');
   let entries: string[] = [];
   try {
      entries = await readdir(sessionsDir);
   } catch {
      entries = [];
   }
   expect(entries).toEqual([]);
}

async function assertEphemeralAction(tempRoot: string): Promise<void> {
   const result = await runCli([
      'sr',
      'next',
      ...virtualTargetArgs,
      '--ephemeral',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { action: string }).action).toBe('next');
   await assertNoSessionsDir(tempRoot);
}

async function assertVirtualRecordingRejected(): Promise<void> {
   const result = await runCli([
      'sr',
      'start',
      ...virtualTargetArgs,
      '--recording',
      './recordings/virtual.mov',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_USAGE);
   expect((json.errors as Array<{ code: string }>)[0]?.code).toBe(
      'recording-target-unsupported',
   );
}

async function assertReadState(sessionId: string): Promise<void> {
   const result = await runCli(['sr', 'read', '--session', sessionId, '--json']);
   const json = expectJsonLogCursor(result);
   expect(
      (json.result as { state: { lastSpokenPhrase: string | null } }).state
         .lastSpokenPhrase,
   ).toBeTruthy();
}

async function assertClearLogs(sessionId: string): Promise<void> {
   await runCli(['sr', 'next', '--session', sessionId, '--json']);
   const result = await runCli(['sr', 'clear-logs', '--session', sessionId, '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { action: string }).action).toBe('clear-logs');
}

async function assertFocus(sessionId: string): Promise<void> {
   const result = await runCli([
      'sr',
      'focus',
      '--session',
      sessionId,
      '--app',
      'Test App',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { action: string }).action).toBe('focus');
   expect(
      (json.result as { details?: { focus?: { status?: string } } }).details?.focus
         ?.status,
   ).toBe('skipped');
}

async function assertLogsAfterClear(sessionId: string): Promise<void> {
   const result = await runCli(['sr', 'logs', '--session', sessionId, '--json']);
   const json = parseJsonOutput(result.stdout);

   expect(result.status).toBe(EXIT_SUCCESS);
   expect(
      (json.result as { state: { spokenPhraseLog: string[] } }).state.spokenPhraseLog,
   ).toEqual([]);
   const verbose = await runCli(['sr', 'logs', '--session', sessionId, '--verbose']);
   expect(verbose.stdout).toContain('Checkpoints:');
}

async function assertImplicitSessionReuse(): Promise<void> {
   const sessionId = await startSession();
   const status = await runCli(['sr', 'status', '--json']);
   const statusJson = parseJsonOutput(status.stdout);
   const stopped = await runCli(['sr', 'stop', '--json']);
   const stoppedJson = parseJsonOutput(stopped.stdout);

   expect(status.status).toBe(EXIT_SUCCESS);
   expect(
      (statusJson.result as { session: { sessionId: string } }).session.sessionId,
   ).toBe(sessionId);
   expect(stopped.status).toBe(EXIT_SUCCESS);
   expect(
      (stoppedJson.result as { session: { sessionId: string } }).session.sessionId,
   ).toBe(sessionId);
}

async function assertStaleImplicitSessionClears(): Promise<void> {
   const implicitDriveSessionFile = getImplicitDriveSessionFile();

   await mkdir(resolve(process.cwd(), '.a11ied/state'), { recursive: true });
   await writeFile(implicitDriveSessionFile, 'missing-session\n', 'utf8');
   const result = await runCli(['sr', 'status', '--json']);
   const json = parseJsonOutput(result.stdout);

   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { noSession?: boolean }).noSession).toBe(true);
   await expect(readFile(implicitDriveSessionFile, 'utf8')).rejects.toThrow();
}

describe('cli sr lifecycle commands', () => {
   it(
      'starts, checks status, and stops a session',
      () =>
         withTempDir(tempRoots, async () => {
            await assertStartTextOutput();
            const sessionId = await assertSessionStart();
            await assertSessionStatus(sessionId);
            await assertSessionStop(sessionId);
            await assertMissingSessionError();
         }),
      TEST_TIMEOUT_SHORT,
   );

   it(
      'handles ephemeral and action scenarios',
      () =>
         withTempDir(tempRoots, async (tempRoot) => {
            await assertNextRequiresSession();
            await assertImplicitSessionReuse();
            await assertStaleImplicitSessionClears();
            await assertVirtualRecordingRejected();
            await assertEphemeralAction(tempRoot);
            const sessionId = await startSession();
            await assertReadState(sessionId);
            await assertClearLogs(sessionId);
            await assertFocus(sessionId);
            await assertLogsAfterClear(sessionId);
            await stopSession(sessionId);
         }),
      TEST_TIMEOUT_SHORT,
   );
});

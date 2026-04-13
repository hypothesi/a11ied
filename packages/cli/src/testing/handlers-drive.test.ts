import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
   withTempDir,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   EXIT_USAGE,
   EXIT_ENVIRONMENT,
   TEST_TIMEOUT_SHORT,
   useTestServer,
} from './setup.js';
import { expectFirstErrorMessage, expectJsonLogCursor } from './helpers.js';

const tempRoots: string[] = [];
useTestServer(tempRoots);
const virtualTargetArgs = ['--target', 'virtual', '--allow-virtual'];

async function startSession(): Promise<string> {
   const started = await runCli(['drive', 'start', ...virtualTargetArgs, '--json']);
   const json = parseJsonOutput(started.stdout);
   return (json.result as { session: { sessionId: string } }).session.sessionId;
}

async function stopSession(sessionId: string): Promise<void> {
   await runCli(['drive', 'stop', '--session', sessionId, '--json']);
}

async function assertSessionStart(): Promise<string> {
   const started = await runCli(['drive', 'start', ...virtualTargetArgs, '--json']);
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
   const result = await runCli(['drive', 'status', '--session', sessionId, '--json']);
   const json = expectJsonLogCursor(result);
   expect(
      (json.result as { state: { lastSpokenPhrase: string | null } }).state
         .lastSpokenPhrase,
   ).toBeTruthy();
}

async function assertSessionStop(sessionId: string): Promise<void> {
   const result = await runCli(['drive', 'stop', '--session', sessionId, '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { session: { sessionId: string } }).session.sessionId).toBe(
      sessionId,
   );
}

async function assertMissingSessionError(): Promise<void> {
   const result = await runCli([
      'drive',
      'status',
      '--session',
      'missing-session',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ENVIRONMENT);
   expect((json.errors as Array<{ message: string }>)[0]?.message).toMatch(
      /missing-session/i,
   );
}

async function assertNextRequiresSession(): Promise<void> {
   const result = await runCli(['drive', 'next', ...virtualTargetArgs, '--json']);
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
      'drive',
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
      'drive',
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
   const result = await runCli(['drive', 'read', '--session', sessionId, '--json']);
   const json = expectJsonLogCursor(result);
   expect(
      (json.result as { state: { lastSpokenPhrase: string | null } }).state
         .lastSpokenPhrase,
   ).toBeTruthy();
}

async function assertClearLogs(sessionId: string): Promise<void> {
   await runCli(['drive', 'next', '--session', sessionId, '--json']);
   const result = await runCli(['drive', 'clear-logs', '--session', sessionId, '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { action: string }).action).toBe('clear-logs');
}

async function assertFocus(sessionId: string): Promise<void> {
   const result = await runCli([
      'drive',
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
   const result = await runCli(['drive', 'logs', '--session', sessionId, '--json']);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect(
      (json.result as { state: { spokenPhraseLog: string[] } }).state.spokenPhraseLog,
   ).toEqual([]);
   const verbose = await runCli(['drive', 'logs', '--session', sessionId, '--verbose']);
   expect(verbose.stdout).toContain('Checkpoints:');
}

describe('cli drive lifecycle commands', () => {
   it(
      'starts, checks status, and stops a session',
      () =>
         withTempDir(tempRoots, async () => {
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

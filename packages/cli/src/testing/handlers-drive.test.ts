import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
   withStateDir,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   EXIT_USAGE,
   TEST_TIMEOUT_LONG,
   useTestServer,
} from './setup.js';
import { expectFirstErrorMessage } from './helpers.js';

const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);
const virtualArgs = ['--sr', 'virtual', '--allow-virtual', '--idle-timeout', '1'];

interface SrResult {
   status: number;
   json: Record<string, unknown>;
   stdout: string;
}

interface SessionShape {
   sessionId: string;
   target: string;
   url?: string;
}

interface ActionShape {
   action: string;
   session: SessionShape;
   state: {
      lastSpokenPhrase: string | null;
      transcript: Array<{ index: number; at: string; phrase: string; checkpoint?: string }>;
   };
   details?: Record<string, unknown>;
}

async function sr(args: string[]): Promise<SrResult> {
   const result = await runCli(['sr', ...args, '--json']);
   return { status: result.status, json: parseJsonOutput(result.stdout), stdout: result.stdout };
}

function resultOf<T>(result: SrResult): T {
   return result.json.result as T;
}

function warningCodes(result: SrResult): string[] {
   return (result.json.warnings as Array<{ code: string }>).map((warning) => warning.code);
}

/** Runs one scenario in its own state directory and stops whatever session it leaves behind. */
function withSession(fn: (stateDir: string) => Promise<void>): () => Promise<void> {
   return () =>
      withStateDir(tempRoots, async (stateDir) => {
         try {
            await fn(stateDir);
         } finally {
            await runCli(['sr', 'stop', '--json']);
         }
      });
}

async function assertLifecycle(stateDir: string): Promise<void> {
   const text = await runCli(['sr', 'start', ...virtualArgs]);
   expect(text.status).toBe(EXIT_SUCCESS);
   expect(text.stdout).toContain('Session ready');
   expect(text.stdout).not.toContain('Session ID');

   const verbose = await runCli(['sr', 'start', ...virtualArgs, '--verbose']);
   expect(verbose.stdout).toMatch(/Session ID:\s+drv_[a-f0-9]+/);
   expect(verbose.stdout).toContain('Stopped the previous virtual session');

   const started = await sr(['start', ...virtualArgs]);
   expect(started.status).toBe(EXIT_SUCCESS);
   expect(warningCodes(started)).toContain('session-replaced');
   const session = resultOf<{ session: SessionShape }>(started).session;
   expect(session.sessionId).toMatch(/^drv_/);
   expect(session.target).toBe('virtual');

   const status = await sr(['status']);
   expect(status.status).toBe(EXIT_SUCCESS);
   expect(resultOf<ActionShape>(status).session.sessionId).toBe(session.sessionId);
   expect(resultOf<ActionShape>(status).state.transcript.length).toBeGreaterThanOrEqual(1);
   expect(await readFile(resolve(stateDir, 'session.json'), 'utf8')).toContain(session.sessionId);

   const read = await sr(['read']);
   expect(resultOf<ActionShape>(read).action).toBe('read');
   expect(resultOf<ActionShape>(read).state.lastSpokenPhrase).toBeTruthy();

   const outPath = resolve(stateDir, 'out', 'transcript.json');
   const stopped = await sr(['stop', '--out', outPath]);
   expect(stopped.status).toBe(EXIT_SUCCESS);
   expect(resultOf<{ transcriptFiles: Array<{ path: string }> }>(stopped).transcriptFiles[0]?.path).toBe(outPath);
   const written = JSON.parse(await readFile(outPath, 'utf8')) as { target: string; entries: unknown[] };
   expect(written.target).toBe('virtual');
   expect(written.entries.length).toBeGreaterThanOrEqual(1);

   const gone = await sr(['status']);
   expect(gone.status).toBe(EXIT_SUCCESS);
   expect(resultOf<{ noSession: boolean }>(gone).noSession).toBe(true);
}

async function assertNavigationAndTranscript(stateDir: string): Promise<void> {
   const pageUrl = `${testServer.getBaseUrl()}/basic-page.html`;
   const started = await sr(['start', pageUrl, ...virtualArgs]);
   expect(started.status).toBe(EXIT_SUCCESS);
   expect(resultOf<{ session: SessionShape }>(started).session.url).toBe(pageUrl);

   for (const verb of ['next', 'previous', 'top', 'bottom', 'escape', 'interact', 'stop-interacting', 'activate']) {
      const moved = await sr([verb]);
      expect(moved.status, verb).toBe(EXIT_SUCCESS);
      expect(resultOf<ActionShape>(moved).action).toBe(verb);
   }
   const doNext = await sr(['do', 'next']);
   expect(resultOf<ActionShape>(doNext).action).toBe('perform');

   const pressed = await sr(['press', 'Tab', 'Tab']);
   expect(pressed.status).toBe(EXIT_SUCCESS);
   expect(resultOf<ActionShape>(pressed).details?.keys).toEqual(['Tab', 'Tab']);

   await sr(['checkpoint', 'x']);
   await sr(['next']);
   const since = await sr(['transcript', '--since', 'x']);
   const entries = resultOf<{ transcript: { entries: ActionShape['state']['transcript'] } }>(since).transcript.entries;
   expect(entries.length).toBeGreaterThanOrEqual(1);
   expect(entries.every((entry) => entry.checkpoint === undefined)).toBe(true);
   expect(entries[0]?.at).toMatch(/^\d{4}-/);

   const mdPath = resolve(stateDir, 'transcript.md');
   const tail = await sr(['transcript', '--tail', '2', '--out', mdPath]);
   expect(tail.status).toBe(EXIT_SUCCESS);
   expect(await readFile(mdPath, 'utf8')).toContain('# Transcript: virtual on');

   const missing = await runCli(['sr', 'transcript', '--since', 'nope', '--json']);
   expectFirstErrorMessage({ result: missing, match: /No checkpoint named "nope"/ });

   const phrase = await runCli(['sr', 'next', '--phrase']);
   expect(phrase.stdout.trim().split('\n')).toHaveLength(1);
   expect(phrase.stdout.trim()).toBe(resultOf<ActionShape>(await sr(['read'])).state.lastSpokenPhrase);

   const otherUrl = `${testServer.getBaseUrl()}/dialog.html`;
   const opened = await sr(['open', otherUrl]);
   expect(opened.status).toBe(EXIT_SUCCESS);
   expect(resultOf<ActionShape>(await sr(['status'])).session.url).toBe(otherUrl);
}

async function assertAutoStart(): Promise<void> {
   const pressed = await sr(['press', 'Tab', ...virtualArgs]);
   expect(pressed.status).toBe(EXIT_SUCCESS);
   expect(warningCodes(pressed)).toContain('session-auto-started');
   expect(resultOf<ActionShape>(pressed).session.target).toBe('virtual');
   expect(resultOf<ActionShape>(await sr(['status'])).session.target).toBe('virtual');

   const ignored = await sr(['type', 'hello', '--sr', 'virtual', '--allow-virtual']);
   expect(warningCodes(ignored)).not.toContain('session-auto-started');

   await sr(['stop']);
   const next = await runCli(['sr', 'next', '--json']);
   expectFirstErrorMessage({ result: next, match: /No active screen reader session/ });
   const stop = await runCli(['sr', 'stop', '--json']);
   expectFirstErrorMessage({ result: stop, match: /No active screen reader session/ });
}

async function assertGuards(): Promise<void> {
   const recording = await sr(['start', ...virtualArgs, '--recording', './recordings/virtual.mov']);
   expect(recording.status).toBe(EXIT_USAGE);
   expect((recording.json.errors as Array<{ code: string }>)[0]?.code).toBe('recording-target-unsupported');

   await sr(['start', ...virtualArgs]);
   const focused = await sr(['focus', '--app', 'Test App']);
   expect(focused.status).toBe(EXIT_SUCCESS);
   expect((resultOf<ActionShape>(focused).details?.focus as { status: string }).status).toBe('skipped');
   const bare = await runCli(['sr', 'focus', '--json']);
   expectFirstErrorMessage({ result: bare, match: /did not open an app/ });

   const list = await runCli(['sr', 'list', '--sr', 'virtual']);
   expect(list.stdout).toContain('Portable');
   expect(list.stdout).toContain('bottom');
   expect(list.stdout).not.toContain('move-right');
   const unknown = await runCli(['sr', 'do', 'move-right', '--json']);
   expectFirstErrorMessage({ result: unknown, match: /was not found/ });
}

describe('cli sr lifecycle commands', () => {
   it('starts, replaces, reports, reads, and stops the one active session', withSession(assertLifecycle), TEST_TIMEOUT_LONG);

   it('navigates with the portable verbs and keeps a timestamped transcript', withSession(assertNavigationAndTranscript), TEST_TIMEOUT_LONG);

   it('auto-starts for press and type, and rejects other verbs without a session', withSession(assertAutoStart), TEST_TIMEOUT_LONG);

   it('rejects virtual recording, handles focus, and lists only portable commands for virtual', withSession(assertGuards), TEST_TIMEOUT_LONG);
});

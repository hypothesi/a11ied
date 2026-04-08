import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runInteractionPattern } from './pattern-runtime.js';
import { startDriverSession, stopDriverSession } from './driver-runtime.js';

const fixtureRoot = resolve(import.meta.dirname, '../../cli/test/fixtures');
const repoRoot = process.cwd();
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const ONE_MINUTE_MS = 60_000;
const THIRTY_SECONDS_MS = 30_000;

let baseUrl = '';
let server: ReturnType<typeof createServer> = undefined as unknown as ReturnType<
   typeof createServer
>;
const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11lied-pattern-'));
   tempRoots.push(root);
   return root;
}

beforeAll(async () => {
   server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const filePath = resolve(fixtureRoot, `.${requestUrl.pathname}`);

      try {
         const html = readFileSync(filePath, 'utf8');
         response.writeHead(HTTP_OK, { 'content-type': 'text/html; charset=utf-8' });
         response.end(html);
      } catch {
         response.writeHead(HTTP_NOT_FOUND, {
            'content-type': 'text/plain; charset=utf-8',
         });
         response.end('not found');
      }
   });

   await new Promise<void>((resolveServer) => {
      server.listen(0, '127.0.0.1', () => {
         const address = server.address();
         if (!address || typeof address === 'string') {
            throw new Error('expected an address object');
         }

         baseUrl = `http://127.0.0.1:${address.port}`;
         resolveServer();
      });
   });
});

afterAll(async () => {
   await new Promise<void>((resolveServer, rejectServer) => {
      server.close((error) => {
         if (error) {
            rejectServer(error);
            return;
         }

         resolveServer();
      });
   });
});

afterEach(async () => {
   await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
   tempRoots.length = 0;
});

function expectLandmarkLogs(result: {
   stepLog: unknown[];
   spokenPhraseLog: unknown[];
   itemTextLog: unknown[];
}): void {
   expect(result.stepLog.length).toBeGreaterThan(0);
   expect(result.spokenPhraseLog.length).toBeGreaterThan(0);
   expect(result.itemTextLog.length).toBeGreaterThan(0);
}

function expectStatusMessageResult(result: {
   stepLog: Array<{ id: string }>;
   spokenPhraseLog: string[];
   targetMetadata: Record<string, unknown>;
}): void {
   expect(result.stepLog.some((entry) => entry.id === 'trigger-status-message')).toBe(
      true,
   );
   expect(result.spokenPhraseLog).toContain('Profile saved successfully.');
   expect(result.targetMetadata.focusChangedUnexpectedly).toBe(false);
}

function expectDialogResult(result: {
   assertions: Array<{ id: string; status: string }>;
}): void {
   expect(result.assertions.find((entry) => entry.id === 'focus-entry')?.status).toBe(
      'passed',
   );
   expect(
      result.assertions.find((entry) => entry.id === 'focus-containment')?.status,
   ).toBe('passed');
   expect(result.assertions.find((entry) => entry.id === 'close-behavior')?.status).toBe(
      'passed',
   );
}

function expectFocusVisibilityResult(result: {
   assertions: Array<{ id: string; status: string }>;
   targetMetadata: Record<string, unknown>;
   browserEvidence: unknown[];
}): void {
   expect(result.assertions.length).toBeGreaterThan(0);
   expect(result.assertions.find((entry) => entry.id === 'focus-visible')?.status).toBe(
      'passed',
   );
   expect(
      result.assertions.find((entry) => entry.id === 'focus-geometry-collected')?.status,
   ).toBe('passed');
   expect(
      (result.targetMetadata as { overlapPixels?: number }).overlapPixels,
   ).toBeGreaterThan(0);
   expect(result.browserEvidence.length).toBeGreaterThan(0);
}

describe('interaction pattern landmark and heading evidence', () => {
   it(
      'returns landmark logs and heading order evidence',
      async () => {
         const cwd = await createTempRoot();
         process.chdir(cwd);

         try {
            const landmarks = await runInteractionPattern({
               patternId: 'landmark_sequence',
               url: `${baseUrl}/basic-page.html`,
               target: 'virtual',
            });
            expectLandmarkLogs(landmarks);

            const headings = await runInteractionPattern({
               patternId: 'heading_sequence',
               url: `${baseUrl}/basic-page.html`,
               target: 'virtual',
            });

            expect(
               (headings.targetMetadata.headings as Array<{ text: string }>)[0]?.text,
            ).toBe('Basic content page');
            expect(
               headings.assertions.some(
                  (entry) => entry.id === 'heading-order' && entry.status === 'passed',
               ),
            ).toBe(true);
         } finally {
            process.chdir(repoRoot);
         }
      },
      ONE_MINUTE_MS,
   );
});

describe('interaction pattern status, dialog, and focus evidence', () => {
   it(
      'captures status message, dialog, and focus visibility evidence',
      async () => {
         const cwd = await createTempRoot();
         process.chdir(cwd);

         try {
            const status = await runInteractionPattern({
               patternId: 'status_message_probe',
               url: `${baseUrl}/status-message.html`,
               target: 'virtual',
            });
            expectStatusMessageResult(status);

            const dialog = await runInteractionPattern({
               patternId: 'dialog_probe',
               url: `${baseUrl}/dialog.html`,
               target: 'virtual',
            });
            expectDialogResult(dialog);

            const focus = await runInteractionPattern({
               patternId: 'focus_visibility_probe',
               url: `${baseUrl}/focus-obscured.html`,
               target: 'virtual',
            });
            expectFocusVisibilityResult(focus);
         } finally {
            process.chdir(repoRoot);
         }
      },
      ONE_MINUTE_MS,
   );
});

describe('interaction pattern session reuse', () => {
   it(
      'reuses an existing session when one is provided',
      async () => {
         const cwd = await createTempRoot();
         process.chdir(cwd);

         try {
            const session = await startDriverSession('virtual');
            const result = await runInteractionPattern({
               patternId: 'landmark_sequence',
               url: `${baseUrl}/basic-page.html`,
               target: 'virtual',
               sessionId: session.sessionId,
            });

            expect(result.sessionId).toBe(session.sessionId);
            expect(result.managedSession).toBe(false);

            await stopDriverSession(session.sessionId);
         } finally {
            process.chdir(repoRoot);
         }
      },
      THIRTY_SECONDS_MS,
   );
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
   cleanupTempRoots,
   createTempRoot,
   createTestServer,
   type TestServerHandle,
} from '../../../cli/src/testing/fixtures.js';
import { startDriverSession, stopDriverSession } from '../driver/runtime.js';
import { runInteractionPattern } from './runtime.js';

const repoRoot = process.cwd();
const ONE_MINUTE_MS = 60_000;
const THIRTY_SECONDS_MS = 30_000;

let baseUrl = '';
const testServer: TestServerHandle = createTestServer();
const tempRoots: string[] = [];

beforeAll(async () => {
   await testServer.start();
   baseUrl = testServer.getBaseUrl();
});

afterAll(async () => {
   await testServer.stop();
});

afterEach(async () => {
   await cleanupTempRoots(tempRoots);
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
         const cwd = await createTempRoot(tempRoots);
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
         const cwd = await createTempRoot(tempRoots);
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
         const cwd = await createTempRoot(tempRoots);
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

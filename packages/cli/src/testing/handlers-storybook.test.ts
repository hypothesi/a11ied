import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createStorybookTestServer,
   cleanupTempRoots,
   withTempDir,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   EXIT_ENVIRONMENT,
   TEST_TIMEOUT_VERY_LONG,
} from './setup.js';

const storybookServer: TestServerHandle = createStorybookTestServer();
const tempRoots: string[] = [];

beforeAll(async () => {
   await storybookServer.start();
});

afterAll(async () => {
   await storybookServer.stop();
});

afterEach(async () => {
   await cleanupTempRoots(tempRoots);
});

const RANK_APPLICABLE = 4;
const RANK_LIKELY_APPLICABLE = 3;
const RANK_UNKNOWN = 2;

function rankApplicability(state: string): number {
   if (state === 'applicable') {
      return RANK_APPLICABLE;
   }
   if (state === 'likely-applicable') {
      return RANK_LIKELY_APPLICABLE;
   }
   if (state === 'unknown') {
      return RANK_UNKNOWN;
   }
   if (state === 'likely-not-applicable') {
      return 1;
   }
   return 0;
}

async function assertInspectableStoryTarget(baseUrl: string): Promise<void> {
   const result = await runCli([
      'inspect',
      'applicable',
      '--storybook-url',
      baseUrl,
      '--story-id',
      'forms-login--default',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.target as { kind: string; value: string }).kind).toBe('story');
   expect((json.target as { value: string }).value).toBe('forms-login--default');
   expect((json.target as { resolvedUrl: string }).resolvedUrl).toContain(
      'iframe.html?id=forms-login--default',
   );
}

async function assertMetadataInfluence(baseUrl: string): Promise<void> {
   const hintedResult = await runCli([
      'inspect',
      'criterion',
      '3.3.8',
      '--storybook-url',
      baseUrl,
      '--story-id',
      'forms-login--default',
      '--json',
   ]);
   const hinted = parseJsonOutput(hintedResult.stdout);
   const unhintedResult = await runCli([
      'inspect',
      'criterion',
      '3.3.8',
      '--storybook-url',
      baseUrl,
      '--story-id',
      'forms-login-no-hint--default',
      '--json',
   ]);
   const unhinted = parseJsonOutput(unhintedResult.stdout);
   const hintedState = (hinted.result as { assessment: { state: string } }).assessment
      .state;
   const unhintedState = (unhinted.result as { assessment: { state: string } }).assessment
      .state;
   expect(rankApplicability(hintedState)).toBeGreaterThanOrEqual(
      rankApplicability(unhintedState),
   );
}

async function assertDriveStartWithStory(baseUrl: string): Promise<void> {
   const started = await runCli([
      'drive',
      'start',
      '--target',
      'virtual',
      '--storybook-url',
      baseUrl,
      '--story-id',
      'dialogs-confirm-delete--default',
      '--json',
   ]);
   const json = parseJsonOutput(started.stdout);
   expect(started.status).toBe(EXIT_SUCCESS);
   expect((json.target as { kind: string; value: string }).kind).toBe('story');
   expect((json.target as { value: string }).value).toBe(
      'dialogs-confirm-delete--default',
   );

   const sessionId = (json.result as { session: { sessionId: string } }).session
      .sessionId;
   await runCli(['drive', 'stop', '--session', sessionId, '--json']);
}

async function assertVerifyStory(baseUrl: string): Promise<void> {
   const result = await runCli([
      'verify',
      'criterion',
      '4.1.3',
      '--storybook-url',
      baseUrl,
      '--story-id',
      'status-updates--default',
      '--target',
      'virtual',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const reportTarget = json.target as {
      kind: string;
      value: string;
      resolvedUrl: string;
      storybookBaseUrl: string;
   };
   expect(reportTarget.kind).toBe('story');
   expect(reportTarget.value).toBe('status-updates--default');
   expect(reportTarget.resolvedUrl).toContain('iframe.html?id=status-updates--default');
   expect(reportTarget.storybookBaseUrl).toBe(`${baseUrl}/`);

   const report = json.result as Record<string, unknown>;
   expect(Object.keys(report).toSorted()).toEqual([
      'criteria',
      'errors',
      'requestedScope',
      'summary',
      'target',
      'warnings',
      'wcagVersion',
   ]);
}

async function assertMissingStoryFailure(baseUrl: string): Promise<void> {
   const result = await runCli([
      'inspect',
      'applicable',
      '--storybook-url',
      baseUrl,
      '--story-id',
      'missing-story',
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_ENVIRONMENT);
   expect((json.errors as Array<{ code: string; message: string }>)[0]?.code).toBe(
      'storybook-story-not-found',
   );
   expect((json.errors as Array<{ message: string }>)[0]?.message).toMatch(
      /could not be resolved/i,
   );
}

describe('cli storybook target resolution', () => {
   it(
      'resolves story ids into iframe targets',
      () =>
         withTempDir(tempRoots, async () => {
            await assertInspectableStoryTarget(storybookServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'uses story metadata without weakening applicability',
      () =>
         withTempDir(tempRoots, async () => {
            await assertMetadataInfluence(storybookServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'starts driver sessions against story targets',
      () =>
         withTempDir(tempRoots, async () => {
            await assertDriveStartWithStory(storybookServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'verifies story targets through the shared runtime',
      () =>
         withTempDir(tempRoots, async () => {
            await assertVerifyStory(storybookServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );

   it(
      'fails deterministically when a story is missing',
      () =>
         withTempDir(tempRoots, async () => {
            await assertMissingStoryFailure(storybookServer.getBaseUrl());
         }),
      TEST_TIMEOUT_VERY_LONG,
   );
});

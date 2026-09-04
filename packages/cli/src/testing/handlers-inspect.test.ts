import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
   type TestServerHandle,
   createTestServer,
   runCli,
   parseJsonOutput,
   EXIT_SUCCESS,
   TEST_TIMEOUT_SHORT,
} from './setup.js';
import { expectFirstErrorMessage } from './helpers.js';

const testServer: TestServerHandle = createTestServer();

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
});

async function assertInspectApplicable(baseUrl: string): Promise<void> {
   const result = await runCli([
      'inspect',
      'applicable',
      '--url',
      `${baseUrl}/status-message.html`,
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   const payload = json.result as {
      matrix: { assessments: Record<string, { state: string; reasons: string[] }> };
      strategies: Record<string, { preferredEvidenceMode: string }>;
   };
   expect(payload.matrix.assessments['4.1.3']?.state).toBe('applicable');
   expect(payload.matrix.assessments['4.1.3']?.reasons.length).toBeGreaterThan(0);
   expect(payload.strategies['4.1.3']?.preferredEvidenceMode).toBe('hybrid');

   const text = await runCli([
      'inspect',
      'applicable',
      '--url',
      `${baseUrl}/status-message.html`,
   ]);
   expect(text.stdout).toContain('likely-applicable: only the criterion tags matched');
   expect(text.stdout).toContain(
      'Next: status_message_probe (hybrid); see a1 wcag 4.1.3',
   );
}

async function assertInspectCriterion(baseUrl: string): Promise<void> {
   const result = await runCli([
      'inspect',
      'criterion',
      '4.1.3',
      '--url',
      `${baseUrl}/status-message.html`,
      '--json',
   ]);
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as { criterion: { id: string } }).criterion.id).toBe('4.1.3');
   expect(
      (json.result as { assessment: { state: string } }).assessment.state,
   ).toBeTruthy();
   expect((json.result as { signals: unknown[] }).signals.length).toBeGreaterThan(0);
}

async function assertInspectInvalidCriterion(baseUrl: string): Promise<void> {
   const result = await runCli([
      'inspect',
      'criterion',
      '9.9.9',
      '--url',
      `${baseUrl}/basic-page.html`,
      '--json',
   ]);
   expectFirstErrorMessage({
      result,
      match: /9.9.9/i,
   });
}

async function assertTextCriterionSnapshot(baseUrl: string): Promise<void> {
   const criterion = await runCli([
      'inspect',
      'criterion',
      '4.1.3',
      '--url',
      `${baseUrl}/status-message.html`,
   ]);
   expect(criterion.stdout).toMatchInlineSnapshot(`
     "4.1.3  Status Messages  [AA]
       State:    applicable
       Meaning:  a page signal (a form, a dialog, a live region) matched the criterion
       Next:     status_message_probe (hybrid); see a1 wcag 4.1.3

     Reason
       Detected live region signals (aria-live region and role=status) and matching
       criterion tags (messaging, errors, forms, progress-steps, visual-cues, and
       content).

     Signals (5)
       • landmark  landmark structure  (dom, high)
       • heading  heading structure  (dom, high)
       • form  form controls  (dom, high)
       • live-region  aria-live region  (dom, high)
       • live-region  role=status  (a11y-tree, high)

     Elements (1)
       /html/body/main/div  <div role="status" aria-live="polite" id="save-status">
     "
   `);
}

async function assertTextVerboseCriterion(baseUrl: string): Promise<void> {
   const verboseCriterion = await runCli([
      'inspect',
      'criterion',
      '4.1.3',
      '--url',
      `${baseUrl}/status-message.html`,
      '--verbose',
   ]);
   expect(verboseCriterion.stdout).toContain('Signals (');
   expect(verboseCriterion.stdout).toContain('Elements (');
}

describe('cli inspect commands', () => {
   it('inspects applicable', async () => {
      await assertInspectApplicable(testServer.getBaseUrl());
   });
   it('inspects criterion', async () => {
      await assertInspectCriterion(testServer.getBaseUrl());
   });
   it('rejects invalid criterion', async () => {
      await assertInspectInvalidCriterion(testServer.getBaseUrl());
   });

   it(
      'keeps representative text output readable',
      async () => {
         const baseUrl = testServer.getBaseUrl();
         await assertTextCriterionSnapshot(baseUrl);
         await assertTextVerboseCriterion(baseUrl);
      },
      TEST_TIMEOUT_SHORT,
   );
});

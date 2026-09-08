import { describe, expect, it } from 'vitest';

import {
   EXIT_ASSERTION,
   EXIT_SUCCESS,
   EXIT_USAGE,
   TEST_TIMEOUT_LONG,
   parseJsonOutput,
   runCli,
   useTestServer,
   withStateDir,
} from './setup.js';

const tempRoots: string[] = [];
const testServer = useTestServer(tempRoots);
const startArgs = ['--sr', 'virtual', '--allow-virtual', '--idle-timeout', '1'];
const MAX_ELEMENTS = '12';

interface DriveResult {
   state: {
      lastSpokenPhrase: string | null;
      currentItem?: { role?: string; name?: string; states: string[] };
   };
   details?: { items?: Array<{ phrase?: string }> };
}

async function runSrJson(
   args: string[],
): Promise<{ status: number; result: DriveResult }> {
   const run = await runCli(['sr', ...args, '--json']);

   return {
      status: run.status,
      result: parseJsonOutput(run.stdout).result as DriveResult,
   };
}

async function phraseAfter(args: string[]): Promise<string> {
   const { status, result } = await runSrJson(args);

   expect(status, args.join(' ')).toBe(EXIT_SUCCESS);
   return result.state.lastSpokenPhrase ?? '';
}

async function elementPhrases(kind: string): Promise<string[]> {
   const { status, result } = await runSrJson(['elements', kind, '--max', MAX_ELEMENTS]);

   expect(status, `elements ${kind}`).toBe(EXIT_SUCCESS);
   return (result.details?.items ?? []).map((item) => item.phrase ?? '');
}

function onFixture(fixture: string, fn: () => Promise<void>): () => Promise<void> {
   return () =>
      withStateDir(tempRoots, async () => {
         const pageUrl = `${testServer.getBaseUrl()}/${fixture}`;
         const started = await runCli(['sr', 'start', pageUrl, ...startArgs, '--json']);

         expect(started.status).toBe(EXIT_SUCCESS);
         try {
            await fn();
         } finally {
            await runCli(['sr', 'stop', '--json']);
         }
      });
}

async function assertHeadingOutline(): Promise<void> {
   expect(await elementPhrases('heading')).toEqual([
      'heading, Site sections, level 2',
      'heading, Release notes, level 1',
      'heading, Version 4.2, level 3',
      'heading, Fixed in 4.2, level 4',
      'heading, Version 4.1, level 2',
      'heading, level 3',
      'heading, Older releases, level 1',
   ]);
   expect(await phraseAfter(['next', 'heading', '--level', '1'])).toBe(
      'heading, Release notes, level 1',
   );
   expect(await phraseAfter(['next', 'heading', '--level', '4'])).toBe(
      'heading, Fixed in 4.2, level 4',
   );
   expect(await phraseAfter(['previous', 'heading'])).toBe(
      'heading, Version 4.2, level 3',
   );

   const phraseOnly = await runCli(['sr', 'next', 'heading', '--phrase']);

   expect(phraseOnly.status).toBe(EXIT_SUCCESS);
   expect(phraseOnly.stdout.trim()).toBe('heading, Fixed in 4.2, level 4');
}

async function assertLandmarkMaze(): Promise<void> {
   expect(await elementPhrases('landmark')).toEqual([
      'banner',
      'navigation',
      'navigation',
      'main',
      'region, Alerts',
      'main',
      'contentinfo',
   ]);
   expect(await elementPhrases('region')).toEqual(['region, Alerts']);
   expect(await phraseAfter(['goto', '--role', 'region', '--name', 'Alerts'])).toBe(
      'region, Alerts',
   );

   const missing = await runCli([
      'sr',
      'goto',
      '--role',
      'region',
      '--name',
      'Billing',
      '--json',
   ]);

   expect(missing.status).toBe(EXIT_ASSERTION);
}

async function assertWidgetStates(): Promise<void> {
   expect(await elementPhrases('button')).toEqual([
      'button',
      'button, Delete draft',
      'button, Export report',
      'button, Mute alerts, not pressed',
      'button, Email digest, not pressed',
   ]);
   expect(await elementPhrases('form-field')).toEqual([
      'textbox',
      'textbox, Report title',
   ]);

   /*
    * The phrase says "not checked" either way, because the reader supplies the default
    * for the role. `states` comes from the attributes, so only the checkbox that sets
    * aria-checked reports one.
    */
   const stateless = await runSrJson([
      'goto',
      '--role',
      'checkbox',
      '--name',
      'Send release notes',
   ]);

   expect(stateless.result.state.lastSpokenPhrase).toBe(
      'checkbox, Send release notes, not checked',
   );
   const statelessRead = await runSrJson(['read']);

   expect(statelessRead.result.state.currentItem).toMatchObject({
      role: 'checkbox',
      name: 'Send release notes',
      states: [],
   });

   await runSrJson(['goto', '--role', 'checkbox', '--name', 'Send incident reports']);
   const statefulRead = await runSrJson(['read']);

   expect(statefulRead.result.state.currentItem).toMatchObject({ states: ['unchecked'] });
}

async function assertFormStates(): Promise<void> {
   expect(await phraseAfter(['next', 'form-field'])).toBe(
      'textbox, placeholder Team name',
   );
   expect(await phraseAfter(['goto', '--role', 'textbox', '--name', 'Work email'])).toBe(
      'textbox, Work email, Enter an address on your company domain., invalid, required',
   );

   const { result } = await runSrJson(['read']);

   expect(result.state.currentItem?.states).toEqual(['required', 'invalid']);
   expect(await phraseAfter(['find', 'Billing period'])).toContain('Billing period');

   const notFound = await runCli(['sr', 'find', 'a phrase that is not here', '--json']);

   expect(notFound.status).toBe(EXIT_ASSERTION);
}

describe('cli sr against the fixture widget pages', () => {
   it(
      'walks a heading outline that skips levels',
      onFixture('heading-outline.html', assertHeadingOutline),
      TEST_TIMEOUT_LONG,
   );

   it(
      'lists duplicate landmarks and only the named region',
      onFixture('landmark-maze.html', assertLandmarkMaze),
      TEST_TIMEOUT_LONG,
   );

   it(
      'reads widget names and the states their markup left out',
      onFixture('aria-widgets.html', assertWidgetStates),
      TEST_TIMEOUT_LONG,
   );

   it(
      'reads a placeholder, a linked error, and the invalid and required states',
      onFixture('form-errors.html', assertFormStates),
      TEST_TIMEOUT_LONG,
   );

   it(
      'exits 2 when a verb runs with no active session',
      () =>
         withStateDir(tempRoots, async () => {
            const run = await runCli(['sr', 'read', '--json']);

            expect(run.status).toBe(EXIT_USAGE);
         }),
      TEST_TIMEOUT_LONG,
   );
});

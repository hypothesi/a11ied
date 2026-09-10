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
const startArgs = ['--sr', 'virtual', '--allow-virtual', '--idle-timeout', '1'];

interface CurrentItemShape {
   role?: string;
   name?: string;
   value?: string;
   states: string[];
   level?: number;
   source: string;
}

interface NavigationResult {
   action: string;
   state: { lastSpokenPhrase: string | null; currentItem?: CurrentItemShape };
   details?: { moved?: boolean; navigation?: Record<string, unknown> };
}

async function runSrJson(
   args: string[],
): Promise<{ status: number; result: NavigationResult }> {
   const run = await runCli(['sr', ...args, '--json']);
   const json = parseJsonOutput(run.stdout);
   return { status: run.status, result: json.result as NavigationResult };
}

async function phraseAfter(args: string[]): Promise<string> {
   const { status, result } = await runSrJson(args);
   expect(status, args.join(' ')).toBe(EXIT_SUCCESS);
   return result.state.lastSpokenPhrase ?? '';
}

/**
 * Each kind lands on the first matching element of the structure page. The list runs in
 * order from the top, so every jump starts where the previous one ended.
 */
const KIND_EXPECTATIONS: ReadonlyArray<[kind: string, phrase: string]> = [
   ['heading', 'heading, Structure page, level 1'],
   ['link', 'link, About us'],
   ['landmark', 'main'],
   ['graphic', 'image, Company logo'],
   ['table', 'table, Plans'],
   ['control', 'textbox, Email'],
   ['button', 'button, Create account'],
   ['list', 'list'],
   ['region', 'region, Notes'],
];

async function assertKindsInOrder(
   expectations: ReadonlyArray<[string, string]>,
   index = 0,
): Promise<void> {
   const expectation = expectations[index];
   if (!expectation) {
      return;
   }
   const [kind, phrase] = expectation;
   expect(await phraseAfter(['next', kind]), kind).toBe(phrase);
   return assertKindsInOrder(expectations, index + 1);
}

function withSession(fn: () => Promise<void>): () => Promise<void> {
   return () =>
      withStateDir(tempRoots, async () => {
         const pageUrl = `${testServer.getBaseUrl()}/structure.html`;
         const started = await runCli(['sr', 'start', pageUrl, ...startArgs, '--json']);
         expect(started.status).toBe(EXIT_SUCCESS);
         try {
            await fn();
         } finally {
            await runCli(['sr', 'stop', '--json']);
         }
      });
}

async function assertEveryKindJumps(): Promise<void> {
   await assertKindsInOrder(KIND_EXPECTATIONS);
   expect(await phraseAfter(['top'])).toBe('document');
   expect(await phraseAfter(['next', 'form-field'])).toBe('textbox, Email');
   expect(await phraseAfter(['previous', 'link'])).toBe('link, Learn more');
   expect(await phraseAfter(['previous', 'heading'])).toBe(
      'heading, Structure page, level 1',
   );
}

async function assertLevelsAndRepeats(): Promise<void> {
   expect(await phraseAfter(['next', 'heading', '--level', '2'])).toBe(
      'heading, Products, level 2',
   );
   expect(await phraseAfter(['next', 'heading', '--level', '2'])).toBe(
      'heading, Sign up, level 2',
   );

   const missing = await runSrJson(['next', 'heading', '--level', '5']);
   expect(missing.status).toBe(EXIT_SUCCESS);
   expect(missing.result.details?.moved).toBe(false);
   expect(missing.result.details?.navigation).toEqual({
      direction: 'next',
      kind: 'heading',
      level: 5,
   });
   expect(missing.result.state.lastSpokenPhrase).toBe('heading, Sign up, level 2');

   await runSrJson(['top']);
   const repeated = await runSrJson(['next', '--times', '3']);
   expect(repeated.result.action).toBe('next');
   expect(repeated.result.state.lastSpokenPhrase).toBe('navigation, Site');

   const text = await runCli(['sr', 'next', 'heading', '--level', '5']);
   expect(text.stdout).toContain('sr next heading --level 5');
   expect(text.stdout).toContain('no heading level 5 to jump to');
}

async function assertUsageErrorsAndDo(): Promise<void> {
   const unknownKind = await runCli(['sr', 'next', 'bogus', '--json']);
   expectFirstErrorMessage({
      result: unknownKind,
      match: /"bogus" is not a kind you can jump by/,
   });

   const levelOnLink = await runCli(['sr', 'next', 'link', '--level', '2', '--json']);
   expect(levelOnLink.status).toBe(EXIT_USAGE);
   expectFirstErrorMessage({
      result: levelOnLink,
      match: /--level applies to headings only/,
   });

   const viaDo = await runSrJson(['do', 'next-heading']);
   expect(viaDo.status).toBe(EXIT_SUCCESS);
   expect(viaDo.result.state.lastSpokenPhrase).toBe('heading, Structure page, level 1');

   const listed = await runCli(['sr', 'list', '--sr', 'virtual', '--query', 'previous-']);
   expect(listed.stdout).toContain('previous-landmark');
}

async function assertReadShowsStates(): Promise<void> {
   await runSrJson(['next']);
   const checkbox = await runSrJson(['read']);
   expect(checkbox.result.state.currentItem).toMatchObject({
      role: 'checkbox',
      name: 'Accept the terms',
      states: ['unchecked'],
   });

   const text = await runCli(['sr', 'read']);
   expect(text.stdout).toContain('Role:');
   expect(text.stdout).toContain('checkbox');
   expect(text.stdout).toContain('States:');
   expect(text.stdout).toContain('Source:');
   expect(text.stdout).toContain('virtual');
}

async function assertReadDescribesTheItem(): Promise<void> {
   await runSrJson(['next', 'heading']);
   const heading = await runSrJson(['read']);
   expect(heading.result.state.currentItem).toMatchObject({
      role: 'heading',
      name: 'Structure page',
      level: 1,
      states: [],
   });
   expect(heading.result.state.currentItem?.source).toContain('active node');

   await runSrJson(['next', 'control']);
   const email = await runSrJson(['read']);
   expect(email.result.state.currentItem).toMatchObject({
      role: 'textbox',
      name: 'Email',
   });

   await assertReadShowsStates();
}

async function assertActivateFollowsLink(): Promise<void> {
   await withStateDir(tempRoots, async () => {
      const pageUrl = `${testServer.getBaseUrl()}/link-navigation.html`;
      const started = await runCli(['sr', 'start', pageUrl, ...startArgs, '--json']);
      expect(started.status).toBe(EXIT_SUCCESS);
      try {
         const moved = await runSrJson([
            'goto',
            '--role',
            'link',
            '--name',
            'Go to basic page',
         ]);
         expect(moved.status).toBe(EXIT_SUCCESS);

         const activated = await runSrJson(['activate']);
         expect(activated.status).toBe(EXIT_SUCCESS);

         const title = await runSrJson(['title']);
         expect(title.status).toBe(EXIT_SUCCESS);
         expect((title.result.details as { title?: string })?.title).toBe('Basic page');
      } finally {
         await runCli(['sr', 'stop', '--json']);
      }
   });
}

describe('cli sr structural navigation', () => {
   it(
      'reads the current item as role, name, states, and source',
      withSession(assertReadDescribesTheItem),
      TEST_TIMEOUT_LONG,
   );

   it(
      'jumps by every kind on the virtual target',
      withSession(assertEveryKindJumps),
      TEST_TIMEOUT_LONG,
   );

   it(
      'filters headings by level, repeats moves, and reports when nothing moved',
      withSession(assertLevelsAndRepeats),
      TEST_TIMEOUT_LONG,
   );

   it(
      'rejects unknown kinds and level on other kinds, and exposes the kinds to sr do',
      withSession(assertUsageErrorsAndDo),
      TEST_TIMEOUT_LONG,
   );

   it(
      'activate follows a link to a new page without rejecting on navigation',
      assertActivateFollowsLink,
      TEST_TIMEOUT_LONG,
   );
});

import type {
   ApgAttributeCheckRow,
   ApgCheckResult,
   ApgExample,
   ApgKeyboardCheckRow,
   ApgKeyboardTable,
} from '@a11ied/contracts';
import type { Page } from 'playwright';

import { clickAfterLoad } from '../browser/page-setup.js';
import {
   withLoadedPage,
   type WithBrowserPageOptions,
} from '../browser/shared-browser.js';
import { CliUsageError } from '../errors/cli-errors.js';
import type { DocumentLoad } from '../targets/parse.js';
import { hashAccessibilityTree } from '../evidence/subject.js';
import { readEvidenceForSubject, type EvidenceStoreOptions } from '../evidence/store.js';
import { parseAriaSnapshot } from '../tree/parse.js';
import { checkApgAttributes } from './check-attributes.js';
import { probeApgKeyboard } from './check-keyboard.js';
import { toPlaywrightKeys } from './keys.js';
import { observeWidget } from './observe.js';
import {
   attachRecordedJudgments,
   attributeRowOutcome,
   keyboardRowOutcome,
} from './outcomes.js';
import { showApgExample } from './runtime.js';

const SINGLE_MATCH = 1;

/**
 * Attaches the judgments already recorded for this page, keyed by the accessibility tree
 * they were made against, so one made before the component changed is marked stale.
 */
async function replayJudgments(
   result: ApgCheckResult,
   accessibilityTree: string,
   evidence: EvidenceStoreOptions | undefined,
): Promise<ApgCheckResult> {
   const records = await readEvidenceForSubject(result.subject, evidence ?? {});
   return attachRecordedJudgments({
      result,
      records,
      subjectHash: hashAccessibilityTree({
         yaml: accessibilityTree,
         nodes: parseAriaSnapshot(accessibilityTree),
      }),
   });
}

function withKeyboardOutcome(row: ApgKeyboardCheckRow): ApgKeyboardCheckRow {
   const outcome = keyboardRowOutcome(row.status);
   return outcome === undefined ? row : { ...row, outcome };
}

function withAttributeOutcome(row: ApgAttributeCheckRow): ApgAttributeCheckRow {
   const outcome = attributeRowOutcome(row.status);
   return outcome === undefined ? row : { ...row, outcome };
}

export interface RunPatternCheckInput {
   load: DocumentLoad;
   subject: string;
   exampleId: string;
   selector: string;
   tableName?: string | undefined;
   setupKeys?: string | undefined;
   pageOptions?: WithBrowserPageOptions;
   /** Where recorded judgments are read from. Defaults to the project results file. */
   evidence?: EvidenceStoreOptions;
}

/**
 * After a `--click`, the widget may render a moment later than the click returns, so the
 * check waits for it before counting matches. Without a click there is nothing to wait
 * for: the page has loaded and the widget is there or it is not.
 */
async function waitForClickedWidget(
   page: Page,
   selector: string,
   pageOptions: WithBrowserPageOptions,
): Promise<void> {
   if (pageOptions.click === undefined) {
      return;
   }
   await page
      .locator(selector)
      .first()
      .waitFor({
         state: 'attached',
         ...(pageOptions.timeoutMs === undefined
            ? {}
            : { timeout: pageOptions.timeoutMs }),
      });
}

/**
 * Requires the selector to name exactly one element.
 *
 * There is no default worth guessing. The APG's own pages disagree on the container id,
 * using `#ex1` on the select-only combobox and `#ex` on the scrollable listbox, and on a
 * real application page an unscoped check reports rows for widgets nobody asked about.
 */
async function requireOneWidget(page: Page, selector: string): Promise<void> {
   const matches = await page.locator(selector).count();
   if (matches === SINGLE_MATCH) {
      return;
   }
   if (matches === 0) {
      throw new CliUsageError(
         'selector-not-found',
         `No element matches --selector "${selector}".`,
         { selector },
      );
   }
   throw new CliUsageError(
      'selector-not-unique',
      `--selector "${selector}" matches ${matches} elements. Name one widget.`,
      { selector, matchCount: matches },
   );
}

function pickTable(
   example: ApgExample,
   tableName: string | undefined,
): { table: ApgKeyboardTable | undefined; unprobed: string[] } {
   const tables = example.keyboardTables;
   if (tableName === undefined) {
      return {
         table: tables[0],
         unprobed: tables.slice(1).map((entry) => entry.name),
      };
   }

   const wanted = tables.find((entry) => entry.name === tableName);
   if (!wanted) {
      throw new CliUsageError(
         'pattern-table-not-found',
         `${example.id} has no keyboard table named "${tableName}".`,
         { tableName, availableTables: tables.map((entry) => entry.name) },
      );
   }
   return {
      table: wanted,
      unprobed: tables.filter((entry) => entry !== wanted).map((entry) => entry.name),
   };
}

/** Parses `--setup` into chords, so a caller can drive the widget to a documented state. */
function parseSetupKeys(setupKeys: string | undefined): string[] {
   if (setupKeys === undefined) {
      return [];
   }
   return setupKeys
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
         const mapped = toPlaywrightKeys(entry.split('+').map((key) => key.trim()));
         if ('chord' in mapped) {
            return mapped.chord;
         }
         throw new CliUsageError(
            'invalid-setup-keys',
            `Cannot press "${entry}" from --setup: ${mapped.untestable}.`,
            { value: entry },
         );
      });
}

/**
 * Checks one page against one APG example: its attribute table outright, and its keyboard
 * table by pressing every key the guide declares.
 *
 * Only the first keyboard table is probed. A later table documents a different state,
 * such as an open listbox, which the tool cannot reach without interpreting prose, so
 * those are returned in `unprobedTables` for `--table` and `--setup` to reach.
 */
export async function runPatternCheck(
   input: RunPatternCheckInput,
): Promise<ApgCheckResult> {
   const { document, example, pattern } = showApgExample(input.exampleId);
   const { table, unprobed } = pickTable(example, input.tableName);
   const setupKeys = parseSetupKeys(input.setupKeys);

   const pageOptions = input.pageOptions ?? {};

   return withLoadedPage(
      input.load,
      async (page) => {
         await waitForClickedWidget(page, input.selector, pageOptions);
         await requireOneWidget(page, input.selector);

         const observation = await observeWidget(page, input.selector);
         const attributes = await checkApgAttributes({
            page,
            selector: input.selector,
            table: example.attributeTables[0],
            accessibilityTree: observation.accessibilityTree,
            keyboardTables: example.keyboardTables,
         });

         const reset = async (): Promise<void> => {
            await page.reload({ waitUntil: 'load' });
            await clickAfterLoad(page, pageOptions);
            await waitForClickedWidget(page, input.selector, pageOptions);
         };
         const keyboardRows = table
            ? await probeApgKeyboard(
                 { page, selector: input.selector, reset, setupKeys },
                 table,
              )
            : [];

         const result: ApgCheckResult = {
            document,
            exampleId: example.id,
            patternId: pattern.id,
            pageUrl: example.pageUrl,
            title: example.title,
            subject: input.subject,
            selector: input.selector,
            tableName: table?.name ?? '',
            keyboardRows: keyboardRows.map((row) => withKeyboardOutcome(row)),
            attributeRows: attributes.rows.map((row) => withAttributeOutcome(row)),
            applicabilityHints: attributes.hints,
            unprobedTables: unprobed,
         };

         return replayJudgments(result, observation.accessibilityTree, input.evidence);
      },
      pageOptions,
   );
}

import { createHash } from 'node:crypto';
import { writeAtomic } from '../../files/store.js';
import { dirname, join } from 'node:path';
import type { AuditRun, SiteInventory } from '@a11ied/contracts';
import type { Browser, Page } from 'playwright';
import { readInventory } from '../../discovery/inventory.js';
import { executeAuditAssessment } from '../assessment-command.js';
import { isPageStateMatched } from '../run-scope.js';
import { readAuditRun } from '../run-store.js';

const VIEWPORT = { width: 480, height: 320 };

type InventoryPage = SiteInventory['pages'][number];

function isAssessablePage(page: InventoryPage): boolean {
   return !page.isDuplicateOf && page.auditStatus !== 'skipped-duplicate';
}

async function describeStructure(page: Page): Promise<string> {
   return page.evaluate(() =>
      [...document.querySelectorAll('*')]
         .map((element) => element.tagName + (element.getAttribute('role') ?? ''))
         .join(','),
   );
}

async function observePage(input: {
   browser: Browser;
   file: string;
   run: AuditRun;
   page: InventoryPage;
}): Promise<void> {
   const { browser, file, run, page } = input;
   const context = await browser.newContext({ viewport: VIEWPORT });
   try {
      const view = await context.newPage();
      await view.goto(page.finalUrl, { waitUntil: 'networkidle' });
      const fingerprint = createHash('sha256')
         .update(await describeStructure(view))
         .digest('hex');
      const path = `artifacts/${page.pageId}-state.png`;
      await writeAtomic(join(dirname(file), path), await view.screenshot());
      await executeAuditAssessment({
         action: 'state',
         file,
         state: {
            stateId: `page-${page.pageId}`,
            target: { kind: 'url', value: page.finalUrl },
            label: `${await view.title()} - initial state`,
            fingerprint,
            environmentId: run.environments[0]?.environmentId ?? '',
            setup: [
               `Open ${page.finalUrl} at ${String(VIEWPORT.width)}x${String(VIEWPORT.height)}.`,
            ],
            artifacts: [path],
         },
      });
   } finally {
      await context.close();
   }
}

/**
 * Register an initial state for each discovered page the run has not observed, so a run
 * started from an inventory needs no hand-written state files.
 */
export async function observeInventoryPages(
   file: string,
   browser: Browser,
): Promise<number> {
   const current = await readAuditRun(file);
   if (!current.inventoryPath) {
      return 0;
   }
   const inventory = await readInventory(current.inventoryPath);
   const missing = inventory.pages
      .filter(isAssessablePage)
      .filter(
         (page) =>
            !current.states.some(
               (state) =>
                  state.environmentId === current.environments[0]?.environmentId &&
                  isPageStateMatched(state.target, page),
            ),
      );
   for (const page of missing) {
      // oxlint-disable-next-line no-await-in-loop -- state writes are serialized by the run file
      await observePage({ browser, file, run: current, page });
   }
   return missing.length;
}

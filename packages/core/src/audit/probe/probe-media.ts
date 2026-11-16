import type { AuditState } from '@a11ied/contracts';
import type { Browser } from 'playwright';
import { collectMediaInventory, judgeMediaInventory } from './media-inventory.js';
import { openProbePage } from './page-facts.js';
import type { PageJudgement } from './probe-artifacts.js';
import { needsReview } from './probe-types.js';

/** Restore only initial documents; arbitrary interactive setup still needs the host agent. */
export async function observeStateMedia(
   browser: Browser,
   state: AuditState,
): Promise<PageJudgement> {
   if (state.setup.some((step) => !step.startsWith('Open '))) {
      return {
         url: state.target.value,
         judgement: needsReview(
            'This state requires interactive setup; restore it and inventory media with the host agent.',
         ),
      };
   }
   const page = await openProbePage(browser);
   try {
      await page.goto(state.target.value, { waitUntil: 'networkidle' });
      const inventory = await collectMediaInventory(page);
      return {
         url: state.target.value,
         mediaInventory: inventory,
         judgement:
            inventory.url === state.target.value
               ? judgeMediaInventory(inventory)
               : needsReview(
                    'Navigation changed the target URL; register its observed identity before assessment.',
                 ),
      };
   } finally {
      await page.context().close();
   }
}

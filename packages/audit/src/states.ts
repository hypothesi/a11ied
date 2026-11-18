import { run, selectAll, type Audit } from './db.js';
import { SITE_PAGE_ID } from './pages.js';
import { stateRowSchema } from './rows.js';
import {
   stateInventorySchema,
   type StateInput,
   type StateInventory,
   type StateTrigger,
   type Unit,
} from './schema.js';
import { listSignals } from './signals.js';

/** The signal kind the scan stores its state inventory under. */
export const STATE_SIGNAL_KIND = 'states';

export interface PageState {
   unitId: string;
   pageId: string;
   name: string;
   covers: string[];
   tested: boolean;
   note: string;
}

/** The scan's list of state triggers for a page, when it has one. */
export function getStateInventory(
   audit: Audit,
   pageId: string,
): StateInventory | undefined {
   const signal = listSignals(audit, pageId).find(
      (candidate) => candidate.kind === STATE_SIGNAL_KIND,
   );
   const parsed = stateInventorySchema.safeParse(signal?.data);
   return parsed.success ? parsed.data : undefined;
}

function describeTrigger(trigger: StateTrigger): string {
   return `${trigger.id} (${trigger.kind} "${trigger.label}", ${trigger.selector})`;
}

/**
 * Every trigger the scan found on the page must be accounted for by some state, tested or
 * not with a reason. Site-wide units compare pages and have no states of their own.
 */
export function checkStates(
   audit: Audit,
   unit: Unit,
   states: readonly StateInput[],
): string[] {
   if (unit.pageId === SITE_PAGE_ID) {
      return [];
   }
   const triggers = getStateInventory(audit, unit.pageId)?.triggers ?? [];
   const covered = new Set(states.flatMap((state) => state.covers));
   const known = new Set(triggers.map((trigger) => trigger.id));
   const uncovered = triggers
      .filter((trigger) => !covered.has(trigger.id))
      .map(
         (trigger) =>
            `states: ${describeTrigger(trigger)} is not accounted for. Put the page in the state it leads to and judge this unit's criteria there, then list it in a state's covers; or list it with tested: false and the reason.`,
      );
   const unknown = [...covered]
      .filter((id) => !known.has(id))
      .map(
         (id) =>
            `states: covers lists ${id}, which is not in this page's state inventory. Leave covers empty for a state you found yourself.`,
      );
   return [...uncovered, ...unknown];
}

/** Replaces the states a unit recorded. Call inside a transaction. */
export function storeStates(
   audit: Audit,
   unit: Unit,
   states: readonly StateInput[],
): void {
   run(audit, 'DELETE FROM states WHERE unitId = ?', unit.id);
   for (const [position, state] of states.entries()) {
      run(
         audit,
         'INSERT INTO states (unitId, pageId, position, name, covers, tested, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
         unit.id,
         unit.pageId,
         position,
         state.name,
         JSON.stringify(state.covers),
         state.tested ? 1 : 0,
         state.note,
      );
   }
}

/** The states recorded for one page, or for every page. */
export function listPageStates(audit: Audit, pageId?: string): PageState[] {
   const columns = 'SELECT unitId, pageId, name, covers, tested, note FROM states';
   return pageId === undefined
      ? selectAll(audit, stateRowSchema, `${columns} ORDER BY pageId, unitId, position`)
      : selectAll(
           audit,
           stateRowSchema,
           `${columns} WHERE pageId = ? ORDER BY unitId, position`,
           pageId,
        );
}

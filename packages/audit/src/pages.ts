import {
   addEvent,
   getConfig,
   run,
   selectAll,
   selectOne,
   SQL_NULL,
   transact,
   type Audit,
} from './db.js';
import { AuditError } from './errors.js';
import {
   getPassIdForCriterion,
   getTestPass,
   listTestPassIds,
   TEST_PASSES,
} from './passes.js';
import { countRowSchema, idRowSchema, pageRowSchema } from './rows.js';
import { resetUnit } from './reopen.js';
import type { AuditPage, PageKind } from './schema.js';

/** The pseudo-page that carries checks made across the whole audited set. */
export const SITE_PAGE_ID = 'site';

const MIN_PAGES_FOR_SITE_PASS = 2;
const PAGE_COLUMNS =
   'id, kind, name, locator, notes, grp, passes, status, excludeReason, createdAt';

export interface PageInput {
   kind?: PageKind | undefined;
   name?: string | undefined;
   locator: string;
   notes?: string | undefined;
   group?: string | undefined;
   /** Limit this page to some passes. Defaults to every pass in scope. */
   passes?: readonly string[] | undefined;
}

export function listPages(audit: Audit): AuditPage[] {
   return selectAll(
      audit,
      pageRowSchema,
      `SELECT ${PAGE_COLUMNS} FROM pages ORDER BY seq`,
   );
}

/** Lists the pages being audited, without excluded ones or the site pseudo-page. */
export function listActivePages(audit: Audit): AuditPage[] {
   return listPages(audit).filter(
      (page) => page.status === 'active' && page.kind !== 'site',
   );
}

export function getPage(audit: Audit, pageId: string): AuditPage {
   const page = selectOne(
      audit,
      pageRowSchema,
      `SELECT ${PAGE_COLUMNS} FROM pages WHERE id = ?`,
      pageId,
   );
   if (!page) {
      throw new AuditError(
         'page-not-found',
         `No page "${pageId}". Run a1 audit page list.`,
      );
   }
   return page;
}

function nextSeq(audit: Audit): number {
   const row = selectOne(
      audit,
      countRowSchema,
      'SELECT COALESCE(MAX(seq), 0) AS count FROM pages',
   );
   return (row?.count ?? 0) + 1;
}

function insertPage(
   audit: Audit,
   page: {
      id: string;
      seq: number;
      kind: PageKind;
      name: string;
      locator: string;
      notes: string;
      group: string;
      passes: readonly string[] | undefined;
   },
): void {
   run(
      audit,
      'INSERT INTO pages (id, seq, kind, name, locator, notes, grp, passes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      page.id,
      page.seq,
      page.kind,
      page.name,
      page.locator,
      page.notes,
      page.group,
      page.passes === undefined ? SQL_NULL : JSON.stringify(page.passes),
      audit.now().toISOString(),
   );
}

function ensureUnit(
   audit: Audit,
   unit: { pageId: string; passId: string; criteria: readonly string[] },
): void {
   const { pageId, passId, criteria } = unit;
   run(
      audit,
      'INSERT INTO units (id, pageId, pass, criteria) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING',
      `${pageId}.${passId}`,
      pageId,
      passId,
      JSON.stringify(criteria),
   );
}

function ensureSitePage(audit: Audit, target: string): void {
   const exists = selectOne(
      audit,
      countRowSchema,
      'SELECT COUNT(*) AS count FROM pages WHERE id = ?',
      SITE_PAGE_ID,
   );
   if ((exists?.count ?? 0) > 0) {
      return;
   }
   insertPage(audit, {
      id: SITE_PAGE_ID,
      seq: 0,
      kind: 'site',
      name: 'Whole audited set',
      locator: target,
      notes: '',
      group: '',
      passes: undefined,
   });
}

/**
 * Creates the missing work units: one per active page and test pass that owns at least
 * one criterion in scope, plus the site-wide units once two pages exist. Existing units
 * are never changed, so calling this again is safe.
 */
export function syncUnits(audit: Audit): void {
   const config = getConfig(audit);
   const pages = listActivePages(audit);
   for (const pass of TEST_PASSES) {
      const criteria = config.criteria.filter(
         (criterion) => getPassIdForCriterion(criterion) === pass.id,
      );
      if (criteria.length === 0) {
         continue;
      }
      if (pass.scope === 'site') {
         if (pages.length >= MIN_PAGES_FOR_SITE_PASS) {
            ensureSitePage(audit, config.target);
            ensureUnit(audit, { pageId: SITE_PAGE_ID, passId: pass.id, criteria });
         }
         continue;
      }
      for (const page of pages) {
         if (page.passes === undefined || page.passes.includes(pass.id)) {
            ensureUnit(audit, { pageId: page.id, passId: pass.id, criteria });
         }
      }
   }
}

/**
 * Puts finished or blocked site-wide units back in the queue. Their checks compare pages
 * with each other, so a result recorded for one set of pages says nothing about another.
 */
function reopenSiteUnits(audit: Audit, input: { actor: string; reason: string }): void {
   const unitIDs = selectAll(
      audit,
      idRowSchema,
      "SELECT id FROM units WHERE pageId = ? AND status IN ('done', 'blocked')",
      SITE_PAGE_ID,
   ).map((row) => row.id);
   for (const unitID of unitIDs) {
      resetUnit(audit, { unitId: unitID, actor: input.actor, reason: input.reason });
   }
}

function assertPasses(passes: readonly string[]): void {
   const unknown = passes.filter((passId) => getTestPass(passId) === undefined);
   if (unknown.length > 0) {
      throw new AuditError(
         'unknown-pass',
         `Unknown test pass: ${unknown.join(', ')}. Use one of: ${listTestPassIds().join(', ')}.`,
      );
   }
}

function defaultKind(audit: Audit): PageKind {
   return getConfig(audit).platform === 'web' ? 'page' : 'screen';
}

/**
 * Adds a page, screen, state, or flow to the audit and creates its work units. Adding a
 * locator that is already present returns the existing page.
 */
export function addPage(audit: Audit, input: PageInput, actor = 'lead'): AuditPage {
   assertPasses(input.passes ?? []);
   return transact(audit, () => {
      const kind = input.kind ?? defaultKind(audit);
      const existing = listPages(audit).find(
         (page) => page.locator === input.locator && page.kind === kind,
      );
      if (existing) {
         return existing;
      }
      const seq = nextSeq(audit);
      const id = `P${String(seq)}`;
      insertPage(audit, {
         id,
         seq,
         kind,
         name: input.name ?? input.locator,
         locator: input.locator,
         notes: input.notes ?? '',
         group: input.group ?? '',
         passes: input.passes && input.passes.length > 0 ? input.passes : undefined,
      });
      syncUnits(audit);
      reopenSiteUnits(audit, { actor, reason: `the page set changed (added ${id})` });
      addEvent(audit, {
         actor,
         type: 'page-added',
         message: `Added ${kind} ${id}: ${input.name ?? input.locator}`,
      });
      return getPage(audit, id);
   });
}

/** Takes a page out of the audit. Its recorded work is kept but no longer counted. */
export function excludePage(
   audit: Audit,
   input: { pageId: string; reason: string; actor?: string | undefined },
): AuditPage {
   const { pageId, reason } = input;
   const actor = input.actor ?? 'lead';
   return transact(audit, () => {
      const page = getPage(audit, pageId);
      run(
         audit,
         "UPDATE pages SET status = 'excluded', excludeReason = ? WHERE id = ?",
         reason,
         pageId,
      );
      reopenSiteUnits(audit, {
         actor,
         reason: `the page set changed (excluded ${pageId})`,
      });
      addEvent(audit, {
         actor,
         type: 'page-excluded',
         message: `Excluded ${page.id} (${page.name}): ${reason}`,
      });
      return getPage(audit, pageId);
   });
}

export function includePage(audit: Audit, pageId: string, actor = 'lead'): AuditPage {
   return transact(audit, () => {
      const page = getPage(audit, pageId);
      run(
         audit,
         "UPDATE pages SET status = 'active', excludeReason = '' WHERE id = ?",
         pageId,
      );
      syncUnits(audit);
      reopenSiteUnits(audit, {
         actor,
         reason: `the page set changed (included ${pageId})`,
      });
      addEvent(audit, {
         actor,
         type: 'page-included',
         message: `Included ${page.id} (${page.name})`,
      });
      return getPage(audit, pageId);
   });
}

import {
   addEvent,
   getConfig,
   listActivePages,
   putSignal,
   recordAutomatedFinding,
   type Audit,
   type AuditPage,
} from '@a11ied/audit';
import {
   collectLoadedPageFacts,
   mapWithConcurrency,
   openProbePage,
} from '@a11ied/observe';
import type { Browser } from 'playwright';
import { runAxe } from '../../axe/runtime.js';
import { gotoSettled } from '../../browser/load.js';
import { launchAutomationBrowser } from '../../browser/runtime.js';
import { buildAxeSignal, listAxeFindings } from './axe-findings.js';
import { buildPageSignals } from './signals.js';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ScanOptions {
   /** Scan only these pages. Defaults to every active web page. */
   pageIds?: readonly string[] | undefined;
   concurrency?: number | undefined;
   timeoutMs?: number | undefined;
   /** A Playwright storage-state file for pages behind a login. */
   storageStatePath?: string | undefined;
   onPageDone?: ((result: PageScanResult) => void) | undefined;
}

export interface PageScanResult {
   pageId: string;
   name: string;
   ok: boolean;
   findings: number;
   error?: string;
}

function isScannable(page: AuditPage): boolean {
   return /^https?:\/\//u.test(page.locator);
}

async function scanPage(
   audit: Audit,
   browser: Browser,
   input: { target: AuditPage; timeoutMs: number; storageStatePath?: string | undefined },
): Promise<number> {
   const { target, timeoutMs } = input;
   const config = getConfig(audit);
   const page = await openProbePage(browser, {
      storageStatePath: input.storageStatePath,
   });
   try {
      await gotoSettled(page, target.locator, { timeoutMs });
      const axe = await runAxe(
         { kind: 'goto', url: target.locator },
         { wcagVersion: config.wcagVersion, level: config.level, page },
      );
      const findings = listAxeFindings(axe, config.criteria);
      for (const finding of findings) {
         recordAutomatedFinding(audit, {
            ...finding,
            source: 'axe',
            pageId: target.id,
         });
      }
      putSignal(audit, { pageId: target.id, kind: 'axe', data: buildAxeSignal(axe) });
      const facts = await collectLoadedPageFacts(page, target.locator);
      for (const [kind, data] of Object.entries(buildPageSignals(facts))) {
         putSignal(audit, { pageId: target.id, kind, data });
      }
      return findings.length;
   } finally {
      await page.context().close();
   }
}

/**
 * Runs the programmatic checks on every web page in parallel. It records the failures axe
 * is certain of as findings and stores everything else as signals for the workers. A page
 * that cannot be scanned is logged and skipped; the others still run.
 */
export async function scanAuditPages(
   audit: Audit,
   options: ScanOptions = {},
): Promise<PageScanResult[]> {
   const wanted = options.pageIds;
   const pages = listActivePages(audit).filter(
      (page) => isScannable(page) && (wanted === undefined || wanted.includes(page.id)),
   );
   if (pages.length === 0) {
      return [];
   }
   const { browser } = await launchAutomationBrowser();
   try {
      return await mapWithConcurrency(
         pages,
         options.concurrency ?? DEFAULT_CONCURRENCY,
         async (page): Promise<PageScanResult> => {
            const base = { pageId: page.id, name: page.name };
            let result: PageScanResult = { ...base, ok: false, findings: 0 };
            try {
               const findings = await scanPage(audit, browser, {
                  target: page,
                  timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
                  storageStatePath: options.storageStatePath,
               });
               result = { ...base, ok: true, findings };
            } catch (error) {
               result.error = error instanceof Error ? error.message : String(error);
            }
            addEvent(audit, {
               actor: 'scan',
               type: result.ok ? 'page-scanned' : 'scan-failed',
               message: result.ok
                  ? `Scanned ${page.id}: ${String(result.findings)} automated finding(s)`
                  : `Could not scan ${page.id}: ${result.error ?? 'unknown error'}`,
            });
            options.onPageDone?.(result);
            return result;
         },
      );
   } finally {
      await browser.close();
   }
}

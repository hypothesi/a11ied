import { join } from 'node:path';
import {
   addEvent,
   getConfig,
   STATE_SIGNAL_KIND,
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
import type { Browser, Page } from 'playwright';
import { runAxe } from '../../axe/runtime.js';
import { gotoSettled } from '../../browser/load.js';
import { launchAutomationBrowser } from '../../browser/runtime.js';
import { screenshotElement } from '../../capture/element.js';
import { runInOrder } from '../../capture/runtime.js';
import { buildAxeSignal, listAxeFindings, type AxeFinding } from './axe-findings.js';
import { collectStateInventory } from './states.js';
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

const UNSAFE_FILE_CHARACTERS = /[^a-z0-9.-]+/giu;

/**
 * Pictures the first failing element of each finding, one after another on the same page.
 * A picture that fails is skipped; the finding still stands on axe's result.
 */
async function photographFindings(
   audit: Audit,
   page: Page,
   input: { pageId: string; findings: readonly AxeFinding[] },
): Promise<Map<string, string>> {
   const files = new Map<string, string>();
   await runInOrder(input.findings, async (finding) => {
      const name = `${finding.criterion}-${finding.key}`.replaceAll(
         UNSAFE_FILE_CHARACTERS,
         '-',
      );
      const relative = join('evidence', 'scan', input.pageId, `${name}.png`);
      try {
         await screenshotElement(page, finding.selector, join(audit.dir, relative));
         files.set(finding.key + finding.criterion, relative);
      } catch {
         // The element may be hidden or gone; the finding is still valid without a picture.
      }
   });
   return files;
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
      putSignal(audit, { pageId: target.id, kind: 'axe', data: buildAxeSignal(axe) });
      const facts = await collectLoadedPageFacts(page, target.locator);
      for (const [kind, data] of Object.entries(buildPageSignals(facts))) {
         putSignal(audit, { pageId: target.id, kind, data });
      }
      putSignal(audit, {
         pageId: target.id,
         kind: STATE_SIGNAL_KIND,
         data: await collectStateInventory(page),
      });
      const pictures = await photographFindings(audit, page, {
         pageId: target.id,
         findings,
      });
      for (const finding of findings) {
         const picture = pictures.get(finding.key + finding.criterion);
         recordAutomatedFinding(audit, {
            ...finding,
            source: 'axe',
            pageId: target.id,
            evidence: picture === undefined ? [] : [picture],
         });
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

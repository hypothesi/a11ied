import type { AuditRun, SiteInventory, TargetReference } from '@a11ied/contracts';
import { readInventory } from '../discovery/inventory.js';
import { normalizeUrl } from '../discovery/crawl.js';
import { getCanonicalPath } from '../files/atomic-json.js';

export interface AssessmentIssue {
   code: string;
   message: string;
   checkId?: string;
   criterionId?: string;
}

function isTargetMatched(target: TargetReference, expected: TargetReference): boolean {
   if (target.kind !== expected.kind) {
      return false;
   }
   // URL serialization normalizes host, default port, and root slash, preserving routes.
   return target.kind === 'url'
      ? new URL(target.value).href === new URL(expected.value).href
      : target.value === expected.value;
}

/** Match observed pages using discovery aliases without merging hash routes. */
export function isPageStateMatched(
   target: TargetReference,
   page: SiteInventory['pages'][number],
): boolean {
   return (
      isTargetMatched(target, { kind: 'url', value: page.url }) ||
      isTargetMatched(target, { kind: 'url', value: page.finalUrl })
   );
}

function getPageIssues(run: AuditRun, inventory: SiteInventory): AssessmentIssue[] {
   const issues: AssessmentIssue[] = [];
   for (const page of inventory.pages) {
      for (const environment of run.environments) {
         const observed = run.states.some(
            (state) =>
               state.environmentId === environment.environmentId &&
               isPageStateMatched(state.target, page),
         );
         if (!observed) {
            issues.push({
               code: 'audit-page-unobserved',
               message: `${page.url} has no observed state in ${environment.environmentId}.`,
            });
         }
      }
   }
   return issues;
}

async function isInventoryMatched(
   input: { file: string; run: AuditRun },
   inventory: SiteInventory,
): Promise<boolean> {
   const { file, run } = input;
   return (
      inventory.run.runId === run.runId &&
      run.target.kind === 'url' &&
      normalizeUrl(run.target.value) === normalizeUrl(inventory.startUrl) &&
      inventory.run.scope === run.scope &&
      (!inventory.run.assessmentFile ||
         (await getCanonicalPath(inventory.run.assessmentFile)) ===
            (await getCanonicalPath(file))) &&
      (!inventory.run.profile ||
         JSON.stringify(inventory.run.profile) === JSON.stringify(run.profile))
   );
}

/** Group page variants for progress while their exact state identities remain distinct. */
export function isPageDocumentMatched(
   target: TargetReference,
   page: SiteInventory['pages'][number],
): boolean {
   return (
      target.kind === 'url' &&
      (normalizeUrl(target.value) === normalizeUrl(page.url) ||
         normalizeUrl(target.value) === normalizeUrl(page.finalUrl))
   );
}

function getInventoryCoverageIssues(
   run: AuditRun,
   inventory: SiteInventory,
): AssessmentIssue[] {
   const issues = getPageIssues(run, inventory);
   if (
      !inventory.discovery.complete ||
      inventory.discovery.truncatedReason ||
      inventory.discovery.pendingUrls.length > 0 ||
      inventory.discovery.failures.length > 0
   ) {
      issues.push({
         code: 'audit-discovery-incomplete',
         message: 'Discovery has unfinished work, failures, or a truncated inventory.',
      });
   }
   if (inventory.pages.length === 0) {
      issues.push({
         code: 'audit-pages-missing',
         message: 'No scoped pages have been discovered.',
      });
   }
   return issues;
}

/** Inaccessible discovery remains an explicit gap while saved assessment proof survives. */
export async function readScopedInventory(input: {
   file: string;
   run: AuditRun;
}): Promise<{ inventory?: SiteInventory; issues: AssessmentIssue[] }> {
   const { run } = input;
   if (!run.inventoryPath) {
      return {
         issues:
            run.scope === 'site' || run.scope === 'section'
               ? [
                    {
                       code: 'audit-inventory-missing',
                       message: 'The scoped site discovery inventory is missing.',
                    },
                 ]
               : [],
      };
   }
   let inventory: SiteInventory | undefined = undefined;
   try {
      inventory = await readInventory(run.inventoryPath);
   } catch (error) {
      return {
         issues: [
            {
               code: 'audit-inventory-unavailable',
               message: `Discovery inventory could not be read: ${error instanceof Error ? error.message : String(error)}`,
            },
         ],
      };
   }
   if (!(await isInventoryMatched(input, inventory))) {
      return {
         issues: [
            {
               code: 'audit-inventory-mismatch',
               message:
                  'The discovery inventory belongs to another run, target, scope, or profile.',
            },
         ],
      };
   }
   return { inventory, issues: getInventoryCoverageIssues(run, inventory) };
}

/** Scope completion requires observed target identity and no active or blocked work. */
function isRunTargetObserved(
   target: TargetReference,
   expected: TargetReference,
   startPage: SiteInventory['pages'][number] | undefined,
): boolean {
   if (isTargetMatched(target, expected)) {
      return true;
   }
   if (!startPage || target.kind !== 'url' || expected.kind !== 'url') {
      return false;
   }
   const requestedHash = new URL(expected.value).hash;
   return requestedHash
      ? new URL(target.value).hash === requestedHash &&
           isPageDocumentMatched(target, startPage)
      : isPageStateMatched(target, startPage);
}

/** Scope completion requires observed target identity and no active or blocked work. */
export function getScopeIssues(
   run: AuditRun,
   inventory: SiteInventory | undefined,
): AssessmentIssue[] {
   const issues: AssessmentIssue[] = [];
   const startPage = inventory?.pages.find(
      (page) =>
         run.target.kind === 'url' &&
         normalizeUrl(run.target.value) === normalizeUrl(page.url),
   );
   if (run.activeCheckId) {
      issues.push({
         code: 'audit-check-active',
         checkId: run.activeCheckId,
         message: 'A live assessment claim has not been completed or recovered.',
      });
   }
   for (const environment of run.environments) {
      if (
         !run.states.some(
            (state) =>
               state.environmentId === environment.environmentId &&
               isRunTargetObserved(state.target, run.target, startPage),
         )
      ) {
         issues.push({
            code: 'audit-target-unobserved',
            message: `The run target has no observed state in ${environment.environmentId}.`,
         });
      }
   }
   for (const journey of run.journeys) {
      if (journey.status !== 'completed') {
         issues.push({
            code: 'audit-journey-incomplete',
            message: `${journey.label}: ${journey.reason ?? journey.status}.`,
         });
      }
      const environments = new Set(
         journey.stateIds.map(
            (id) => run.states.find((state) => state.stateId === id)?.environmentId,
         ),
      );
      if (environments.size !== 1) {
         issues.push({
            code: 'audit-journey-environment-mismatch',
            message: `${journey.label} crosses assessment environments.`,
         });
      }
   }
   return issues;
}

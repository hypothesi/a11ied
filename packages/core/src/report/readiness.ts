import type { SiteInventory } from '@a11ied/contracts';

import { CliUsageError } from '../errors/cli-errors.js';
import type { LoadedPageAudit } from './aggregate.js';
import { getCriterionOutcome } from '../audit/criteria-rollup.js';
import { rebuildAuditAssessment } from '../audit/runtime.js';

function getSelectedPages(inventory: SiteInventory): string[] {
   if (inventory.run.optionsChosen.auditMode === 'sampled') {
      return (
         inventory.run.optionsChosen.selectedPageIds ??
         inventory.templates.map((template) => template.representativePageId)
      );
   }
   return inventory.pages
      .filter((page) => !page.isDuplicateOf)
      .map((page) => page.pageId);
}

function assertPageReady(
   page: SiteInventory['pages'][number] | undefined,
   loaded: LoadedPageAudit | undefined,
   pageId: string,
): void {
   if (loaded?.assessmentError) {
      throw new CliUsageError(
         'validation-error',
         `Repair the assessment data for ${pageId}: ${loaded.assessmentError}`,
      );
   }
   if (
      !page ||
      page.isDuplicateOf ||
      (page.auditStatus !== 'audited' && page.auditStatus !== 'error')
   ) {
      throw new CliUsageError(
         'validation-error',
         `Finish the selected page assessment: ${pageId}.`,
      );
   }
   if (page.auditStatus === 'error') {
      if (!page.error?.message.trim()) {
         throw new CliUsageError(
            'validation-error',
            `Record why the page assessment failed: ${pageId}.`,
         );
      }
      return;
   }
   if (
      !loaded?.report ||
      loaded.error ||
      loaded.report.criteria.length === 0 ||
      rebuildAuditAssessment(loaded.report, loaded.assessmentProfile).criteria.some(
         (criterion) =>
            criterion.pending || getCriterionOutcome(criterion) === 'notTested',
      )
   ) {
      throw new CliUsageError(
         'validation-error',
         `The audited page has missing results or pending procedures: ${pageId}.`,
      );
   }
}

/** Sampled-out pages remain untested; selected pages must have a finished assessment. */
export function assertReportReady(
   inventory: SiteInventory,
   pageReports: LoadedPageAudit[],
): void {
   const selected = getSelectedPages(inventory);
   if (selected.length === 0) {
      throw new CliUsageError(
         'validation-error',
         'Select pages before building the audit report.',
      );
   }
   for (const pageId of selected) {
      const loaded = pageReports.find((entry) => entry.pageId === pageId),
         page = inventory.pages.find((entry) => entry.pageId === pageId);
      assertPageReady(page, loaded, pageId);
   }
}

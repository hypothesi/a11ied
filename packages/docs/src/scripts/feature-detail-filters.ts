interface FeatureFilterElements {
   readonly sourceSelect: HTMLSelectElement | undefined;
   readonly srSelect: HTMLSelectElement | undefined;
   readonly osSelect: HTMLSelectElement | undefined;
   readonly browserTypeSelect: HTMLSelectElement | undefined;
   readonly resetButton: HTMLButtonElement | undefined;
   readonly countLabel: HTMLElement | undefined;
   readonly emptyState: HTMLElement | undefined;
   readonly groups: readonly HTMLElement[];
   readonly rows: readonly HTMLDetailsElement[];
}

function querySelectElement(selector: string): HTMLSelectElement | undefined {
   const element = document.querySelector(selector);
   return element instanceof HTMLSelectElement ? element : undefined;
}

function queryButtonElement(selector: string): HTMLButtonElement | undefined {
   const element = document.querySelector(selector);
   return element instanceof HTMLButtonElement ? element : undefined;
}

function queryHtmlElement(selector: string): HTMLElement | undefined {
   const element = document.querySelector(selector);
   return element instanceof HTMLElement ? element : undefined;
}

function getElements(): FeatureFilterElements {
   const groupEls = [
      ...document.querySelectorAll('#sr-feature-groups [data-sr-group-block]'),
   ].filter((el): el is HTMLElement => el instanceof HTMLElement);
   const rowEls = [
      ...document.querySelectorAll('#sr-feature-groups [data-env-row]'),
   ].filter((el): el is HTMLDetailsElement => el instanceof HTMLDetailsElement);

   return {
      sourceSelect: querySelectElement('#sr-feature-source'),
      srSelect: querySelectElement('#sr-feature-sr'),
      osSelect: querySelectElement('#sr-feature-os'),
      browserTypeSelect: querySelectElement('#sr-feature-browser-type'),
      resetButton: queryButtonElement('#sr-feature-reset'),
      countLabel: queryHtmlElement('#sr-feature-count'),
      emptyState: queryHtmlElement('#sr-feature-empty'),
      groups: groupEls,
      rows: rowEls,
   };
}

function restoreSelectFromParam(
   selectEl: HTMLSelectElement | undefined,
   value: string | undefined,
): void {
   if (!selectEl || !value) {
      return;
   }
   const hasOption = [...selectEl.options].some((opt) => opt.value === value);
   if (hasOption) {
      selectEl.value = value;
   }
}

interface ActiveFeatureFilters {
   readonly source: string;
   readonly sr: string;
   readonly os: string;
   readonly browserType: string;
}

function readFiltersFromURL(elements: FeatureFilterElements): void {
   const params = new URLSearchParams(globalThis.location.search);
   restoreSelectFromParam(elements.sourceSelect, params.get('source') ?? undefined);
   restoreSelectFromParam(elements.srSelect, params.get('sr') ?? undefined);
   restoreSelectFromParam(elements.osSelect, params.get('os') ?? undefined);
   restoreSelectFromParam(
      elements.browserTypeSelect,
      params.get('browserType') ?? undefined,
   );
}

function setOrDeleteParam(url: URL, key: string, value: string): void {
   if (value === 'all') {
      url.searchParams.delete(key);
      return;
   }
   url.searchParams.set(key, value);
}

function syncFiltersToURL(filters: ActiveFeatureFilters): void {
   const url = new URL(globalThis.location.href);
   setOrDeleteParam(url, 'source', filters.source);
   setOrDeleteParam(url, 'sr', filters.sr);
   setOrDeleteParam(url, 'os', filters.os);
   setOrDeleteParam(url, 'browserType', filters.browserType);
   globalThis.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function matchesRow(row: HTMLDetailsElement, filters: ActiveFeatureFilters): boolean {
   const rowSource = row.dataset.source || '';
   const rowSR = row.dataset.srGroup || '';
   const rowOS = row.dataset.osGroup || '';
   const rowBrowserType = row.dataset.browserType || '';
   const matchesSource = filters.source === 'all' || rowSource === filters.source;
   const matchesSR = filters.sr === 'all' || rowSR === filters.sr;
   const matchesOS = filters.os === 'all' || rowOS === filters.os;
   const matchesBrowserType =
      filters.browserType === 'all' || rowBrowserType === filters.browserType;
   return matchesSource && matchesSR && matchesOS && matchesBrowserType;
}

function updateGroupVisibility(groupEl: HTMLElement): number {
   const osBlocks = [...groupEl.querySelectorAll('[data-os-group-block]')].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
   );
   let groupVisible = 0;

   for (const osBlock of osBlocks) {
      const osRows = [...osBlock.querySelectorAll('[data-env-row]')].filter(
         (el): el is HTMLDetailsElement => el instanceof HTMLDetailsElement,
      );
      const visibleInOs = osRows.filter((row) => !row.hidden).length;
      osBlock.hidden = visibleInOs === 0;
      groupVisible += visibleInOs;
   }

   groupEl.hidden = groupVisible === 0;

   const countBadge = groupEl.querySelector('[data-sr-group-count]');
   if (countBadge instanceof HTMLElement) {
      const noun = groupVisible === 1 ? 'result' : 'results';
      countBadge.textContent = `${String(groupVisible)} ${noun}`;
   }

   return groupVisible;
}

function applyFeatureFilters(elements: FeatureFilterElements, updateURL: boolean): void {
   const filters: ActiveFeatureFilters = {
      source: elements.sourceSelect?.value || 'all',
      sr: elements.srSelect?.value || 'all',
      os: elements.osSelect?.value || 'all',
      browserType: elements.browserTypeSelect?.value || 'all',
   };

   for (const row of elements.rows) {
      row.hidden = !matchesRow(row, filters);
   }

   let totalVisible = 0;
   for (const groupEl of elements.groups) {
      totalVisible += updateGroupVisibility(groupEl);
   }

   if (elements.countLabel) {
      const total = elements.rows.length;
      const noun = total === 1 ? 'result' : 'results';
      elements.countLabel.textContent = `Showing ${String(totalVisible)} of ${String(total)} ${noun}`;
   }

   if (elements.emptyState) {
      elements.emptyState.hidden = totalVisible > 0;
   }

   if (updateURL) {
      syncFiltersToURL(filters);
   }
}

export function initFeatureDetailFilters(): void {
   const elements = getElements();
   if (elements.rows.length === 0) {
      return;
   }

   readFiltersFromURL(elements);
   applyFeatureFilters(elements, false);

   const handleChange = (): void => {
      applyFeatureFilters(elements, true);
   };

   elements.sourceSelect?.addEventListener('change', handleChange);
   elements.srSelect?.addEventListener('change', handleChange);
   elements.osSelect?.addEventListener('change', handleChange);
   elements.browserTypeSelect?.addEventListener('change', handleChange);

   elements.resetButton?.addEventListener('click', () => {
      if (elements.sourceSelect) {
         elements.sourceSelect.value = 'all';
      }
      if (elements.srSelect) {
         elements.srSelect.value = 'all';
      }
      if (elements.osSelect) {
         elements.osSelect.value = 'all';
      }
      if (elements.browserTypeSelect) {
         elements.browserTypeSelect.value = 'all';
      }
      applyFeatureFilters(elements, true);
   });
}

initFeatureDetailFilters();

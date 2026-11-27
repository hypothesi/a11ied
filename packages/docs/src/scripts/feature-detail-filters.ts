import { formatGroupCount } from '../lib/support-rows';

/** The page shows the same results grouped two ways, and one grouping at a time. */
type ResultsView = 'test' | 'screen-reader';

const DEFAULT_VIEW: ResultsView = 'test',
   VIEW_PARAM = 'group';

interface FeatureFilterElements {
   readonly srSelect: HTMLSelectElement | undefined;
   readonly osSelect: HTMLSelectElement | undefined;
   readonly browserTypeSelect: HTMLSelectElement | undefined;
   readonly resetButton: HTMLButtonElement | undefined;
   readonly countLabel: HTMLElement | undefined;
   readonly emptyState: HTMLElement | undefined;
   readonly views: readonly HTMLElement[];
   readonly viewButtons: readonly HTMLButtonElement[];
   readonly rows: readonly HTMLDetailsElement[];
}

function isResultsView(value: string | undefined): value is ResultsView {
   return value === 'test' || value === 'screen-reader';
}

function listElements(root: ParentNode, selector: string): HTMLElement[] {
   return [...root.querySelectorAll(selector)].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
   );
}

function listRows(root: ParentNode): HTMLDetailsElement[] {
   return [...root.querySelectorAll('[data-env-row]')].filter(
      (el): el is HTMLDetailsElement => el instanceof HTMLDetailsElement,
   );
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
   const viewEls = listElements(document, '[data-results-view]');
   const viewButtons = [
      ...document.querySelectorAll('[data-results-view-button]'),
   ].filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
   const rowEls = viewEls.flatMap((view) => listRows(view));

   return {
      srSelect: querySelectElement('#sr-feature-sr'),
      osSelect: querySelectElement('#sr-feature-os'),
      browserTypeSelect: querySelectElement('#sr-feature-browser-type'),
      resetButton: queryButtonElement('#sr-feature-reset'),
      countLabel: queryHtmlElement('#sr-feature-count'),
      emptyState: queryHtmlElement('#sr-feature-empty'),
      views: viewEls,
      viewButtons,
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
   readonly sr: string;
   readonly os: string;
   readonly browserType: string;
}

function readFiltersFromURL(elements: FeatureFilterElements): void {
   const params = new URLSearchParams(globalThis.location.search);
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
   setOrDeleteParam(url, 'sr', filters.sr);
   setOrDeleteParam(url, 'os', filters.os);
   setOrDeleteParam(url, 'browserType', filters.browserType);
   globalThis.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function matchesRow(row: HTMLDetailsElement, filters: ActiveFeatureFilters): boolean {
   const rowSR = row.dataset.srGroup || '';
   const rowOS = row.dataset.osGroup || '';
   const rowBrowserType = row.dataset.browserType || '';
   const matchesSR = filters.sr === 'all' || rowSR === filters.sr;
   const matchesOS = filters.os === 'all' || rowOS === filters.os;
   const matchesBrowserType =
      filters.browserType === 'all' || rowBrowserType === filters.browserType;
   return matchesSR && matchesOS && matchesBrowserType;
}

function listVisibleRows(container: ParentNode): HTMLDetailsElement[] {
   return listRows(container).filter((row) => !row.hidden);
}

function updateGroupVisibility(groupEl: HTMLElement): number {
   const visibleOutcomes = listVisibleRows(groupEl).map(
      (row) => row.dataset.outcome ?? '',
   );

   for (const osBlock of listElements(groupEl, '[data-os-group-block]')) {
      osBlock.hidden = listVisibleRows(osBlock).length === 0;
   }

   groupEl.hidden = visibleOutcomes.length === 0;

   const countBadge = groupEl.querySelector('[data-result-group-count]');
   if (countBadge instanceof HTMLElement) {
      countBadge.textContent = formatGroupCount(visibleOutcomes, 'result');
   }

   return visibleOutcomes.length;
}

function applyFeatureFilters(elements: FeatureFilterElements, updateURL: boolean): void {
   const filters: ActiveFeatureFilters = {
      sr: elements.srSelect?.value || 'all',
      os: elements.osSelect?.value || 'all',
      browserType: elements.browserTypeSelect?.value || 'all',
   };

   for (const row of elements.rows) {
      row.hidden = !matchesRow(row, filters);
   }

   for (const groupEl of listElements(
      document,
      '[data-results-view] [data-result-group]',
   )) {
      updateGroupVisibility(groupEl);
   }

   // Each grouping has its own rows, so the count is of the one on screen.
   const activeView = elements.views.find((view) => !view.hidden);
   const total = activeView ? activeView.querySelectorAll('[data-env-row]').length : 0;
   const totalVisible = activeView ? listVisibleRows(activeView).length : 0;

   if (elements.countLabel) {
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

/**
 * A result is in the page once. It sits under its test by default and moves into its
 * environment's row for the screen reader grouping.
 */
function moveUnits(view: ResultsView): void {
   const targetAttribute = view === 'test' ? 'data-unit-home' : 'data-unit-slot';

   for (const unit of listElements(document, '[data-unit]')) {
      const unitID = unit.dataset.unit ?? '';
      const target = document.querySelector(
         `[${targetAttribute}="${CSS.escape(unitID)}"]`,
      );
      // A row that lists several tests keeps each test's log and assertions closed.
      const isAlone =
         (target?.parentElement?.querySelectorAll('[data-unit-slot]').length ?? 0) <= 1;

      target?.append(unit);
      for (const disclosure of unit.querySelectorAll('.srTranscript, .srAssert')) {
         if (disclosure instanceof HTMLDetailsElement) {
            disclosure.open = isAlone;
         }
      }
   }
}

function showView(
   elements: FeatureFilterElements,
   view: ResultsView,
   updateURL: boolean,
): void {
   for (const viewEl of elements.views) {
      viewEl.hidden = viewEl.dataset.resultsView !== view;
   }
   for (const button of elements.viewButtons) {
      button.setAttribute(
         'aria-pressed',
         button.dataset.resultsViewButton === view ? 'true' : 'false',
      );
   }
   moveUnits(view);

   if (updateURL) {
      const url = new URL(globalThis.location.href);

      if (view === DEFAULT_VIEW) {
         url.searchParams.delete(VIEW_PARAM);
      } else {
         url.searchParams.set(VIEW_PARAM, view);
      }
      globalThis.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
   }

   applyFeatureFilters(elements, false);
}

export function initFeatureDetailFilters(): void {
   const elements = getElements();
   if (elements.rows.length === 0) {
      return;
   }

   const requestedView =
      new URLSearchParams(globalThis.location.search).get(VIEW_PARAM) ?? undefined;

   readFiltersFromURL(elements);
   showView(elements, isResultsView(requestedView) ? requestedView : DEFAULT_VIEW, false);

   for (const button of elements.viewButtons) {
      button.addEventListener('click', () => {
         const view = button.dataset.resultsViewButton;

         if (isResultsView(view)) {
            showView(elements, view, true);
         }
      });
   }

   const handleChange = (): void => {
      applyFeatureFilters(elements, true);
   };

   elements.srSelect?.addEventListener('change', handleChange);
   elements.osSelect?.addEventListener('change', handleChange);
   elements.browserTypeSelect?.addEventListener('change', handleChange);

   elements.resetButton?.addEventListener('click', () => {
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

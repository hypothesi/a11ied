import type { TestOutcome } from '@a11ied/support-data/types';

interface ParsedFeatureVerdict {
   readonly status: string;
   readonly matchedKeys: readonly string[];
   readonly untestedCount: number;
}

interface ParsedFeatureCard {
   readonly element: HTMLElement;
   readonly searchText: string;
   readonly type: string;
   readonly browserslistMap: Readonly<Record<string, ParsedFeatureVerdict>>;
   readonly verdictRowEl: HTMLElement | undefined;
   readonly verdictEl: HTMLElement | undefined;
   readonly verdictDotEl: HTMLElement | undefined;
   readonly envCells: readonly HTMLButtonElement[];
   readonly toggleBtn: HTMLButtonElement | undefined;
   readonly detailEl: HTMLElement | undefined;
}

interface FeatureFilterState {
   readonly query: string;
   readonly preset: string;
   readonly type: string;
}

interface ParsedTestRow {
   readonly element: HTMLTableRowElement;
   readonly searchText: string;
   readonly category: string;
   readonly attribute: string;
   readonly outcomes: Readonly<Record<string, TestOutcome>>;
}

interface TestFilterState {
   readonly query: string;
   readonly category: string;
   readonly attribute: string;
   readonly browserType: string;
   readonly environment: string;
   readonly outcome: string;
}

interface TileDetailData {
   readonly title: string;
   readonly meta: string;
   readonly verdict: string;
   readonly state: string;
   readonly href: string;
}

const DEBOUNCE_MS = 200;
/** A search that leaves this many features or fewer opens them, as the answer. */
const AUTO_OPEN_MAX = 3;

const BL_STATUS_LABELS: Readonly<Record<string, string>> = {
   supported: 'Supported in target',
   partial: 'Partial in target',
   unsupported: 'Fails MUST in target',
   untested: 'Untested in target',
};

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTestOutcome(value: unknown): value is TestOutcome {
   return (
      value === 'pass' ||
      value === 'partial' ||
      value === 'fail' ||
      value === 'not-applicable' ||
      value === 'untested'
   );
}

function parseJsonRecord(rawJSON: string | undefined): Record<string, unknown> {
   if (!rawJSON) {
      return {};
   }
   try {
      const parsed: unknown = JSON.parse(rawJSON);
      return isRecord(parsed) ? parsed : {};
   } catch {
      return {};
   }
}

function parseStringRecord(
   rawJSON: string | undefined,
): Readonly<Record<string, string>> {
   const parsed = parseJsonRecord(rawJSON);
   const result: Record<string, string> = {};
   for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string') {
         result[key] = val;
      }
   }
   return result;
}

function parseRowOutcomes(
   rawJSON: string | undefined,
): Readonly<Record<string, TestOutcome>> {
   const parsed = parseJsonRecord(rawJSON);
   const normalized: Record<string, TestOutcome> = {};
   for (const [key, val] of Object.entries(parsed)) {
      if (isTestOutcome(val)) {
         normalized[key] = val;
      }
   }
   return normalized;
}

function parseFeatureVerdicts(
   rawJSON: string | undefined,
): Readonly<Record<string, ParsedFeatureVerdict>> {
   const parsed = parseJsonRecord(rawJSON);
   const result: Record<string, ParsedFeatureVerdict> = {};

   for (const [presetID, rawEntry] of Object.entries(parsed)) {
      if (!isRecord(rawEntry) || typeof rawEntry.status !== 'string') {
         continue;
      }
      const matchedKeys = Array.isArray(rawEntry.matchedKeys)
         ? rawEntry.matchedKeys.filter((item): item is string => typeof item === 'string')
         : [];
      const untestedCount =
         typeof rawEntry.untestedCount === 'number' ? rawEntry.untestedCount : 0;
      result[presetID] = {
         status: rawEntry.status,
         matchedKeys,
         untestedCount,
      };
   }

   return result;
}

function parseTileDetail(rawJSON: string | undefined): TileDetailData | undefined {
   const parsed = parseJsonRecord(rawJSON);
   if (
      typeof parsed.title === 'string' &&
      typeof parsed.meta === 'string' &&
      typeof parsed.verdict === 'string' &&
      typeof parsed.state === 'string' &&
      typeof parsed.href === 'string'
   ) {
      return {
         title: parsed.title,
         meta: parsed.meta,
         verdict: parsed.verdict,
         state: parsed.state,
         href: parsed.href,
      };
   }
   return undefined;
}

function syncPairsToURL(pairs: readonly (readonly [string, string])[]): void {
   const url = new URL(globalThis.location.href);
   for (const [key, value] of pairs) {
      if (value === '') {
         url.searchParams.delete(key);
      } else {
         url.searchParams.set(key, value);
      }
   }
   globalThis.history.replaceState({}, '', url.toString());
}

function restoreControlValue(
   control: HTMLInputElement | HTMLSelectElement,
   paramName: string,
): void {
   const val = new URLSearchParams(globalThis.location.search).get(paramName);
   if (val !== null) {
      control.value = val;
   }
}

interface ViewTabsState {
   readonly tabs: readonly HTMLButtonElement[];
   readonly panels: readonly HTMLElement[];
}

function activateViewTab(
   state: ViewTabsState,
   targetPanelID: string,
   focusTab = false,
): void {
   for (const tab of state.tabs) {
      const ownsPanel = tab.dataset.panelTarget === targetPanelID;
      tab.setAttribute('aria-selected', ownsPanel ? 'true' : 'false');
      tab.tabIndex = ownsPanel ? 0 : -1;
      if (ownsPanel && focusTab) {
         tab.focus();
      }
   }

   for (const panel of state.panels) {
      panel.hidden = panel.id !== targetPanelID;
   }
}

function resolveTabIndexForKey(
   key: string,
   currentIndex: number,
   total: number,
): number | undefined {
   switch (key) {
      case 'ArrowRight': {
         return (currentIndex + 1) % total;
      }
      case 'ArrowLeft': {
         return (currentIndex - 1 + total) % total;
      }
      case 'Home': {
         return 0;
      }
      case 'End': {
         return total - 1;
      }
      default: {
         return undefined;
      }
   }
}

function initViewTabs(): void {
   const tablist = document.querySelector('#ciu-tablist');
   if (!(tablist instanceof HTMLElement)) {
      return;
   }
   const tabNodes = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
   const panelNodes = [...document.querySelectorAll<HTMLElement>('[data-ciu-panel]')];
   if (tabNodes.length === 0 || panelNodes.length === 0) {
      return;
   }

   const state: ViewTabsState = {
      tabs: tabNodes,
      panels: panelNodes,
   };

   const activateFromHash = (): void => {
      const hashID = globalThis.location.hash.replace(/^#/u, '');
      const hasMatch = state.panels.some((panel) => panel.id === hashID);
      if (hasMatch) {
         activateViewTab(state, hashID, false);
      }
   };

   activateFromHash();
   globalThis.addEventListener('hashchange', activateFromHash);

   for (const [index, tab] of state.tabs.entries()) {
      tab.addEventListener('click', () => {
         const targetID = tab.dataset.panelTarget;
         if (targetID) {
            activateViewTab(state, targetID, false);
         }
      });

      tab.addEventListener('keydown', (event) => {
         const nextIndex = resolveTabIndexForKey(event.key, index, state.tabs.length);
         if (nextIndex === undefined) {
            return;
         }
         event.preventDefault();
         const nextTab = state.tabs[nextIndex];
         const targetID = nextTab?.dataset.panelTarget;
         if (targetID) {
            activateViewTab(state, targetID, true);
         }
      });
   }
}

function closeCardDrawer(cardEl: HTMLElement): void {
   const drawer = cardEl.querySelector('[data-ciu-detail]');
   if (drawer instanceof HTMLElement) {
      drawer.hidden = true;
   }
   for (const tile of cardEl.querySelectorAll<HTMLButtonElement>('.ciuTile')) {
      tile.setAttribute('aria-expanded', 'false');
   }
}

function openCardDrawer(
   cardEl: HTMLElement,
   tileBtn: HTMLButtonElement,
   detail: TileDetailData,
): void {
   const drawer = cardEl.querySelector('[data-ciu-detail]');
   if (!(drawer instanceof HTMLElement)) {
      return;
   }

   const wasOpen = tileBtn.getAttribute('aria-expanded') === 'true';
   closeCardDrawer(cardEl);
   if (wasOpen) {
      return;
   }

   tileBtn.setAttribute('aria-expanded', 'true');
   drawer.dataset.state = detail.state;
   const titleEl = drawer.querySelector('[data-ciu-detail-title]');
   const metaEl = drawer.querySelector('[data-ciu-detail-meta]');
   const verdictEl = drawer.querySelector('[data-ciu-detail-verdict]');
   const linkEl = drawer.querySelector('[data-ciu-detail-link]');

   if (titleEl instanceof HTMLElement) {
      titleEl.textContent = detail.title;
   }
   if (metaEl instanceof HTMLElement) {
      metaEl.textContent = detail.meta;
   }
   if (verdictEl instanceof HTMLElement) {
      verdictEl.textContent = detail.verdict;
   }
   if (linkEl instanceof HTMLAnchorElement) {
      linkEl.setAttribute('href', detail.href);
   }

   drawer.hidden = false;
}

function initTileDetails(): void {
   const cards = document.querySelectorAll<HTMLElement>('[data-ciu-card]');
   for (const cardEl of cards) {
      const tiles = cardEl.querySelectorAll<HTMLButtonElement>('.ciuTile');
      for (const tileBtn of tiles) {
         tileBtn.addEventListener('click', () => {
            const detail = parseTileDetail(tileBtn.dataset.tileDetail);
            if (detail) {
               openCardDrawer(cardEl, tileBtn, detail);
            }
         });
      }

      const closeBtn = cardEl.querySelector('[data-ciu-detail-close]');
      if (closeBtn instanceof HTMLButtonElement) {
         closeBtn.addEventListener('click', () => closeCardDrawer(cardEl));
      }
   }
}

function isCardOpen(card: ParsedFeatureCard): boolean {
   return card.toggleBtn?.getAttribute('aria-expanded') === 'true';
}

function setCardOpen(card: ParsedFeatureCard, isOpen: boolean): void {
   if (!card.toggleBtn || !card.detailEl) {
      return;
   }
   card.toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
   card.detailEl.hidden = !isOpen;
   delete card.element.dataset.autoOpen;
   if (!isOpen) {
      closeCardDrawer(card.element);
   }
}

/** Opens the few features a search leaves, and closes them again when it widens. */
function syncAutoOpenCards(cards: readonly ParsedFeatureCard[], hasQuery: boolean): void {
   const visibleCards = cards.filter((card) => !card.element.hidden);
   const shouldOpen = hasQuery && visibleCards.length <= AUTO_OPEN_MAX;

   for (const card of cards) {
      const isAutoOpen = card.element.dataset.autoOpen === 'true';

      if (shouldOpen && !card.element.hidden && !isCardOpen(card)) {
         setCardOpen(card, true);
         card.element.dataset.autoOpen = 'true';
      } else if (isAutoOpen && (!shouldOpen || card.element.hidden)) {
         setCardOpen(card, false);
      }
   }
}

function updateExpandAllLabel(elements: HeroElements): void {
   const visibleCards = elements.cards.filter((card) => !card.element.hidden);
   const isAllOpen =
      visibleCards.length > 0 && visibleCards.every((card) => isCardOpen(card));

   if (elements.expandAllBtn) {
      elements.expandAllBtn.dataset.expanded = isAllOpen ? 'true' : 'false';
      elements.expandAllBtn.textContent = isAllOpen ? 'Collapse all' : 'Expand all';
   }
}

function initCardToggles(elements: HeroElements): void {
   for (const card of elements.cards) {
      const rowEl = card.element.querySelector('[data-ciu-row]');

      card.toggleBtn?.addEventListener('click', () => {
         setCardOpen(card, !isCardOpen(card));
         updateExpandAllLabel(elements);
      });

      // A click anywhere on the row toggles it, except on the row's own link or button.
      rowEl?.addEventListener('click', (event) => {
         const isOwnControl =
            event.target instanceof Element && event.target.closest('a, button');

         if (!isOwnControl && (globalThis.getSelection()?.isCollapsed ?? true)) {
            setCardOpen(card, !isCardOpen(card));
            updateExpandAllLabel(elements);
         }
      });
   }

   elements.expandAllBtn?.addEventListener('click', () => {
      const shouldOpen = elements.expandAllBtn?.dataset.expanded !== 'true';

      for (const card of elements.cards) {
         if (!card.element.hidden) {
            setCardOpen(card, shouldOpen);
         }
      }
      updateExpandAllLabel(elements);
   });
}

interface HeroElements {
   readonly searchInput: HTMLInputElement;
   readonly presetSelect: HTMLSelectElement;
   readonly typeSelect: HTMLSelectElement;
   readonly resetBtn: HTMLButtonElement;
   readonly expandAllBtn: HTMLButtonElement | undefined;
   readonly tableEl: HTMLElement | undefined;
   readonly statusEl: HTMLElement | undefined;
   readonly emptyEl: HTMLElement | undefined;
   readonly pairMatrixEl: HTMLElement | undefined;
   readonly blBannerEl: HTMLElement | undefined;
   readonly blBannerTextEl: HTMLElement | undefined;
   readonly blMetaMap: Readonly<Record<string, string>>;
   readonly cards: readonly ParsedFeatureCard[];
   readonly exampleButtons: readonly HTMLButtonElement[];
}

function queryHeroElements(): HeroElements | undefined {
   const searchInput = document.querySelector('#ciu-search');
   const presetSelect = document.querySelector('#ciu-browserslist');
   const typeSelect = document.querySelector('#ciu-type');
   const resetBtn = document.querySelector('#ciu-reset');

   if (
      !(searchInput instanceof HTMLInputElement) ||
      !(presetSelect instanceof HTMLSelectElement) ||
      !(typeSelect instanceof HTMLSelectElement) ||
      !(resetBtn instanceof HTMLButtonElement)
   ) {
      return undefined;
   }

   const expandAllBtn = document.querySelector('#ciu-expand-all');
   const tableEl = document.querySelector('#ciu-features-table');
   const statusEl = document.querySelector('#ciu-status');
   const emptyEl = document.querySelector('#ciu-empty');
   const pairMatrixEl = document.querySelector('#ciu-pair-matrix');
   const blBannerEl = document.querySelector('#ciu-bl-banner');
   const blBannerTextEl = document.querySelector('#ciu-bl-banner-text');
   const cardNodes = [...document.querySelectorAll<HTMLElement>('[data-ciu-card]')];
   const exampleButtons = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-ciu-example]'),
   ];

   const cards: ParsedFeatureCard[] = cardNodes.map((element) => {
      const verdictRowEl = element.querySelector('[data-ciu-verdict-row]');
      const verdictEl = element.querySelector('[data-ciu-verdict]');
      const verdictDotEl = element.querySelector('[data-ciu-verdict-dot]');
      const toggleBtn = element.querySelector('[data-ciu-toggle]');
      const detailEl = element.querySelector('[data-ciu-feature-detail]');
      return {
         element,
         searchText: (element.dataset.search ?? '').toLowerCase(),
         type: element.dataset.type ?? '',
         browserslistMap: parseFeatureVerdicts(element.dataset.browserslist),
         verdictRowEl: verdictRowEl instanceof HTMLElement ? verdictRowEl : undefined,
         verdictEl: verdictEl instanceof HTMLElement ? verdictEl : undefined,
         verdictDotEl: verdictDotEl instanceof HTMLElement ? verdictDotEl : undefined,
         envCells: [...element.querySelectorAll<HTMLButtonElement>('[data-env-key]')],
         toggleBtn: toggleBtn instanceof HTMLButtonElement ? toggleBtn : undefined,
         detailEl: detailEl instanceof HTMLElement ? detailEl : undefined,
      };
   });

   return {
      searchInput,
      presetSelect,
      typeSelect,
      resetBtn,
      expandAllBtn: expandAllBtn instanceof HTMLButtonElement ? expandAllBtn : undefined,
      tableEl: tableEl instanceof HTMLElement ? tableEl : undefined,
      statusEl: statusEl instanceof HTMLElement ? statusEl : undefined,
      emptyEl: emptyEl instanceof HTMLElement ? emptyEl : undefined,
      pairMatrixEl: pairMatrixEl instanceof HTMLElement ? pairMatrixEl : undefined,
      blBannerEl: blBannerEl instanceof HTMLElement ? blBannerEl : undefined,
      blBannerTextEl: blBannerTextEl instanceof HTMLElement ? blBannerTextEl : undefined,
      blMetaMap: parseStringRecord(
         blBannerEl instanceof HTMLElement
            ? blBannerEl.dataset.presetSummaries
            : undefined,
      ),
      cards,
      exampleButtons,
   };
}

function updateCardBrowserslistHighlight(
   card: ParsedFeatureCard,
   presetID: string,
): void {
   const verdict = presetID === 'all' ? undefined : card.browserslistMap[presetID];

   if (card.verdictRowEl) {
      card.verdictRowEl.hidden = verdict === undefined;
   }

   if (card.verdictEl) {
      card.verdictEl.textContent = verdict
         ? (BL_STATUS_LABELS[verdict.status] ?? verdict.status)
         : '';
   }

   if (card.verdictDotEl) {
      card.verdictDotEl.classList.remove(
         'ciuVerdictDot--supported',
         'ciuVerdictDot--partial',
         'ciuVerdictDot--unsupported',
         'ciuVerdictDot--untested',
      );
      if (verdict) {
         card.verdictDotEl.classList.add(`ciuVerdictDot--${verdict.status}`);
      }
   }

   const matchedSet = verdict ? new Set(verdict.matchedKeys) : undefined;
   for (const cell of card.envCells) {
      const envKey = cell.dataset.envKey ?? '';
      const isDim = matchedSet !== undefined && !matchedSet.has(envKey);
      cell.classList.toggle('ciuTile--dim', isDim);
   }
}

function matchesFeatureCard(card: ParsedFeatureCard, state: FeatureFilterState): boolean {
   if (state.type !== 'all' && card.type !== state.type) {
      return false;
   }
   if (state.query !== '' && !card.searchText.includes(state.query)) {
      return false;
   }
   return true;
}

function updateBrowserslistBanner(elements: HeroElements, presetID: string): void {
   if (!elements.blBannerEl) {
      return;
   }
   const summary = presetID === 'all' ? undefined : elements.blMetaMap[presetID];
   if (!summary) {
      elements.blBannerEl.hidden = true;
      return;
   }
   elements.blBannerEl.hidden = false;
   if (elements.blBannerTextEl) {
      elements.blBannerTextEl.textContent = summary;
   }
}

function readHeroFilterState(elements: HeroElements): FeatureFilterState {
   return {
      query: elements.searchInput.value.trim().toLowerCase(),
      preset: elements.presetSelect.value,
      type: elements.typeSelect.value,
   };
}

function initFeatureSearch(): void {
   const queried = queryHeroElements();
   if (!queried) {
      return;
   }
   const elements: HeroElements = queried;

   initCardToggles(elements);
   restoreControlValue(elements.searchInput, 'q');
   restoreControlValue(elements.presetSelect, 'bl');
   restoreControlValue(elements.typeSelect, 'ftype');

   let statusTimer: ReturnType<typeof globalThis.setTimeout> | undefined = undefined;

   const updateStatusText = (visibleCount: number, immediate: boolean): void => {
      if (!elements.statusEl) {
         return;
      }
      if (statusTimer !== undefined) {
         globalThis.clearTimeout(statusTimer);
      }
      const statusNode = elements.statusEl;
      const apply = (): void => {
         const noun = elements.cards.length === 1 ? 'feature' : 'features';
         statusNode.textContent = `Showing ${String(visibleCount)} of ${String(elements.cards.length)} ${noun}.`;
      };
      if (immediate) {
         apply();
      } else {
         statusTimer = globalThis.setTimeout(apply, DEBOUNCE_MS);
      }
   };

   const applyFilters = (immediateStatus = true, updateURL = true): void => {
      const state = readHeroFilterState(elements);
      let visibleCount = 0;

      for (const card of elements.cards) {
         const visible = matchesFeatureCard(card, state);
         card.element.hidden = !visible;
         if (visible) {
            visibleCount += 1;
         }
         updateCardBrowserslistHighlight(card, state.preset);
      }

      if (elements.emptyEl) {
         elements.emptyEl.hidden = visibleCount > 0;
      }
      if (elements.tableEl) {
         elements.tableEl.hidden = visibleCount === 0;
      }

      // A search moves the matching features up to the search box.
      if (elements.pairMatrixEl) {
         elements.pairMatrixEl.hidden = state.query !== '';
      }

      syncAutoOpenCards(elements.cards, state.query !== '');
      updateExpandAllLabel(elements);

      updateBrowserslistBanner(elements, state.preset);

      if (updateURL) {
         syncPairsToURL([
            ['q', state.query],
            ['bl', state.preset === 'all' ? '' : state.preset],
            ['ftype', state.type === 'all' ? '' : state.type],
         ]);
      }

      updateStatusText(visibleCount, immediateStatus);
   };

   elements.searchInput.addEventListener('input', () => applyFilters(false, true));
   for (const selectEl of [elements.presetSelect, elements.typeSelect]) {
      selectEl.addEventListener('change', () => applyFilters(true, true));
   }

   for (const chipBtn of elements.exampleButtons) {
      chipBtn.addEventListener('click', () => {
         elements.searchInput.value = chipBtn.dataset.ciuExample ?? '';
         applyFilters(true, true);
         elements.searchInput.focus();
      });
   }

   elements.resetBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      elements.presetSelect.value = 'all';
      elements.typeSelect.value = 'all';
      applyFilters(true, true);
      elements.searchInput.focus();
   });

   applyFilters(true, false);
}

interface TestTableElements {
   readonly searchInput: HTMLInputElement;
   readonly categorySelect: HTMLSelectElement;
   readonly attributeSelect: HTMLSelectElement;
   readonly browserTypeSelect: HTMLSelectElement;
   readonly envSelect: HTMLSelectElement;
   readonly outcomeSelect: HTMLSelectElement;
   readonly resetBtn: HTMLButtonElement;
   readonly moreFiltersEl: HTMLDetailsElement | undefined;
   readonly moreCountEl: HTMLElement | undefined;
   readonly statusEl: HTMLElement | undefined;
   readonly emptyEl: HTMLElement | undefined;
   readonly tableWrap: HTMLElement | undefined;
}

function queryTestTableElements(): TestTableElements | undefined {
   const searchInput = document.querySelector('#sr-search');
   const categorySelect = document.querySelector('#sr-category');
   const attributeSelect = document.querySelector('#sr-attribute');
   const browserTypeSelect = document.querySelector('#sr-browser-type');
   const envSelect = document.querySelector('#sr-environment');
   const outcomeSelect = document.querySelector('#sr-outcome');
   const resetBtn = document.querySelector('#sr-reset');
   const moreFiltersEl = document.querySelector('#sr-more-filters');
   const moreCountEl = document.querySelector('#sr-more-filters-count');
   const statusEl = document.querySelector('#sr-filter-status');
   const emptyEl = document.querySelector('#sr-empty-state');
   const tableWrap = document.querySelector('.srIndex-tableWrap');

   if (
      !(searchInput instanceof HTMLInputElement) ||
      !(categorySelect instanceof HTMLSelectElement) ||
      !(attributeSelect instanceof HTMLSelectElement) ||
      !(browserTypeSelect instanceof HTMLSelectElement) ||
      !(envSelect instanceof HTMLSelectElement) ||
      !(outcomeSelect instanceof HTMLSelectElement) ||
      !(resetBtn instanceof HTMLButtonElement)
   ) {
      return undefined;
   }

   return {
      searchInput,
      categorySelect,
      attributeSelect,
      browserTypeSelect,
      envSelect,
      outcomeSelect,
      resetBtn,
      moreFiltersEl:
         moreFiltersEl instanceof HTMLDetailsElement ? moreFiltersEl : undefined,
      moreCountEl: moreCountEl instanceof HTMLElement ? moreCountEl : undefined,
      statusEl: statusEl instanceof HTMLElement ? statusEl : undefined,
      emptyEl: emptyEl instanceof HTMLElement ? emptyEl : undefined,
      tableWrap: tableWrap instanceof HTMLElement ? tableWrap : undefined,
   };
}

function matchesTestRow(
   row: ParsedTestRow,
   state: TestFilterState,
   envTypes: Readonly<Record<string, string>>,
): boolean {
   if (state.category !== 'all' && row.category !== state.category) {
      return false;
   }
   if (state.attribute !== 'all' && row.attribute !== state.attribute) {
      return false;
   }
   if (state.query !== '' && !row.searchText.includes(state.query)) {
      return false;
   }

   const candidateEnvIDs = Object.keys(row.outcomes).filter((envID) => {
      if (state.environment !== 'all' && envID !== state.environment) {
         return false;
      }
      if (state.browserType !== 'all' && envTypes[envID] !== state.browserType) {
         return false;
      }
      return true;
   });

   if (candidateEnvIDs.length === 0) {
      return false;
   }

   if (state.outcome !== 'all') {
      return candidateEnvIDs.some((envID) => row.outcomes[envID] === state.outcome);
   }

   return true;
}

/**
 * A filter inside the closed "More filters" group still narrows the table, so the group
 * says how many of its filters are set.
 */
function updateMoreFiltersCount(
   elements: TestTableElements,
   state: TestFilterState,
): number {
   const activeCount = [state.category, state.browserType, state.environment].filter(
      (value) => value !== 'all',
   ).length;

   if (elements.moreCountEl) {
      elements.moreCountEl.hidden = activeCount === 0;
      elements.moreCountEl.textContent = `(${String(activeCount)} set)`;
   }

   return activeCount;
}

function initTestCaseFilters(): void {
   const queried = queryTestTableElements();
   if (!queried) {
      return;
   }
   const elements: TestTableElements = queried;

   const rowNodes = document.querySelectorAll<HTMLTableRowElement>('tr[data-sr-row]');
   const envTypes = parseStringRecord(elements.tableWrap?.dataset.envTypes);
   const parsedRows: ParsedTestRow[] = [...rowNodes].map((element) => ({
      element,
      searchText: (element.dataset.search ?? '').toLowerCase(),
      category: element.dataset.category ?? '',
      attribute: element.dataset.attribute ?? '',
      outcomes: parseRowOutcomes(element.dataset.outcomes),
   }));

   restoreControlValue(elements.searchInput, 'tq');
   restoreControlValue(elements.categorySelect, 'category');
   restoreControlValue(elements.attributeSelect, 'attribute');
   restoreControlValue(elements.browserTypeSelect, 'type');
   restoreControlValue(elements.envSelect, 'env');
   restoreControlValue(elements.outcomeSelect, 'outcome');

   let statusTimer: ReturnType<typeof globalThis.setTimeout> | undefined = undefined;

   const readState = (): TestFilterState => ({
      query: elements.searchInput.value.trim().toLowerCase(),
      category: elements.categorySelect.value,
      attribute: elements.attributeSelect.value,
      browserType: elements.browserTypeSelect.value,
      environment: elements.envSelect.value,
      outcome: elements.outcomeSelect.value,
   });

   const updateStatusText = (visibleCount: number, immediate: boolean): void => {
      if (!elements.statusEl) {
         return;
      }
      if (statusTimer !== undefined) {
         globalThis.clearTimeout(statusTimer);
      }
      const statusNode = elements.statusEl;
      const apply = (): void => {
         const noun = parsedRows.length === 1 ? 'test' : 'tests';
         statusNode.textContent = `Showing ${String(visibleCount)} of ${String(parsedRows.length)} ${noun}.`;
      };
      if (immediate) {
         apply();
      } else {
         statusTimer = globalThis.setTimeout(apply, DEBOUNCE_MS);
      }
   };

   const applyFilters = (immediateStatus = true, updateURL = true): void => {
      const state = readState();
      let visibleCount = 0;

      for (const row of parsedRows) {
         const visible = matchesTestRow(row, state, envTypes);
         row.element.hidden = !visible;
         if (visible) {
            visibleCount += 1;
         }
      }

      if (elements.emptyEl) {
         elements.emptyEl.hidden = visibleCount > 0;
      }

      updateMoreFiltersCount(elements, state);

      if (updateURL) {
         syncPairsToURL([
            ['tq', state.query],
            ['category', state.category === 'all' ? '' : state.category],
            ['attribute', state.attribute === 'all' ? '' : state.attribute],
            ['type', state.browserType === 'all' ? '' : state.browserType],
            ['env', state.environment === 'all' ? '' : state.environment],
            ['outcome', state.outcome === 'all' ? '' : state.outcome],
         ]);
      }

      updateStatusText(visibleCount, immediateStatus);
   };

   elements.searchInput.addEventListener('input', () => applyFilters(false, true));
   for (const selectEl of [
      elements.categorySelect,
      elements.attributeSelect,
      elements.browserTypeSelect,
      elements.envSelect,
      elements.outcomeSelect,
   ]) {
      selectEl.addEventListener('change', () => applyFilters(true, true));
   }

   elements.resetBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      elements.categorySelect.value = 'all';
      elements.attributeSelect.value = 'all';
      elements.browserTypeSelect.value = 'all';
      elements.envSelect.value = 'all';
      elements.outcomeSelect.value = 'all';
      applyFilters(true, true);
      elements.searchInput.focus();
   });

   applyFilters(true, false);

   if (elements.moreFiltersEl && updateMoreFiltersCount(elements, readState()) > 0) {
      elements.moreFiltersEl.open = true;
   }
}

function initSupportPage(): void {
   initViewTabs();
   initTileDetails();
   initFeatureSearch();
   initTestCaseFilters();
}

initSupportPage();
document.addEventListener('astro:page-load', initSupportPage);

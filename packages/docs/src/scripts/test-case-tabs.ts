interface SelectTabOptions {
   readonly tab: HTMLButtonElement;
   readonly tabs: readonly HTMLButtonElement[];
   readonly panels: readonly HTMLElement[];
   readonly moveFocus: boolean;
}

function selectTab({ tab, tabs, panels, moveFocus }: SelectTabOptions): void {
   const targetID = tab.id;
   for (const item of tabs) {
      const isSelected = item === tab;
      item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      item.setAttribute('tabindex', isSelected ? '0' : '-1');
   }

   for (const panel of panels) {
      const isMatch = panel.getAttribute('aria-labelledby') === targetID;
      if (isMatch) {
         panel.removeAttribute('hidden');
         if (panel.dataset.focusablePanel === 'true') {
            panel.setAttribute('tabindex', '0');
         } else {
            panel.removeAttribute('tabindex');
         }
      } else {
         panel.setAttribute('hidden', 'until-found');
         panel.removeAttribute('tabindex');
      }
   }

   if (moveFocus) {
      tab.focus();
   }
   tab.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
   });
}

function resolveNextTabIndex(
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

function wireTabContainer(container: HTMLElement): void {
   if (container.dataset.srTabsReady === 'true') {
      return;
   }
   container.dataset.srTabsReady = 'true';

   const tablist = container.querySelector('[role="tablist"]');
   if (!(tablist instanceof HTMLElement)) {
      return;
   }

   const tabs = [...tablist.querySelectorAll('[role="tab"]')].filter(
      (element): element is HTMLButtonElement => element instanceof HTMLButtonElement,
   );
   const panels = [...container.querySelectorAll('[role="tabpanel"]')].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
   );

   if (tabs.length === 0 || panels.length === 0) {
      return;
   }

   for (const tab of tabs) {
      tab.addEventListener('click', () => {
         selectTab({ tab, tabs, panels, moveFocus: false });
      });

      tab.addEventListener('keydown', (event: KeyboardEvent) => {
         const currentIndex = tabs.indexOf(tab);
         if (currentIndex === -1) {
            return;
         }
         const nextIndex = resolveNextTabIndex(event.key, currentIndex, tabs.length);
         if (nextIndex === undefined) {
            return;
         }
         event.preventDefault();
         const targetTab = tabs[nextIndex];
         if (targetTab) {
            selectTab({ tab: targetTab, tabs, panels, moveFocus: true });
         }
      });
   }

   for (const panel of panels) {
      panel.addEventListener('beforematch', () => {
         const labelID = panel.getAttribute('aria-labelledby');
         if (!labelID) {
            return;
         }
         const matchingTab = tabs.find((tab) => tab.id === labelID);
         if (matchingTab) {
            selectTab({ tab: matchingTab, tabs, panels, moveFocus: false });
         }
      });
   }
}

export function initTestCaseTabs(): void {
   const containers = [...document.querySelectorAll('[data-sr-tabs]')];
   for (const container of containers) {
      if (container instanceof HTMLElement) {
         wireTabContainer(container);
      }
   }
}

initTestCaseTabs();
document.addEventListener('astro:page-load', initTestCaseTabs);
